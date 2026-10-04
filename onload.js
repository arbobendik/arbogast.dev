"use strict";

const IMAGE_FORMAT = "webp"
const HEADER_TEXT = "projects:";

const PATH_SCREENSHOT = "FlexLight/static/screenshots/screen";
const PATH_FLEXLIGHT = "FlexLight/loader.html?";
const PATH_2048 = "2048/?darkMode=";

async function fetchAsText(url) {
  return await (await fetch(url)).text();
}
// Do redirect before dom loading.
let urlParams = new URLSearchParams(location.search);
let page = urlParams.get("page");
if (page === null) location.search = "?page=home";

window.addEventListener("DOMContentLoaded", async () => {
  let container = document.getElementById("container");
  if (page !== "iframe") (async () => container.innerHTML = await fetchAsText(page + ".html"))();
  // let backgroundContainer = document.getElementById("background");
  let dsgvo = document.getElementById("dsgvo");
  let darkModeToggle = document.getElementById("darkMode");
  let name = document.getElementById("name");

  document.body.style.height = window.innerHeight;
  // createBackground(backgroundContainer);

  let updateStyle = () => {
    localStorage.setItem("darkMode", darkModeToggle.value);
    darkModeToggle.firstElementChild.src = darkModeToggle.value ? "icons/sun." + IMAGE_FORMAT : "icons/moon." + IMAGE_FORMAT;
    link.href = darkModeToggle.value ? "dark.css" : "light.css";
  };

  let link = document.createElement("link");
  link.rel = "stylesheet";
  darkModeToggle.value = (localStorage.getItem("darkMode") ?? "false") === "true";
  document.head.appendChild(link);

  updateStyle();

  darkModeToggle.addEventListener("pointerdown", (e) => {
    darkModeToggle.value = !darkModeToggle.value;
    updateStyle();
    e.preventDefault();
  });

  ["datenschutzerklaerung", "impressum"].forEach((item, i) => {
    let element = document.createElement("a");
		element.href = "?page=" + item;
    element.innerHTML = item.charAt(0).toUpperCase() + item.slice(1);
		element.style.marginRight = "4px";
    dsgvo.appendChild(element);
  });

  name.addEventListener("click", () => {
    location.search = "?page=home";
  });

  switch (page) {
    case "home":
      setTimeout(() => {
        Array.from(document.getElementsByClassName("projectLinks")).forEach((item, i) => {
          item.href = "?page=iframe&target=" + item.getAttribute("value");
        });

				let mainHeader = document.getElementById("mainHeader");
				let header = HEADER_TEXT;
				let startTime = 400;
				for (let i = 0; i < header.length; i++) {
					setTimeout(() => {
						mainHeader.innerHTML += "_";
					}, startTime + 100 * i);
					setTimeout(() => {
						mainHeader.innerHTML = header.slice(0, i + 1);
					}, startTime + 100 * i + 50 + Math.random() * 50);
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
      }, 500);
    	break;

    case "iframe":
      let iframe = document.createElement("iframe");


      switch (urlParams.get('target')) {
        case 'FlexLight/':
          let source = PATH_FLEXLIGHT
          for(const [key, value] of urlParams.entries()) source += key + '=' + value + '&';
          iframe.src = source;

          let ignoreInitial = true;
          iframe.addEventListener('load', () => {
            if(ignoreInitial) {
              // Pass on all search params
              ignoreInitial = false;
            } else {
              let iframeUrlParams = new URLSearchParams(iframe.contentWindow.location.search);
              for(const [key, value] of iframeUrlParams.entries()) urlParams.set(key, value);
              location.search = urlParams.toString();
            }
          });
          break;
        case "2048/":
          iframe.addEventListener("load", () => {
            let setDarkMode2048 = () => {
              let iframeUrlParams = new URLSearchParams(iframe.contentWindow.location.search);
              let page = iframeUrlParams.get("page") ?? "2048";
              iframe.src = PATH_2048 + darkModeToggle.value + "&page=" + page;
            };
            darkModeToggle.addEventListener("pointerdown", setDarkMode2048);
            setDarkMode2048();
          }, {once: true});
          break;
        default:
          iframe.src = urlParams.get("target");
          break;
      }
      container.appendChild(iframe);
      // Focus iframe to directly enable event listeners
      iframe.contentWindow.focus();
      break;
  }
});

