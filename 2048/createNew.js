"use strict";


(function () {
  document.getElementById("returnMenu").onpointerdown = () => {
    loadScript("menu");
    resetHtml("menu");
  };

  let widthSelect = document.getElementById("width");
  let heightSelect = document.getElementById("height");
  widthSelect.innerHTML = "";
  heightSelect.innerHTML = "";

  for (let i = MinFields; i < MaxFields + 1; i++) {
    let widthChild = document.createElement("opt");
    let heightChild = document.createElement("opt");
    widthChild.innerHTML = i;
    heightChild.innerHTML = i;
    widthSelect.appendChild(widthChild);
    heightSelect.appendChild(heightChild);
  }

  let widthChildHeight = widthSelect.firstElementChild.clientHeight;
  let heightChildHeight = heightSelect.firstElementChild.clientHeight;

  widthSelect.scrollTop = widthChildHeight * 2;
  heightSelect.scrollTop = heightChildHeight * 2;

  let widthSelectScroll = widthSelect.scrollTop;
  let heightSelectScroll = heightSelect.scrollTop;

  widthSelect.onscroll = (e) => {
    widthChildHeight = widthSelect.firstElementChild.clientHeight;
    widthSelect.scrollTop -= 1 / 60 * (widthSelect.scrollTop - widthSelectScroll);
    widthSelectScroll = widthSelect.scrollTop;
    let target = Math.round(widthSelect.scrollTop / widthChildHeight);
    widthSelect.target = 2 + target;
    widthSelect.scrollTop -= 1 / 60 * (widthSelect.scrollTop - target * widthChildHeight);
  };

  heightSelect.onscroll = (e) => {
    heightChildHeight = heightSelect.firstElementChild.clientHeight;
    heightSelect.scrollTop -= 1 / 60 * (heightSelect.scrollTop - heightSelectScroll)
    heightSelectScroll = heightSelect.scrollTop;
    let target = Math.round(heightSelect.scrollTop / heightChildHeight);
    heightSelect.target = 2 + target;
    heightSelect.scrollTop -= 1 / 60 * (heightSelect.scrollTop - target * heightChildHeight);
  };

  document.getElementById("createGame").onpointerdown = () => {
    localStorage.setItem("width", Math.max(widthSelect.target, heightSelect.target));
    localStorage.setItem("height", Math.min(widthSelect.target, heightSelect.target));
    resetHtml("2048");
    loadScript("2048");
  };
})();
