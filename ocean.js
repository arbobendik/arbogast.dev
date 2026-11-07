"use strict";

// The ocean behind the page: a coarse simulation of the water's flow and of the waves on it, drawn as broken lines,
// with ice sheets drifting on it, carried by the water and pushing it aside, and a moving mouse or pen stirring it.
// Lengths are fractions of the window's shorter side, times are in seconds.

// Simulation cells along the shorter side, steps per second and pressure solver iterations per step.
const OCEAN_CELLS = 128;
const OCEAN_STEP = 1 / 60;
const OCEAN_ITERATIONS = 12;
// Seconds simulated before the ocean is first drawn, so the swell has already rolled in.
const OCEAN_WARMUP = 10;
// Drawn at the screen's own resolution, but at most OCEAN_DENSITY pixels per CSS pixel, its lines fading out over
// OCEAN_LINE_WIDTH CSS pixels to either side, with this many lines along the shorter side.
const OCEAN_DENSITY = 2;
const OCEAN_LINE_WIDTH = 2;
const OCEAN_LINES = 30;
// How strongly the lines show, faint enough to stay behind the text, and how far the light reaches, per shorter side.
const OCEAN_INK = .13;
const OCEAN_GLOW = .6;
// How far the ocean reaches above and below the window, as a fraction of its height, so scrolling ahead of it never shows its end.
const OCEAN_OVERSCAN = .25;
// Seconds the page has to rest after scrolling before the water under the sheets is read back again, and between two readings,
// as each waits on the gpu, while the sheets take longer than that to follow the water anyway.
const OCEAN_REST = .25;
const OCEAN_READ_PAUSE = .2;
// The current all water returns to by this fraction per step, flowing right, so sheets come in from the left.
const OCEAN_CURRENT = [.02, .002];
const OCEAN_CALM = .005;
// The wave speed squared in cells per step, and how much of the waves' speed is left after a step.
const WAVE_SPEED = .05;
const WAVE_KEEP = .999;
// A swell rolling in from the left in groups, up to SWELL_HEIGHT line spacings high, at SWELL_RATE radians per second,
// its crests slanted by SWELL_SLANT radians per shorter side.
const SWELL_HEIGHT = .44;
const SWELL_RATE = 6;
const SWELL_SLANT = 15;
// At most ICE_SHEETS at once, a new one after a random pause, sizes, how far they turn per second, how long the largest
// takes to follow the water, how hard bumping sheets push each other apart, and how much of the sheets' speed the water
// under them takes on per step. They push the water down by ICE_DRAFT line spacings where they move in, so it rises around them,
// and calm the waves under them by ICE_CALM per step, leaving a lee behind them.
const ICE_SHEETS = 8;
const ICE_PAUSE_MIN = 20;
const ICE_PAUSE_MAX = 35;
const ICE_SIZE_MIN = .04;
const ICE_SIZE_MAX = .12;
const ICE_SPIN = .05;
const ICE_INERTIA = .5;
const ICE_BOUNCE = 2;
const ICE_GRIP = .01;
const ICE_DRAFT = .19;
const ICE_CALM = .15;
// The spheal's sheet reaches this many times its width to either side, and is this many times wider than tall.
const SEAT_WIDTH = 1.28;
const SEAT_FLAT = 2.5;
// How much of the pointer's speed the water under it takes on per step, how far around it, and how many line spacings
// deep it pushes the water down, which rises behind it as it moves on.
const POINTER_GRIP = .2;
const POINTER_RADIUS = .02;
const POINTER_DEPTH = 1.4;

// One triangle covering the whole target.
const OCEAN_VERTEX = `#version 300 es
void main() {
  gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1);
}`;
// The water's velocity, height and how fast the height changes in each cell of the state, the pressure and how much the flow
// squeezes together in each cell of the pressure, and each sheet's position, size and turn, velocity, sides and seed.
const OCEAN_COMMON = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D state;
uniform sampler2D pressure;
uniform vec4 sheets[${ICE_SHEETS}];
uniform vec4 drifts[${ICE_SHEETS}];
uniform float time;
out vec4 fragColor;

vec4 at(sampler2D field, ivec2 cell) {
  return texelFetch(field, clamp(cell, ivec2(0), textureSize(field, 0) - 1), 0);
}

