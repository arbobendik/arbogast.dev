"use strict";

const IMAGE_FORMAT = "webp";
const TYPING_START = 400;
const TYPING_INTERVAL = 100;
// Distance from the light, as a fraction of vmin, at which shadows reach full length.
const LIGHT_RANGE = .5;
const LIGHT_ORBIT_PERIOD = 20000;
// How far the light strays from its orbit along a smooth, irregular path, as a fraction of the window.
const LIGHT_WANDER = .05;
// Shadows only repaint when their direction crosses one of these steps per unit, too small to see.
const SHADOW_STEPS = 8;
const BLINK_DURATION = 200;
const BLINK_PAUSE_MIN = 3000;
const BLINK_PAUSE_MAX = 8000;
const SPHEAL_TRICKS = ["roll", "jump"];
const ROLL_TURNS_MIN = 3;
const ROLL_TURNS_MAX = 8;
// Pause before each idle animation, which is picked at random.
const IDLE_PAUSE_MIN = 6000;
const IDLE_PAUSE_MAX = 14000;
// How often it swings back and forth in a row, how long each swing takes and how far it leans back at most in degrees,
// just short of tipping over, leaning forward only half as far.
const SWING_COUNT = 4;
const SWING_PERIOD = 1500;
const SWING_TILT = 20;
// Keyframes per swing, linear in between.
const SWING_STEPS = 24;
// Radius of the round belly it rolls on, as a share of its width.
const BELLY_RADIUS = .38;
// How much more the tail bends up than it leans back, as leaning lowers the tail too, so it stays on the ground.
const SWING_PUSH = 1.5;
const SMILE_DURATION = 2500;
// How often it claps its flippers against its belly in a row, how long each clap takes, how far they turn up in degrees
// and how short they look then, as they swing towards the viewer onto the belly.
const CLAP_COUNT = 3;
const CLAP_DURATION = 350;
const CLAP_ANGLE = 20;
const CLAP_SCALE = .55;
// Blur of content not shown yet in rem, and the longest it takes to sharpen in seconds, even right at the window edge.
const REVEAL_BLUR = 1.5;
const REVEAL_TIME = 5;
// How fast content sharpens in rem per second when it is REVEAL_LINE, a fraction of the window height, away from the nearer
// of the top and bottom window edge, exponentially faster further in and slower towards the edges.
const REVEAL_SPEED = 4;
const REVEAL_LINE = .25;
// Images sharpen at this fraction of the speed of the text beside them, still within REVEAL_TIME.
const REVEAL_IMAGE_SPEED = .75;

const PATH_SCREENSHOT = "FlexLight/static/screenshots/screen";
const PATH_GLOW = "images/glow/screen";

// Kept apart so the address only exists in the page after a click, out of reach of scrapers reading the source.
const MAIL_PARTS = ["bendik", "arbogast.dev"];
const MAIL_SUBJECT = "?subject=Inquiry%20to%20Arbogast%20Solutions";
const PATH_FLEXLIGHT = "FlexLight/loader.html?";

// Only these pages and iframe targets are loaded, any other request shows home.
const PAGES = ["datenschutzerklaerung", "impressum"];
const TARGETS = ["FlexLight/"];

const URL_PARAMS = new URLSearchParams(location.search);
const TARGET = URL_PARAMS.get("target");
const PAGE = PAGES.includes(URL_PARAMS.get("page")) ? URL_PARAMS.get("page")
  : URL_PARAMS.get("page") === "iframe" && TARGETS.includes(TARGET) ? "iframe" : "home";

let darkMode = (localStorage.getItem("darkMode") ?? String(matchMedia("(prefers-color-scheme: dark)").matches)) === "true";
// Set page and theme before the dom is loaded to avoid flashing the wrong content or colors.
document.documentElement.dataset.page = PAGE;
document.documentElement.dataset.theme = darkMode ? "dark" : "light";

async function fetchAsText(url) {
  return await (await fetch(url)).text();
}

