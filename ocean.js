"use strict";

// The ocean behind the page: a coarse simulation of the water's flow and of the waves on it, drawn as broken lines,
// with a moving mouse or pen stirring it. Lengths are fractions of the window's shorter side, times are in seconds.

// Simulation cells along the shorter side, steps per second and pressure solver iterations per step.
const OCEAN_CELLS = 128;
const OCEAN_STEP = 1 / 60;
const OCEAN_ITERATIONS = 12;
// Drawn at this fraction of the window's resolution, as the lines are soft anyway, with this many lines along the shorter side.
const OCEAN_RESOLUTION = .5;
const OCEAN_LINES = 48;
// The current all water returns to by this fraction per step, flowing right.
const OCEAN_CURRENT = [.02, .002];
const OCEAN_CALM = .005;
// The wave speed squared in cells per step, and how much of the waves' speed is left after a step.
const WAVE_SPEED = .05;
const WAVE_KEEP = .999;
// How much of the pointer's speed the water under it takes on per step, how far around it, and how many line spacings
// deep it pushes the water down, which rises behind it as it moves on.
const POINTER_GRIP = .2;
const POINTER_RADIUS = .02;
const POINTER_DEPTH = 2.25;

// One triangle covering the whole target.
const OCEAN_VERTEX = `#version 300 es
void main() {
  gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1);
}`;
// The water's velocity, height and how fast the height changes in each cell of the state, and the pressure and how much
// the flow squeezes together in each cell of the pressure.
const OCEAN_COMMON = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D state;
uniform sampler2D pressure;
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
`;
// Carries the water along its own flow, spreads its waves, and lets the current and the pointer push it.
const OCEAN_WATER = `
uniform vec4 pointer;

float finger(vec2 p, vec2 center) {
  return exp(-dot(p - center, p - center) / float(${POINTER_RADIUS ** 2}));
}

void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  vec4 here = at(state, cell);
  vec2 size = vec2(textureSize(state, 0));
  vec2 back = (gl_FragCoord.xy - here.xy * float(${OCEAN_STEP * OCEAN_CELLS})) / size;
  vec4 water = texture(state, back);
  // Spread around where the water came from, as spreading around the cell itself lets fast swirls stir up waves without end.
  vec2 right = vec2(1, 0) / size;
  vec2 up = vec2(0, 1) / size;
  float spread = texture(state, back + right).b + texture(state, back - right).b + texture(state, back + up).b + texture(state, back - up).b;
  water.a = (water.a + float(${WAVE_SPEED}) * (spread - 4. * water.b)) * float(${WAVE_KEEP});
  water.b += water.a;
  water.xy = mix(water.xy, vec2(${OCEAN_CURRENT}), float(${OCEAN_CALM}));
  vec2 p = gl_FragCoord.xy / float(${OCEAN_CELLS});
  water.xy = mix(water.xy, pointer.zw, finger(p, pointer.xy) * float(${POINTER_GRIP}));
  water.b -= float(${POINTER_DEPTH}) * (finger(p, pointer.xy) - finger(p, pointer.xy - pointer.zw * float(${OCEAN_STEP})));
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
// The water as broken lines bent by its waves, the dashes drifting with the current.
const OCEAN_DRAW = `
uniform float scale;
uniform vec2 view;
uniform vec3 color;

// The water's height in line spacings, interpolated smoothly between cells, so the lines bend without kinks.
float height(vec2 p) {
  vec2 size = vec2(textureSize(state, 0));
  vec2 cell = p / view * size + .5;
  return texture(state, (floor(cell) + smoothstep(0., 1., fract(cell)) - .5) / size).b;
}

// A line about a pixel wide where the distance d from it, measured in x, is zero.
float line(float x, float d) {
  return 1. - smoothstep(0., fwidth(x), d);
}

void main() {
  vec2 p = gl_FragCoord.xy / scale;
  float y = p.y * float(${OCEAN_LINES}) + height(p);
  float water = line(y, abs(fract(y - .5) - .5)) * step(.35, noise(vec2((p.x - time * float(${OCEAN_CURRENT[0]})) * 8., floor(y + .5))));
  fragColor = vec4(color, 1) * water;
}`;

// Simulates on the gpu, drawn in the canvas' CSS color, so it follows the theme.
function drawOcean() {
  let canvas = document.getElementById("ocean");
  let gl = canvas.getContext("webgl2");
  if (!gl || !gl.getExtension("EXT_color_buffer_float")) return;

  let compile = (source) => {
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
  let programs = { water: compile(OCEAN_WATER), divergence: compile(OCEAN_DIVERGENCE), jacobi: compile(OCEAN_JACOBI),
    project: compile(OCEAN_PROJECT), draw: compile(OCEAN_DRAW) };

  // The simulation covers the window, each state and pressure twice, as a pass reads one and writes the other.
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
  let resize = () => {
    let side = Math.min(innerWidth, innerHeight);
    let view = [innerWidth / side, innerHeight / side];
    canvas.width = innerWidth * OCEAN_RESOLUTION;
    canvas.height = innerHeight * OCEAN_RESOLUTION;
    width = Math.round(view[0] * OCEAN_CELLS);
    height = Math.round(view[1] * OCEAN_CELLS);
    [...states, ...pressures].forEach(({ texture, framebuffer }) => {
      gl.deleteTexture(texture);
      gl.deleteFramebuffer(framebuffer);
    });
    states = [target(gl.RGBA16F), target(gl.RGBA16F)];
    pressures = [target(gl.RG16F), target(gl.RG16F)];
    gl.useProgram(programs.draw.program);
    gl.uniform1f(programs.draw.scale, side * OCEAN_RESOLUTION);
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
  let simulate = () => {
    gl.useProgram(programs.water.program);
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

  let paint = () => {
    gl.useProgram(programs.draw.program);
    gl.uniform3fv(programs.draw.color, getComputedStyle(canvas).color.match(/\d+/g).map((c) => c / 255));
  };

  // Steps at a fixed rate whatever the frame rate, catching up at most a tenth of a second.
  let lastTime = 0;
  let pending = 0;
  let frame = (time) => {
    let seconds = time / 1000;
    let elapsed = Math.min(seconds - lastTime, .1);
    lastTime = seconds;
    for (pending += elapsed; pending >= OCEAN_STEP; pending -= OCEAN_STEP) simulate();
    gl.useProgram(programs.draw.program);
    gl.uniform1f(programs.draw.time, seconds);
    pass(programs.draw, null);
    requestAnimationFrame(frame);
  };

  window.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;
    let side = Math.min(innerWidth, innerHeight);
    pointer = [event.clientX / side, (innerHeight - event.clientY) / side,
      pointer[2] + event.movementX / side / OCEAN_STEP, pointer[3] - event.movementY / side / OCEAN_STEP];
  });
  window.addEventListener("resize", resize);
  new MutationObserver(paint).observe(document.documentElement, { attributeFilter: ["data-theme"] });
  resize();
  paint();
  requestAnimationFrame(frame);
}
