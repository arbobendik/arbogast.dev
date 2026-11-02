"use strict";

const IMAGE_FORMAT = "webp";
const TYPING_START = 400;
const TYPING_INTERVAL = 100;
// Distance from the light, as a fraction of vmin, at which shadows reach full length.
const LIGHT_RANGE = .5;
const LIGHT_ORBIT_PERIOD = 20000;

const PATH_SCREENSHOT = "FlexLight/static/screenshots/screen";
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
  let root = document.documentElement;
  let elements = document.querySelectorAll("h1, h2, p, li, .button, #name, #nav, #dsgvo");
  let x = 0;
  let y = 0;
  let frame = 0;
  let following = false;

  let update = () => {
    frame = 0;
    root.style.setProperty("--px", x + "px");
    root.style.setProperty("--py", y + "px");
    let range = LIGHT_RANGE * Math.min(innerWidth, innerHeight);
    // Read all positions before writing any style to avoid a layout per element.
    let rects = Array.from(elements, (element) => element.getBoundingClientRect());
    elements.forEach((element, i) => {
      let rect = rects[i];
      let dx = (rect.left + rect.width / 2 - x) / range;
      let dy = (rect.top + rect.height / 2 - y) / range;
      let length = Math.max(1, Math.hypot(dx, dy));
      element.style.setProperty("--sx", dx / length);
      element.style.setProperty("--sy", dy / length);
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

      if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
        Array.from(document.getElementsByClassName("typed")).forEach(typeHeader);
        lightScene();
      }

      let img = document.getElementById("originalImage");
      let shadow = document.getElementById("imageShadow");

      let screenNum = Math.floor(Math.random() * 5);

      let updateImage = () => {
        let src = PATH_SCREENSHOT + screenNum % 5 + "." + IMAGE_FORMAT;
        img.src = src;
        shadow.src = src;
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
