"use strict";

const MinFields = 2;
const MaxFields = 8;

let link = document.createElement("link");
link.rel = "stylesheet";
let urlParams = new URLSearchParams(location.search);
let darkMode = (urlParams.get("darkMode") ?? "false") === "true";

let fetchAsText = async (url) => await (await fetch(url)).text();
let script = document.createElement("script");

window.addEventListener("DOMContentLoaded", async () => {

  let urlParams = new URLSearchParams(location.search);

  let backgroundContainer = document.getElementById("background");
  createBackground(backgroundContainer);

  let page = (urlParams.get("page") === null) ? "2048" : urlParams.get("page");
  urlParams.set("page", page);
  if (!["2048", "menu", "createNew", ""].includes(urlParams.get("page"))) return;

  resetHtml(page);

  script = document.createElement("script");
  script.src = page + ".js";
  document.head.appendChild(script);

  document.head.appendChild(link);
  link.href = darkMode ? "dark.css" : "light.css";
  document.body.style.height = window.innerHeight;
});

function loadScript (page) {
  document.head.removeChild(script);
  script = document.createElement("script");
  script.src = page + ".js";
  document.head.appendChild(script);
}

function resetHtml (page) {
  window.onhashchange = null;
  location.hash = "#" + page;
  window.onhashchange = () => hashChanged();
  let frameCollection = document.getElementsByClassName("frame");
  for (let i = 0; i < frameCollection.length; i++) frameCollection.item(i).style.display = "none";
  let id = "frame" + page[0].toUpperCase() + page.substring(1);
  document.getElementById(id).style.display = "flex";
}

function hashChanged () {
  if (!["#2048", "#menu", "#createNew"].includes(location.hash)) return;
  let page = location.hash.slice(1);
  location.search = "?darkMode=" + urlParams.get("darkMode") + "&page=" + page;
  hidePopUp();
  resetHtml(page);
  loadScript(page);
}

function showPopup (message, game) {
  if (typeof(game) !== 'undefined') game.blockPopUp = true;
  document.getElementById("popUpMessage").innerHTML = message;
  document.getElementById("content").style.filter = "blur(5vmin) grayscale(50%)";
  document.getElementById("popUpFrame").style.display = "flex";
}

function hidePopUp (game) {
  if (typeof(game) !== 'undefined') game.blockPopUp = false;
  // Reset commonly changed visual properties on popUp elements
  let popUpContinue = document.getElementById("popUpContinue");
  let popUpReset = document.getElementById("popUpReset");
  let popUpMenu = document.getElementById("popUpMenu");
  popUpReset.firstElementChild.src = "reset.png";
  popUpMenu.style.display = "flex";
  popUpContinue.firstElementChild.src = "continue.png";
  // hide popUp
  document.getElementById("content").style.filter = "none";
  document.getElementById("popUpFrame").style.display = "none";
}

function createBackground (target) {
  let tiles = [];
  new Array(4).fill(0).map(() => new Array(4).fill(0)).forEach((tileRow, row) => {
    tileRow.forEach((tile , column) => {
      let element = document.createElement("div");
      element.setAttribute("class", "backgroundTiles");
      element.style.top = 100 * row / 4 + "vh";
      element.style.left = 100 * column / 4 + "vw";
      element.t = Math.random() * 360;
      tiles.push(element),
      target.appendChild(element)
    });
  });

  setInterval(() => tiles.forEach((e) => e.style.background=`hsl(${e.t++}, 100%, 50%)`), 100 / 3);
}
