"use strict";

// The ocean behind the page: a coarse simulation of the waves on the water, drawn as lines, with a moving mouse or pen
// pushing it. Lengths are fractions of the window's shorter side, times are in seconds.

// Simulation cells along the shorter side and steps per second.
const OCEAN_CELLS = 128;
const OCEAN_STEP = 1 / 60;
// Drawn at this fraction of the window's resolution, as the lines are soft anyway, with this many lines along the shorter side.
const OCEAN_RESOLUTION = .5;
const OCEAN_LINES = 48;
// The wave speed squared in cells per step, and how much of the waves' speed is left after a step.
const WAVE_SPEED = .05;
const WAVE_KEEP = .999;
// How far around the pointer it pushes the water down, and how many line spacings deep, which rises behind it as it moves on.
const POINTER_RADIUS = .02;
const POINTER_DEPTH = 2.25;

// One triangle covering the whole target.
const OCEAN_VERTEX = `#version 300 es
void main() {
  gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1., 0, 1);
}`;
// The water's height and how fast it changes in the last two channels of each cell of the state.
const OCEAN_COMMON = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D state;
out vec4 fragColor;

vec4 at(sampler2D field, ivec2 cell) {
  return texelFetch(field, clamp(cell, ivec2(0), textureSize(field, 0) - 1), 0);
}

vec4 around(sampler2D field, ivec2 cell) {
  return at(field, cell + ivec2(1, 0)) + at(field, cell - ivec2(1, 0)) + at(field, cell + ivec2(0, 1)) + at(field, cell - ivec2(0, 1));
}
`;
// Spreads the water's waves, and lets the pointer push it.
const OCEAN_WATER = `
uniform vec4 pointer;

float finger(vec2 p, vec2 center) {
  return exp(-dot(p - center, p - center) / float(${POINTER_RADIUS ** 2}));
}

void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  vec4 here = at(state, cell);
  vec4 water = here;
  water.a = (water.a + float(${WAVE_SPEED}) * (around(state, cell).b - 4. * here.b)) * float(${WAVE_KEEP});
  water.b += water.a;
  vec2 p = gl_FragCoord.xy / float(${OCEAN_CELLS});
  water.b -= float(${POINTER_DEPTH}) * (finger(p, pointer.xy) - finger(p, pointer.xy - pointer.zw * float(${OCEAN_STEP})));
  fragColor = water;
}`;
// The water as lines bent by its waves.
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
  float water = line(y, abs(fract(y - .5) - .5));
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
    let uniforms = { program };
    for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
      let name = gl.getActiveUniform(program, i).name.replace("[0]", "");
      uniforms[name] = gl.getUniformLocation(program, name);
    }
    return uniforms;
  };
  let programs = { water: compile(OCEAN_WATER), draw: compile(OCEAN_DRAW) };

  // The simulation covers the window, its state twice, as a pass reads one and writes the other.
  let width = 0;
  let height = 0;
  let states = [];
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
    states.forEach(({ texture, framebuffer }) => {
      gl.deleteTexture(texture);
      gl.deleteFramebuffer(framebuffer);
    });
    states = [target(gl.RGBA16F), target(gl.RGBA16F)];
    gl.useProgram(programs.draw.program);
    gl.uniform1f(programs.draw.scale, side * OCEAN_RESOLUTION);
    gl.uniform2fv(programs.draw.view, view);
  };

  // Every pass reads the current state, and writes into the other of the pair, or onto the canvas.
  let pass = (program, output) => {
    gl.useProgram(program.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, output ? output.framebuffer : null);
    gl.viewport(0, 0, output ? width : canvas.width, output ? height : canvas.height);
    gl.bindTexture(gl.TEXTURE_2D, states[0].texture);
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