// Type the header as soon as it is scrolled into view.
function typeHeader(element) {
  let header = element.textContent;
  element.ariaLabel = header;
  element.textContent = "";
  let observer = new IntersectionObserver((entries) => {
    if (!entries[0].isIntersecting) return;
    observer.disconnect();
    for (let i = 0; i < header.length; i++) {
      setTimeout(() => {
        element.textContent = header.slice(0, i) + "_";
      }, TYPING_START + TYPING_INTERVAL * i);
      setTimeout(() => {
        element.textContent = header.slice(0, i + 1);
      }, TYPING_START + TYPING_INTERVAL * i + 50 + Math.random() * 50);
    }
  });
  observer.observe(element);
}

// Lit text casts its two shadows from copies of itself behind it, each on a layer of its own, so a moving light only moves
// them, where it would otherwise paint the text and its wide blurred shadows again, which phones can't keep up with.
function castShadows() {
  let cast = (text) => {
    text.querySelectorAll(":scope > .echo").forEach((echo) => echo.remove());
    let nodes = Array.from(text.childNodes);
    for (let name of ["echo", "echo light"]) {
      let echo = document.createElement("div");
      echo.className = [name, ...Array.from(text.classList).filter((c) => c !== "lit")].join(" ");
      echo.inert = true;
      echo.append(...nodes.map((node) => node.cloneNode(true)));
      echo.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
      text.append(echo);
    }
  };

  // Text that changes, as it is typed or revealed, is copied again, changes that are only its copies are not.
  let changes = new MutationObserver((mutations) => {
    let changed = new Set();
    for (let mutation of mutations) {
      let nodes = [...mutation.addedNodes, ...mutation.removedNodes];
      if (nodes.length && nodes.every((node) => node.classList?.contains("echo"))) continue;
      let element = mutation.target.nodeType === Node.ELEMENT_NODE ? mutation.target : mutation.target.parentElement;
      if (!element.closest(".echo")) changed.add(element.closest(".lit"));
    }
    changed.forEach(cast);
  });
  document.querySelectorAll("h1, h2, p, li, #nav, #dsgvo").forEach((text) => {
    text.classList.add("lit");
    cast(text);
    changes.observe(text, { childList: true, characterData: true, subtree: true });
  });
}

// The pointer is a point light, every shadow on the page is cast away from it.
function lightScene() {
  let light = document.getElementById("light");
  let elements = Array.from(document.querySelectorAll("h1, h2, p, li, .button, #name, #nav, #dsgvo, #spheal"));
  let spheal = elements.indexOf(document.getElementById("spheal"));
  let x = 0;
  let y = 0;
  let frame = 0;

  // The shadow direction last written to each element, so only changes are written.
  let shadows = elements.map(() => ({ sx: null, sy: null }));

  // Each element's middle, top and bottom relative to the page, or to the window if it or a parent is fixed. Measuring forces
  // a layout, so it only happens again once the layout changed, and for the spheal while its swing moves it, and once after.
  let places = [];
  let stale = true;
  let swung = false;
  let measure = (i) => {
    let rect = elements[i].getBoundingClientRect();
    let fixed = false;
    for (let element = elements[i]; element && !fixed; element = element.parentElement) fixed = getComputedStyle(element).position === "fixed";
    let left = fixed ? 0 : scrollX;
    let top = fixed ? 0 : scrollY;
    places[i] = { fixed, x: rect.left + rect.width / 2 + left, y: rect.top + rect.height / 2 + top, top: rect.top + top, bottom: rect.bottom + top };
  };

  let update = () => {
    frame = 0;
    let range = LIGHT_RANGE * Math.min(innerWidth, innerHeight);
    let swinging = "swing" in elements[spheal].dataset;
    // Measure before writing any style, the light included, so measuring needs no extra layout.
    if (stale) elements.forEach((element, i) => measure(i));
    else if (swinging || swung) measure(spheal);
    stale = false;
    swung = swinging;
    light.style.transform = "translate(" + x + "px, " + y + "px)";
    elements.forEach((element, i) => {
      let place = places[i];
      let left = place.fixed ? 0 : scrollX;
      let top = place.fixed ? 0 : scrollY;
      if (place.bottom - top < 0 || place.top - top > innerHeight) return;
      let dx = (place.x - left - x) / range;
      let dy = (place.y - top - y) / range;
      let length = Math.max(1, Math.hypot(dx, dy));
      let sx = Math.round(dx / length * SHADOW_STEPS) / SHADOW_STEPS;
      let sy = Math.round(dy / length * SHADOW_STEPS) / SHADOW_STEPS;
      if (sx !== shadows[i].sx) element.style.setProperty("--sx", shadows[i].sx = sx);
      if (sy !== shadows[i].sy) element.style.setProperty("--sy", shadows[i].sy = sy);
    });
  };

  let moveLight = (newX, newY) => {
    x = newX;
    y = newY;
    if (!frame) frame = requestAnimationFrame(update);
  };

  // The light orbits the viewport, starting top left, wandering off it by sines whose periods never line up.
  let wander = (t) => .6 * Math.sin(t * .9) + .4 * Math.sin(t * 2.3 + 1);
  let orbit = (time) => {
    let angle = 2 * Math.PI * time / LIGHT_ORBIT_PERIOD + 1.25 * Math.PI;
    x = innerWidth * (.5 + .4 * Math.cos(angle) + LIGHT_WANDER * wander(time / 1000));
    y = innerHeight * (.5 + .4 * Math.sin(angle) + LIGHT_WANDER * wander(time / 1000 + 7));
    // This update covers any a scroll or resize queued for the same frame.
    cancelAnimationFrame(frame);
    update();
    requestAnimationFrame(orbit);
  };

  window.addEventListener("scroll", () => moveLight(x, y));
  window.addEventListener("resize", () => {
    stale = true;
    moveLight(x, y);
  });
  // Any lit element, its section or the page changing size may move the others.
  let resizes = new ResizeObserver(() => stale = true);
  [...elements, ...document.getElementsByClassName("subsection"), document.body].forEach((element) => resizes.observe(element));
  requestAnimationFrame(orbit);
}

