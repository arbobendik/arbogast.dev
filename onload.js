"use strict";

const IMAGE_FORMAT = "webp";
const TYPING_START = 400;
const TYPING_INTERVAL = 100;
// Distance from the light, as a fraction of vmin, at which shadows reach full length.
const LIGHT_RANGE = .5;
const LIGHT_ORBIT_PERIOD = 20000;
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
// Blur of content below the window in rem, and the fastest it may drop in rem per second.
const REVEAL_BLUR = 1.5;
const REVEAL_SPEED = 4;
// Fraction of the window height from the top, a section starting above this line is fully sharp.
const REVEAL_LINE = .67;

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
        element.textContent += "_";
      }, TYPING_START + TYPING_INTERVAL * i);
      setTimeout(() => {
        element.textContent = header.slice(0, i + 1);
      }, TYPING_START + TYPING_INTERVAL * i + 50 + Math.random() * 50);
    }
  });
  observer.observe(element);
}

// The pointer is a point light, every shadow on the page is cast away from it.
function lightScene() {
  let light = document.getElementById("light");
  let elements = document.querySelectorAll("h1, h2, p, li, .button, #name, #nav, #dsgvo, #spheal");
  let x = 0;
  let y = 0;
  let frame = 0;
  let following = false;

  let update = () => {
    frame = 0;
    light.style.transform = "translate(" + x + "px, " + y + "px)";
    let range = LIGHT_RANGE * Math.min(innerWidth, innerHeight);
    // Read all positions before writing any style to avoid a layout per element.
    let rects = Array.from(elements, (element) => element.getBoundingClientRect());
    elements.forEach((element, i) => {
      let rect = rects[i];
      if (rect.bottom < 0 || rect.top > innerHeight) return;
      let dx = (rect.left + rect.width / 2 - x) / range;
      let dy = (rect.top + rect.height / 2 - y) / range;
      let length = Math.max(1, Math.hypot(dx, dy));
      element.style.setProperty("--sx", Math.round(dx / length * SHADOW_STEPS) / SHADOW_STEPS);
      element.style.setProperty("--sy", Math.round(dy / length * SHADOW_STEPS) / SHADOW_STEPS);
    });
  };

  let moveLight = (newX, newY) => {
    x = newX;
    y = newY;
    if (!frame) frame = requestAnimationFrame(update);
  };

  // The light orbits the viewport, starting top left, until a mouse or pen takes it.
  let orbit = (time) => {
    if (following) return;
    let angle = 2 * Math.PI * time / LIGHT_ORBIT_PERIOD + 1.25 * Math.PI;
    x = innerWidth * (.5 + .4 * Math.cos(angle));
    y = innerHeight * (.5 + .4 * Math.sin(angle));
    update();
    requestAnimationFrame(orbit);
  };

  window.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;
    following = true;
    moveLight(event.clientX, event.clientY);
  });
  window.addEventListener("scroll", () => moveLight(x, y));
  window.addEventListener("resize", () => moveLight(x, y));
  requestAnimationFrame(orbit);
}

// Blinks once or twice after random pauses, swings or smiles after others, and rolls or jumps when hovered.
function animateSpheal() {
  let spheal = document.getElementById("spheal");
  let tail = document.getElementById("sphealTail");
  let lids = document.querySelectorAll(".lid");
  let mouth = document.getElementById("sphealMouth");

  let blink = () => {
    let iterations = 1 + Math.floor(Math.random() * 2);
    lids.forEach((lid) => lid.animate({ transform: ["scaleY(0)", "scaleY(1)", "scaleY(0)"] }, { duration: BLINK_DURATION, iterations }));
    setTimeout(blink, BLINK_PAUSE_MIN + Math.random() * (BLINK_PAUSE_MAX - BLINK_PAUSE_MIN));
  };

  // Opens the mouth quickly, keeps grinning a while and closes it again.
  let smile = () => mouth.animate([{ scale: "1 0", easing: "ease-out" }, { scale: "1 1", offset: .15 },
    { scale: "1 1", offset: .85, easing: "ease-in" }, { scale: "1 0" }], SMILE_DURATION).finished;

  // Rolls back and forth on its belly like a sine, further with every swing until it almost tips over, then calming down again.
  // Leaning back, the tail stays on the ground, as if it pushed itself off with it, bending up behind the body so it never covers it.
  let swing = () => {
    let body = [];
    let push = [];
    for (let i = 0; i <= SWING_COUNT * SWING_STEPS; i++) {
      let t = i / (SWING_COUNT * SWING_STEPS);
      let tilt = SWING_TILT * Math.sin(Math.PI * t) * Math.sin(2 * Math.PI * SWING_COUNT * t);
      tilt = tilt < 0 ? tilt / 2 : tilt;
      body.push({ rotate: tilt + "deg", translate: BELLY_RADIUS * tilt * Math.PI / 180 * 100 + "% 0" });
      push.push({ rotate: -Math.max(0, tilt) * SWING_PUSH + "deg", zIndex: tilt > 0 ? -1 : "auto" });
    }
    tail.animate(push, SWING_COUNT * SWING_PERIOD);
    return spheal.animate(body, SWING_COUNT * SWING_PERIOD).finished;
  };

  // After every random pause does one of these, then waits for the next.
  let idles = [swing, smile];
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
  });
  blink();
  idle();
}

// Content starts blurred and sharpens as its section rises into the window, never faster than REVEAL_SPEED.
// A section shares one blur, so the text and the image beside it sharpen at once.
function revealContent() {
  let items = Array.from(document.getElementsByClassName("subsection"), (section) => ({ section, blur: REVEAL_BLUR }));
  let frame = 0;
  let lastTime = 0;

  let applyBlur = (item, i) => {
    item.section.style.filter = item.blur ? "blur(" + item.blur + "rem)" : "";
    item.section.style.setProperty("--below", (i + 1 < items.length ? items[i + 1].blur : 0) + "rem");
  };

  let update = (time) => {
    let step = REVEAL_SPEED * (time - lastTime) / 1000;
    lastTime = time;
    let line = REVEAL_LINE * innerHeight;
    let range = innerHeight - line;
    // Content at the end of the page may never rise past the line, so reaching the end sharpens it too.
    let end = Math.max(0, Math.min(1, (document.documentElement.scrollHeight - innerHeight - Math.ceil(scrollY)) / range));
    // Read all positions before writing any style to avoid a layout per element.
    let rects = items.map((item) => item.section.getBoundingClientRect());
    let settled = true;
    items.forEach((item, i) => {
      // Whatever left the window fades in again when it reappears.
      let hidden = rects[i].bottom < 0 || rects[i].top > innerHeight;
      let target = hidden ? REVEAL_BLUR : REVEAL_BLUR * end * Math.max(0, Math.min(1, (rects[i].top - line) / range));
      item.blur = hidden ? target : Math.max(target, item.blur - step);
      settled = settled && item.blur === target;
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
        lightScene();
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