vec4 around(sampler2D field, ivec2 cell) {
  return at(field, cell + ivec2(1, 0)) + at(field, cell - ivec2(1, 0)) + at(field, cell + ivec2(0, 1)) + at(field, cell - ivec2(0, 1));
}

// Change across a cell, to the right and upwards.
vec4 dx(sampler2D field, ivec2 cell) {
  return (at(field, cell + ivec2(1, 0)) - at(field, cell - ivec2(1, 0))) / 2.;
}

vec4 dy(sampler2D field, ivec2 cell) {
  return (at(field, cell + ivec2(0, 1)) - at(field, cell - ivec2(0, 1))) / 2.;
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = smoothstep(0., 1., fract(p));
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + 1.), f.x), f.y);
}

// Signed distance to the edge of sheet i, a jagged polygon, the first, the spheal's, flattened.
float edge(vec2 p, int i) {
  p -= sheets[i].xy;
  if (i == 0) p.y *= float(${SEAT_FLAT});
  float corner = 6.2832 / drifts[i].z;
  // The spheal's turned on its left to the nearest turn with an edge there, and less jagged there, as its flattening sharpens
  // a corner, or a dent between two, into tips.
  float left = i == 0 ? 1. - smoothstep(-.5, .3, normalize(p).x) : 0.;
  float side = corner / 2. - 3.1416;
  side += corner * round((sheets[i].w - side) / corner);
  float angle = mod(atan(p.y, p.x) + mix(sheets[i].w, side, left), corner) - corner / 2.;
  float jag = mix(.4, .1, left);
  return length(p) - sheets[i].z * cos(corner / 2.) / cos(angle) * (1. - jag / 2. + jag * noise(normalize(p) * 2. + drifts[i].w));
}
`;
// Carries the water along its own flow, spreads its waves, and lets the current, the pointer and the sheets push it.
const OCEAN_WATER = `
uniform vec4 pointer;
uniform float shift;

float finger(vec2 p, vec2 center) {
  return exp(-dot(p - center, p - center) / float(${POINTER_RADIUS ** 2}));
}

float under(vec2 p, int i) {
  return clamp(.5 - edge(p, i) * float(${OCEAN_CELLS}), 0., 1.);
}

void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  // Moved up by shift cells as the page scrolled, with calm water coming in at the edge.
  ivec2 from = cell - ivec2(0, int(shift));
  vec4 here = at(state, from);
  vec2 size = vec2(textureSize(state, 0));
  vec2 back = (vec2(from) + .5 - here.xy * float(${OCEAN_STEP * OCEAN_CELLS})) / size;
  vec4 water = texture(state, back);
  // Spread around where the water came from, as spreading around the cell itself lets fast swirls stir up waves without end.
  vec2 right = vec2(1, 0) / size;
  vec2 up = vec2(0, 1) / size;
  float spread = texture(state, back + right).b + texture(state, back - right).b + texture(state, back + up).b + texture(state, back - up).b;
  water.a = (water.a + float(${WAVE_SPEED}) * (spread - 4. * water.b)) * float(${WAVE_KEEP});
  water.b += water.a;
  if (from.y < 0 || from.y >= textureSize(state, 0).y) water = vec4(vec2(${OCEAN_CURRENT}), 0, 0);
  water.xy = mix(water.xy, vec2(${OCEAN_CURRENT}), float(${OCEAN_CALM}));
  vec2 p = gl_FragCoord.xy / float(${OCEAN_CELLS});
  float swell = float(${SWELL_HEIGHT}) * sin(time * float(${SWELL_RATE}) - p.y * float(${SWELL_SLANT})) * noise(vec2(p.y * 2., time * .3));
  if (cell.x == 0) water.ba = vec2(swell, swell - here.b);
  water.xy = mix(water.xy, pointer.zw, finger(p, pointer.xy) * float(${POINTER_GRIP}));
  water.b -= float(${POINTER_DEPTH}) * (finger(p, pointer.xy) - finger(p, pointer.xy - pointer.zw * float(${OCEAN_STEP})));
  // Where the sheets were a step ago, relative to the water.
  vec2 flow = water.xy;
  for (int i = 0; i < ${ICE_SHEETS}; i++) {
    float now = under(p, i);
    float before = under(p + (drifts[i].xy - flow) * float(${OCEAN_STEP}), i);
    water.b -= float(${ICE_DRAFT}) * (now - before);
    water.ba *= 1. - now * float(${ICE_CALM});
    water.xy = mix(water.xy, drifts[i].xy, now * float(${ICE_GRIP}));
  }
  fragColor = water;
}`;
// How much the flow squeezes together, next to the last step's pressure to start solving from.
const OCEAN_DIVERGENCE = `
void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  fragColor = vec4(at(pressure, cell).r, dx(state, cell).x + dy(state, cell).y, 0, 0);
}`;
// One iteration towards the pressure that evens out the squeezing.
const OCEAN_JACOBI = `
void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  float squeeze = at(pressure, cell).g;
  fragColor = vec4((around(pressure, cell).r - squeeze) / 4., squeeze, 0, 0);
}`;
// Takes the squeezing out of the flow, so the water swirls around what pushes it.
const OCEAN_PROJECT = `
void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  vec4 water = at(state, cell);
  water.xy -= vec2(dx(pressure, cell).r, dy(pressure, cell).r);
  fragColor = water;
}`;
// The water as broken lines bent by its waves, the dashes drifting with the current, and the sheets as outlined slabs riding them,
// over the water's tone lit by the lamp, or the spheal's sheet alone, on a canvas whose corner lies at origin in the water,
// lifted by the waves read back under it.
const OCEAN_DRAW = `
uniform float scale;
uniform float density;
uniform vec2 view;
uniform vec3 color;
uniform vec3 tone;
uniform vec3 glow;
uniform vec2 lamp;
uniform float scroll;
uniform float behind;
uniform bool seat;
uniform vec2 origin;
uniform float lift;