// Blinks once or twice after random pauses, swings, smiles or claps after others, rolls or jumps when hovered,
// and smiles and blinks after a swing or a roll.
function animateSpheal() {
  let spheal = document.getElementById("spheal");
  let tail = document.getElementById("sphealTail");
  let lids = document.querySelectorAll(".lid");
  let mouth = document.getElementById("sphealMouth");
  // Each flipper with the sign that turns it down, towards the ground.
  let flippers = [[document.getElementById("sphealFlipper"), 1], [document.getElementById("sphealFlipperBack"), -1]];

  let blink = () => {
    let iterations = 1 + Math.floor(Math.random() * 2);
    lids.forEach((lid) => lid.animate({ transform: ["scaleY(0)", "scaleY(1)", "scaleY(0)"] }, { duration: BLINK_DURATION, iterations }));
  };

  let keepBlinking = () => {
    blink();
    setTimeout(keepBlinking, BLINK_PAUSE_MIN + Math.random() * (BLINK_PAUSE_MAX - BLINK_PAUSE_MIN));
  };

  // Opens the mouth quickly, keeps grinning a while and closes it again.
  let smile = () => mouth.animate([{ scale: "1 0", easing: "ease-out" }, { scale: "1 1", offset: .15 },
    { scale: "1 1", offset: .85, easing: "ease-in" }, { scale: "1 0" }], SMILE_DURATION).finished;

  // Rolls back and forth on its belly like a sine, further with every swing until it almost tips over, then calming down again.
  // Leaning back, the tail stays on the ground, as if it pushed itself off with it, bending up behind the body so it never covers it,
  // and leaning forward, the flippers press down on the ground the same way.
  let swing = () => {
    let body = [];
    let push = [];
    let paddle = [];
    for (let i = 0; i <= SWING_COUNT * SWING_STEPS; i++) {
      let t = i / (SWING_COUNT * SWING_STEPS);
      let tilt = SWING_TILT * Math.sin(Math.PI * t) * Math.sin(2 * Math.PI * SWING_COUNT * t);
      tilt = tilt < 0 ? tilt / 2 : tilt;
      body.push({ rotate: tilt + "deg", translate: BELLY_RADIUS * tilt * Math.PI / 180 * 100 + "% 0" });
      push.push({ rotate: -Math.max(0, tilt) * SWING_PUSH + "deg", zIndex: tilt > 0 ? -1 : "auto" });
      paddle.push(-Math.min(0, tilt) * SWING_PUSH);
    }
    tail.animate(push, SWING_COUNT * SWING_PERIOD);
    flippers.forEach(([flipper, down]) => flipper.animate({ rotate: paddle.map((angle) => down * angle + "deg") }, SWING_COUNT * SWING_PERIOD));
    // Marks that the swing moves the spheal, so lightScene measures where it is again every frame.
    spheal.dataset.swing = "";
    return spheal.animate(body, SWING_COUNT * SWING_PERIOD).finished.then(() => {
      delete spheal.dataset.swing;
      smile();
      blink();
    });
  };

  // Claps its flippers up against its belly a few times.
  let clap = () => Promise.all(flippers.map(([flipper, down]) => flipper.animate(
    { rotate: ["0deg", -down * CLAP_ANGLE + "deg", "0deg"], scale: ["1", CLAP_SCALE + " 1", "1"] },
    { duration: CLAP_DURATION, iterations: CLAP_COUNT, easing: "ease-in-out" }).finished));

  // After every random pause does one of these, then waits for the next.
  let idles = [swing, smile, clap];
  let idle = () => setTimeout(async () => {
    await idles[Math.floor(Math.random() * idles.length)]();
    idle();
  }, IDLE_PAUSE_MIN + Math.random() * (IDLE_PAUSE_MAX - IDLE_PAUSE_MIN));

  spheal.addEventListener("pointerenter", () => {
    if (spheal.dataset.trick) return;
    spheal.style.setProperty("--turns", ROLL_TURNS_MIN + Math.floor(Math.random() * (ROLL_TURNS_MAX - ROLL_TURNS_MIN + 1)));
    spheal.dataset.trick = SPHEAL_TRICKS[Math.floor(Math.random() * SPHEAL_TRICKS.length)];
  });
  // A roll has more animations, it only ends once the tail is back out.
  spheal.addEventListener("animationend", (event) => {
    if (event.animationName === "untuck" || event.animationName === "jump") delete spheal.dataset.trick;
    if (event.animationName === "untuck") {
      smile();
      blink();
    }
  });
  keepBlinking();
  idle();
}

