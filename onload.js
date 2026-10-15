"use strict";

const IMAGE_FORMAT = "webp";
const TYPING_START = 400;
const TYPING_INTERVAL = 100;

const PATH_SCREENSHOT = "FlexLight/static/screenshots/screen";
const PATH_FLEXLIGHT = "FlexLight/loader.html?";

// Only these pages and iframe targets are loaded, any other request shows home.
const PAGES = ["datenschutzerklaerung", "impressum"];
const TARGETS = ["FlexLight/", "NeuNet/", "Demo/"];

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
      break;
  }
});