// The water's height in line spacings, interpolated smoothly between cells, so the lines bend without kinks, moved up by the
// cells the water is still behind the page, as it only moves by whole cells.
float height(vec2 p) {
  vec2 size = vec2(textureSize(state, 0));
  vec2 cell = p / view * size + .5 - vec2(0, behind);
  return texture(state, (floor(cell) + smoothstep(0., 1., fract(cell)) - .5) / size).b;
}

// A line about a pixel wide where the distance d from it, measured in x, is zero.
float line(float x, float d) {
  return 1. - smoothstep(0., fwidth(x) * density * float(${OCEAN_LINE_WIDTH}), d);
}

void main() {
  vec2 p = origin + gl_FragCoord.xy / scale;
  // Edges further than .02 away all count as .02 away, so far from every sheet nothing is worked out.
  float ice = .02;
  float slab = .02;
  for (int i = seat ? 0 : 1; i < (seat ? 1 : ${ICE_SHEETS}); i++) {
    // Rides the waves averaged over its size, so larger sheets heave less.
    vec4 sheet = sheets[i];
    // Its edge reaches at most 1.2 sizes from its middle, lifted by the waves at most .1, its slab .01 below that.
    float squash = i == 0 ? float(${SEAT_FLAT}) : 1.;
    if (length((p - sheet.xy) * vec2(1, squash)) - 1.2 * sheet.z > .13 * squash) continue;
    float heave = seat ? lift : height(sheet.xy) + height(sheet.xy + vec2(sheet.z, 0)) + height(sheet.xy - vec2(sheet.z, 0))
      + height(sheet.xy + vec2(0, sheet.z)) + height(sheet.xy - vec2(0, sheet.z));
    vec2 lifted = p + vec2(0, heave / 5. / float(${OCEAN_LINES}));
    ice = min(ice, edge(lifted, i));
    slab = min(slab, edge(lifted + vec2(0, .01), i));
  }
  float y = (p.y - scroll) * float(${OCEAN_LINES}) + height(p);
  float water = line(y, abs(fract(y - .5) - .5)) * step(.35, noise(vec2((p.x - time * float(${OCEAN_CURRENT[0]})) * 8., floor(y + .5))));
  float hidden = min(ice, slab);
  float open = smoothstep(0., fwidth(hidden), hidden);
  float ink = float(${OCEAN_INK}) * max(seat ? 0. : water * open, max(line(ice, abs(ice)), line(slab, abs(slab)) * step(0., ice)));
  // Fading out away from the lamp, shaken by up to a step of the 8 bits it ends up in, so it fades without bands.
  float lit = max(0., 1. - length(p - lamp) / float(${OCEAN_GLOW}));
  vec3 lighting = mix(tone, glow, lit) + (hash(gl_FragCoord.xy) - hash(gl_FragCoord.yx)) / 255.;
  // The spheal's sheet on its own, covering the water where it lies, or the water with all other sheets.
  fragColor = seat ? vec4(color, 1) * ink + vec4(lighting, 1) * (1. - open) * (1. - ink) : vec4(mix(lighting, color, ink), 1);
}`;

// Simulates on the gpu and reads the water under each sheet back, so the sheets drift with it, drawn in the canvas' CSS colors,
// so it follows the theme, lit by the light lightScene moves.
function drawOcean(light) {
  // The water, fixed over the window and moved at half the scroll speed by the browser where it can, and the spheal's sheet on
  // a canvas of its own under the spheal, scrolling with the page, so neither trails the browser's own scrolling.
  let canvas = document.getElementById("ocean");
  let seatCanvas = document.getElementById("seat");
  let gl = canvas.getContext("webgl2");
  let seatGl = seatCanvas.getContext("webgl2");
  let timeline = CSS.supports("animation-timeline: scroll()");
  if (!gl || !gl.getExtension("EXT_color_buffer_float")) return;

  let compile = (gl, source) => {
    let program = gl.createProgram();
    [[gl.VERTEX_SHADER, OCEAN_VERTEX], [gl.FRAGMENT_SHADER, OCEAN_COMMON + source]].forEach(([type, text]) => {
      let shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      gl.attachShader(program, shader);
    });
    gl.linkProgram(program);
    gl.useProgram(program);
    let uniforms = { program };
    for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
      let name = gl.getActiveUniform(program, i).name.replace("[0]", "");
      uniforms[name] = gl.getUniformLocation(program, name);
    }
    gl.uniform1i(uniforms.pressure, 1);
    return uniforms;
  };
  let programs = { water: compile(gl, OCEAN_WATER), divergence: compile(gl, OCEAN_DIVERGENCE), jacobi: compile(gl, OCEAN_JACOBI),
    project: compile(gl, OCEAN_PROJECT), draw: compile(gl, OCEAN_DRAW) };
  let seatDraw = compile(seatGl, OCEAN_DRAW);
  seatGl.uniform1i(seatDraw.seat, 1);

  // The simulation covers the window, each state and pressure twice, as a pass reads one and writes the other.
  let view = [];
  let width = 0;
  let height = 0;
  let states = [];
  let pressures = [];
  let target = (format) => {
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, format, width, height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    let framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    return { texture, framebuffer };
  };
  let reach = 0;
  let resize = () => {
    let side = Math.min(innerWidth, innerHeight);
    reach = innerHeight * OCEAN_OVERSCAN;
    view = [innerWidth / side, (innerHeight + 2 * reach) / side];
    let density = Math.min(devicePixelRatio, OCEAN_DENSITY);
    canvas.width = innerWidth * density;
    canvas.height = (innerHeight + 2 * reach) * density;
    canvas.style.height = innerHeight + 2 * reach + "px";
    width = Math.round(view[0] * OCEAN_CELLS);
    height = Math.round(view[1] * OCEAN_CELLS);
    [...states, ...pressures].forEach(({ texture, framebuffer }) => {
      gl.deleteTexture(texture);
      gl.deleteFramebuffer(framebuffer);
    });
    states = [target(gl.RGBA16F), target(gl.RGBA16F)];
    pressures = [target(gl.RG16F), target(gl.RG16F)];
    [[gl, programs.draw], [seatGl, seatDraw]].forEach(([context, draw]) => {
      context.useProgram(draw.program);
      context.uniform1f(draw.scale, side * density);
      context.uniform1f(draw.density, density);
    });
    gl.uniform2fv(programs.draw.view, view);
  };

  // Every pass reads the current state and pressure, and writes into the other of a pair, or onto the canvas.
  let pass = (program, output) => {
    gl.useProgram(program.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, output ? output.framebuffer : null);
    gl.viewport(0, 0, output ? width : canvas.width, output ? height : canvas.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, states[0].texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, pressures[0].texture);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  // Where the pointer is and how fast it moved since the last step, far away if it didn't.
  let pointer = [-1, -1, 0, 0];
  // The sheet the pointer holds, where on it, and where the pointer is, or nothing.
  let held = null;
  // How many cells the water still has to move up as the page scrolled, moved a whole cell at a time.
  let shift = 0;
  let simulate = (time) => {
    let cells = Math.trunc(shift);
    shift -= cells;
    gl.useProgram(programs.water.program);
    gl.uniform1f(programs.water.shift, cells);
    gl.uniform1f(programs.water.time, time);
    gl.uniform4fv(programs.water.pointer, pointer);
    pointer = [-1, -1, 0, 0];
    pass(programs.water, states[1]);
    states.reverse();
    pass(programs.divergence, pressures[1]);
    pressures.reverse();
    for (let i = 0; i < OCEAN_ITERATIONS; i++) {
      pass(programs.jacobi, pressures[1]);
      pressures.reverse();
    }
    pass(programs.project, states[1]);
    states.reverse();
  };

  // Each sheet a new jagged polygon, starting with the current's speed.
  let sheets = [];
  let nextSheet = 0;
  let spawn = (x, y) => sheets.push({ x, y, vx: OCEAN_CURRENT[0], vy: OCEAN_CURRENT[1],
    size: ICE_SIZE_MIN + Math.random() * (ICE_SIZE_MAX - ICE_SIZE_MIN), angle: 2 * Math.PI * Math.random(),
    spin: ICE_SPIN * (2 * Math.random() - 1), sides: 4 + Math.floor(Math.random() * 5), seed: 100 * Math.random() });
  // The water under each sheet, and around the spheal's at the five places the waves lift it by, read back into a buffer the gpu
  // fills in its own time, so reading it never waits for the gpu.
  let samples = new Float32Array((ICE_SHEETS + 5) * 4);
  let around = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, gl.createBuffer());
  gl.bufferData(gl.PIXEL_PACK_BUFFER, samples.byteLength, gl.STREAM_READ);
  let fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  let sheetData = new Float32Array(ICE_SHEETS * 4);
  let driftData = new Float32Array(ICE_SHEETS * 4);
  let cellAt = (x, cells) => Math.min(Math.max(Math.floor(x * OCEAN_CELLS), 0), cells - 1);
  // Seconds since the page last scrolled, and since the last reading: reading back waits on the gpu, which is busy while the
  // page scrolls, so the sheets keep their speed until the page has rested for OCEAN_REST seconds.
  let still = 0;
  let unread = 0;
  // The spheal sits on a larger sheet held in place under it, which scrolls with the page, so through the water at half speed.
  let spheal = document.getElementById("spheal");
  let seat = { angle: .3, sides: 7, seed: 42 };
  let place = {};
  // Its canvas, on the page around where it can reach: 1.2 sizes sideways, as far up and down as it is flattened, and the most
  // the waves lift it by, .1, and its slab lies below, .01, with a little room for its outline.
  let box = {};
  // Centered halfway along its roll, which takes it half its width to the left.
  let measure = () => {
    let rect = spheal.getBoundingClientRect();
    place = { x: rect.left + scrollX + .2 * rect.width, y: rect.bottom + scrollY - .1 * rect.height, size: SEAT_WIDTH * rect.width };
    let side = Math.min(innerWidth, innerHeight);
    let density = Math.min(devicePixelRatio, OCEAN_DENSITY);
    let across = 1.2 * place.size + 4;
    let up = 1.2 * place.size / SEAT_FLAT + .11 * side + 4;
    box = { left: place.x - across, top: place.y - up, width: 2 * across, height: 2 * up };
    Object.assign(seatCanvas.style, { left: box.left + "px", top: box.top + "px", width: box.width + "px", height: box.height + "px" });
    // Only resized when its size changed, as resizing a canvas waits on the gpu, and the page often changes size while scrolling.
    let size = { width: Math.round(box.width * density), height: Math.round(box.height * density) };
    if (size.width !== seatCanvas.width || size.height !== seatCanvas.height) Object.assign(seatCanvas, size);
  };

  // New sheets drift in from the left, all follow the water under them, the larger ones slower, move up with it as the page
  // scrolls by twice as far, bump into each other and into the spheal's sheet, and leave once they are out of sight.
  let drift = (time, elapsed, scrolled) => {
    if (time > nextSheet && sheets.length < ICE_SHEETS - 1) {
      spawn(-1.2 * ICE_SIZE_MAX, Math.random() * view[1]);
      nextSheet = time + ICE_PAUSE_MIN + Math.random() * (ICE_PAUSE_MAX - ICE_PAUSE_MIN);
    }
    still = scrolled ? 0 : still + elapsed;
    unread += elapsed;
    if (still > OCEAN_REST && unread > OCEAN_READ_PAUSE && gl.getSyncParameter(fence, gl.SYNC_STATUS) === gl.SIGNALED) {
      unread = 0;
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, samples);
      gl.deleteSync(fence);
      gl.bindFramebuffer(gl.FRAMEBUFFER, states[0].framebuffer);
      sheets.forEach((sheet, i) => gl.readPixels(cellAt(sheet.x, width), cellAt(sheet.y, height), 1, 1, gl.RGBA, gl.FLOAT, i * 16));
      around.forEach(([dx, dy], i) => gl.readPixels(cellAt(seat.x + dx * seat.size, width), cellAt(seat.y + dy * seat.size, height),
        1, 1, gl.RGBA, gl.FLOAT, (ICE_SHEETS + i) * 16));
      fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    }
    sheets.forEach((sheet, i) => {
      let follow = 1 - Math.exp(-elapsed * ICE_SIZE_MAX / (ICE_INERTIA * sheet.size));
      sheet.vx += (samples[i * 4] - sheet.vx) * follow;
      sheet.vy += (samples[i * 4 + 1] - sheet.vy) * follow;
      // A held sheet goes where it is held, as fast as it takes to get there, so it pushes the water and other sheets.
      if (sheet === held?.sheet) {
        sheet.vx = elapsed && (held.x + held.dx - sheet.x) / elapsed;
        sheet.vy = elapsed && (held.y + held.dy - sheet.y - scrolled) / elapsed;
      }
      sheet.x += sheet.vx * elapsed;
      sheet.y += sheet.vy * elapsed + scrolled;
      sheet.angle += sheet.spin * elapsed;
    });
    // Its speed through the water, nothing when it is first placed.
    let side = Math.min(innerWidth, innerHeight);
    let y = (innerHeight + reach - place.y + scrollY) / side;
    let vy = elapsed && (y - seat.y - scrolled) / elapsed;
    Object.assign(seat, { x: place.x / side, y, size: place.size / side });
    let all = [seat, ...sheets];
    all.forEach((a, i) => all.slice(i + 1).forEach((b) => {
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      // Measured upwards as far as the spheal's sheet is flattened, so floes touch its edge, not its width.
      let distance = Math.hypot(dx, a === seat ? dy * SEAT_FLAT : dy);
      let push = Math.max(0, .9 * (a.size + b.size) - distance) / distance * ICE_BOUNCE * elapsed;
      a.vx -= dx * push;
      a.vy -= dy * push;
      b.vx += dx * push;
      b.vy += dy * push;
    }));
    Object.assign(seat, { vx: 0, vy });
    let margin = 2 * ICE_SIZE_MAX;
    sheets = sheets.filter((sheet) => sheet.x > -margin && sheet.x < view[0] + margin && sheet.y > -margin && sheet.y < view[1] + margin);
    all = [seat, ...sheets];
    for (let i = 0; i < ICE_SHEETS; i++) {
      let sheet = all[i];
      sheetData.set(sheet ? [sheet.x, sheet.y, sheet.size, sheet.angle] : [-10, -10, 0, 0], i * 4);
      driftData.set(sheet ? [sheet.vx, sheet.vy, sheet.sides, sheet.seed] : [0, 0, 3, 0], i * 4);
    }
    [programs.water, programs.draw].forEach((program) => {
      gl.useProgram(program.program);
      gl.uniform4fv(program.sheets, sheetData);
      gl.uniform4fv(program.drifts, driftData);
    });
  };

  // The lines in the canvas' color, the water in its background color, and the light in its border color.
  let paint = () => {
    let style = getComputedStyle(canvas);
    [[gl, programs.draw], [seatGl, seatDraw]].forEach(([context, draw]) => {
      context.useProgram(draw.program);
      [["color", style.color], ["tone", style.backgroundColor], ["glow", style.borderTopColor]]
        .forEach(([name, value]) => context.uniform3fv(draw[name], value.match(/\d+/g).map((c) => c / 255)));
    });
  };

  // Steps at a fixed rate whatever the frame rate, catching up at most a tenth of a second.
  let lastTime = 0;
  let pending = 0;
  let lastScroll = scrollY;
  let frame = (time) => {
    let seconds = time / 1000;
    let elapsed = Math.min(seconds - lastTime, .1);
    lastTime = seconds;
    // The ocean moves up half as far as the page scrolls.
    let side = Math.min(innerWidth, innerHeight);
    let scrolled = (scrollY - lastScroll) / 2 / side;
    lastScroll = scrollY;
    shift += scrolled * OCEAN_CELLS;
    drift(seconds, elapsed, scrolled);
    for (pending += elapsed; pending >= OCEAN_STEP; pending -= OCEAN_STEP) simulate(seconds);
    gl.useProgram(programs.draw.program);
    gl.uniform1f(programs.draw.time, seconds);
    gl.uniform1f(programs.draw.scroll, scrollY / 2 / side);
    gl.uniform2f(programs.draw.lamp, light.x / side, (innerHeight + reach - light.y) / side);
    gl.uniform1f(programs.draw.behind, shift);
    pass(programs.draw, null);
    // Put back over the window as it is drawn, undoing the half of this scroll the browser moved it by.
    canvas.style.translate = `0 ${(timeline ? scrollY / 2 : 0) - reach}px`;
    seatGl.useProgram(seatDraw.program);
    seatGl.uniform4fv(seatDraw.sheets, sheetData);
    seatGl.uniform4fv(seatDraw.drifts, driftData);
    seatGl.uniform2f(seatDraw.lamp, light.x / side, (innerHeight + reach - light.y) / side);
    seatGl.uniform1f(seatDraw.lift, around.reduce((sum, point, i) => sum + samples[(ICE_SHEETS + i) * 4 + 2], 0));
    seatGl.uniform2f(seatDraw.origin, (box.left - scrollX) / side, (innerHeight + reach - box.top - box.height + scrollY) / side);
    seatGl.viewport(0, 0, seatCanvas.width, seatCanvas.height);
    seatGl.drawArrays(seatGl.TRIANGLES, 0, 3);
    requestAnimationFrame(frame);
  };

  let push = (x, y, dx, dy) => {
    let side = Math.min(innerWidth, innerHeight);
    pointer = [x / side, (innerHeight + reach - y) / side, pointer[2] + dx / side / OCEAN_STEP, pointer[3] - dy / side / OCEAN_STEP];
  };
  window.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "touch") push(event.clientX, event.clientY, event.movementX, event.movementY);
  });
  // Fingers are followed by touch events, as their pointer events stop once they scroll the page.
  let touch = [];
  window.addEventListener("touchstart", (event) => touch = [event.touches[0].clientX, event.touches[0].clientY], { passive: true });
  window.addEventListener("touchmove", (event) => {
    let { clientX, clientY } = event.touches[0];
    push(clientX, clientY, clientX - touch[0], clientY - touch[1]);
    touch = [clientX, clientY];
  }, { passive: true });
  // Sheets are dragged, except the spheal's, held where they were taken, a held one taking no clicks or text selection.
  let spot = (event) => {
    let side = Math.min(innerWidth, innerHeight);
    return { x: event.clientX / side, y: (innerHeight + reach - event.clientY) / side };
  };
  window.addEventListener("pointerdown", (event) => {
    let { x, y } = spot(event);
    let sheet = sheets.find((sheet) => Math.hypot(x - sheet.x, y - sheet.y) < sheet.size);
    if (!sheet || event.target.closest("a, button")) return;
    event.preventDefault();
    held = { sheet, dx: sheet.x - x, dy: sheet.y - y, x, y };
  });
  window.addEventListener("pointermove", (event) => held && Object.assign(held, spot(event)));
  ["pointerup", "pointercancel"].forEach((type) => window.addEventListener(type, () => held = null));
  window.addEventListener("resize", resize);
  new MutationObserver(paint).observe(document.documentElement, { attributeFilter: ["data-theme"] });
  // The page changing size may move the spheal.
  new ResizeObserver(measure).observe(document.body);
  resize();
  paint();
  measure();
  for (let i = 0; i < ICE_SHEETS / 2; i++) spawn(Math.random() * view[0], Math.random() * view[1]);
  let now = performance.now() / 1000;
  drift(now, 0, 0);
  for (let time = now - OCEAN_WARMUP; time < now; time += OCEAN_STEP) simulate(time);
  requestAnimationFrame(frame);
}