// Content starts blurred and sharpens once its section is in the window, the slower the closer it is to the top or bottom edge.
// A section shares one blur, so the text and the image beside it sharpen together, the image a little later.
function revealContent() {
  let items = Array.from(document.getElementsByClassName("subsection"), (section) =>
    ({ section, images: section.querySelectorAll(".glow, #sphealBody"), blur: REVEAL_BLUR, imageBlur: REVEAL_BLUR }));
  let frame = 0;
  let lastTime = 0;

  let applyBlur = (item, i) => {
    item.section.style.filter = item.blur ? "blur(" + item.blur + "rem)" : "";
    // The section's blur already blurs its images, which only add what their own blur has more.
    let extra = Math.sqrt(item.imageBlur ** 2 - item.blur ** 2);
    item.images.forEach((image) => image.style.filter = extra ? "blur(" + extra + "rem)" : "");
    item.section.style.setProperty("--below", (i + 1 < items.length ? items[i + 1].blur : 0) + "rem");
  };

  let update = (time) => {
    let seconds = (time - lastTime) / 1000;
    lastTime = time;
    // Read all positions before writing any style to avoid a layout per element.
    let rects = items.map((item) => item.section.getBoundingClientRect());
    let settled = true;
    items.forEach((item, i) => {
      // Whatever left the window fades in again when it reappears.
      let hidden = rects[i].bottom < 0 || rects[i].top > innerHeight;
      // Distance of the middle of the visible part to the nearer window edge, as a fraction of the window height.
      let middle = (Math.max(rects[i].top, 0) + Math.min(rects[i].bottom, innerHeight)) / 2;
      let distance = Math.min(middle, innerHeight - middle) / innerHeight;
      // REVEAL_SPEED at REVEAL_LINE, none at the edge, but never slower than sharpening within REVEAL_TIME.
      let speed = REVEAL_SPEED * Math.expm1(distance / REVEAL_LINE) / Math.expm1(1);
      let slowest = REVEAL_BLUR / REVEAL_TIME;
      item.blur = hidden ? REVEAL_BLUR : Math.max(0, item.blur - Math.max(slowest, speed) * seconds);
      item.imageBlur = hidden ? REVEAL_BLUR : Math.max(0, item.imageBlur - Math.max(slowest, speed * REVEAL_IMAGE_SPEED) * seconds);
      settled = settled && (hidden || !item.imageBlur);
    });
    items.forEach(applyBlur);
    frame = settled ? 0 : requestAnimationFrame(update);
  };

  // Time starts at the first frame, so neither a slow load nor an idle wait uses up the deblurring.
  let wake = () => {
    if (frame) return;
    frame = requestAnimationFrame((time) => {
      lastTime = time;
      frame = requestAnimationFrame(update);
    });
  };

  items.forEach(applyBlur);
  window.addEventListener("scroll", wake);
  window.addEventListener("resize", wake);
  wake();
}

window.addEventListener("DOMContentLoaded", async () => {
  let container = document.getElementById("container");
  let darkModeToggle = document.getElementById("darkMode");

  let updateStyle = () => {
    darkModeToggle.firstElementChild.src = darkMode ? "icons/sun." + IMAGE_FORMAT : "icons/moon." + IMAGE_FORMAT;
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
  };

  updateStyle();

  darkModeToggle.addEventListener("click", () => {
    darkMode = !darkMode;
    localStorage.setItem("darkMode", darkMode);
    updateStyle();
  });

  switch (PAGE) {
    case "home":
      Array.from(document.getElementsByClassName("projectLinks")).forEach((item) => {
        item.href = "?page=iframe&target=" + item.getAttribute("href");
      });

      // Runs before the browser follows the link, so this same click already opens the mail app.
      document.getElementById("mail").addEventListener("click", (event) => {
        let address = MAIL_PARTS.join("@");
        event.currentTarget.href = "mailto:" + address + MAIL_SUBJECT;
        event.currentTarget.textContent = address;
      }, { once: true });

      if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
        Array.from(document.getElementsByClassName("typed")).forEach(typeHeader);
        castShadows();
        lightScene();
        drawOcean();
        animateSpheal();
        revealContent();
      }

      let img = document.getElementById("originalImage");
      let shadow = document.getElementById("imageShadow");

      let screenNum = Math.floor(Math.random() * 5);

      let updateImage = () => {
        img.src = PATH_SCREENSHOT + screenNum % 5 + "." + IMAGE_FORMAT;
        shadow.src = PATH_GLOW + screenNum % 5 + "." + IMAGE_FORMAT;
        screenNum++;
      };

      img.addEventListener("pointerover", updateImage);
      updateImage();
      break;

    case "iframe":
      let iframe = document.createElement("iframe");

      switch (TARGET) {
        case 'FlexLight/':
          document.title = "Bendik Arbogast - FlexLight";
          let source = PATH_FLEXLIGHT
          for(const [key, value] of URL_PARAMS.entries()) source += key + '=' + value + '&';
          iframe.src = source;

          let ignoreInitial = true;
          iframe.addEventListener('load', () => {
            if(ignoreInitial) {
              // Pass on all search params
              ignoreInitial = false;
            } else {
              let iframeUrlParams = new URLSearchParams(iframe.contentWindow.location.search);
              for(const [key, value] of iframeUrlParams.entries()) URL_PARAMS.set(key, value);
              location.search = URL_PARAMS.toString();
            }
          });
          break;
        default:
          iframe.src = TARGET;
          break;
      }
      container.appendChild(iframe);
      // Focus iframe to directly enable event listeners
      iframe.contentWindow.focus();
      break;

    default:
      container.innerHTML = await fetchAsText(PAGE + ".html");
      document.title = "Bendik Arbogast - " + container.querySelector("strong").textContent;
      break;
  }
});
