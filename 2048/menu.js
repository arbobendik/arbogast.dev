"use strict";

(function () {
  let saveTileContainer = document.getElementById("saveTileContainer");

  let reallocateColumns = () => {
    saveTileContainer.style.gridTemplateColumns = "repeat(" + (1 + Math.floor(window.innerWidth / window.innerHeight * 2)) + ", auto)";
  }

  window.onresize = reallocateColumns;
  reallocateColumns();

  saveTileContainer.innerHTML = "";

  for (let width = MinFields; width < MaxFields + 1; width++) {
    for (let height = MinFields; height <= width; height++) {
      let key = "?key=" + width + "x" + height;
      let score = Number(localStorage.getItem("score" + key));

      if (score === null || score === 0) continue;

      let alignmentBox = document.createElement("div");
      alignmentBox.className = "alignmentBox";

      let saveTile = document.createElement("div");
      saveTile.style.height = "min(" + 40 * height / width + "vw, " + 20 * height / width + "vh)";
      saveTile.className = "saveTile";
      saveTile.style.gridTemplateColumns = "repeat(" + width + ", auto)";
      saveTile.style.borderRadius = "min(" + 20 / width + "vw, " + 10 / width + "vh)";

      let field = new Array(width).fill(0).map(() => new Array(height));
      let domField = new Array(width).fill(0).map(() => new Array(height));
      localStorage.getItem("field0" + key).split(",").forEach((elem, j) => field[Math.floor(j/height)][j%height] = Number(elem));
      field.forEach((column, x) => {
        column.forEach((tileValue, y) => {
          let saveTileField = document.createElement("div");
          saveTileField.style.minWidth = "min(" + 40 / width + "vw, " + 20 / width + "vh)";
          saveTileField.style.minHeight = "min(" + 40 / width + "vw, " + 20 / width + "vh)";
          saveTileField.className = "cell";
          saveTileField.innerHTML = tileValue? (1 << tileValue) : "";

          if (darkMode) {
            if (tileValue === 0) saveTileField.style.backgroundColor = "#000";
            saveTileField.style.backgroundColor = "hsl(" + tileValue * 340 + ", "+ Math.min(tileValue * 70, 70) +"%, "+ Math.min(tileValue * 10 + 10, 30) +"%)";
          } else {
            saveTileField.style.backgroundColor = "hsl(" + tileValue * 340 + ", 70%, "+ Math.max(100 - tileValue * 15, 70) +"%)";
          }

          let chars = 5 + saveTileField.innerHTML.length;
          let pixelWidth = (window.innerWidth / width);
          saveTileField.style.fontSize = "min(" + 0.05 * pixelWidth / chars + "vh, " + 0.15 * pixelWidth / chars + "vw)";

          domField[x][y] = saveTileField;
        });
      });

      for (let y = 0; y < domField[0].length; y++) {
        for (let x = 0; x < domField.length; x++) {
          saveTile.appendChild(domField[x][y]);
          alignmentBox.appendChild(saveTile);
        }
      }
      saveTileContainer.appendChild(alignmentBox);

      let originalE;
      let timeout;
      saveTile.onpointerup = (e) => {
        clearTimeout(timeout);
        let len = Math.sqrt(
          (originalE.pageX - e.pageX) ** 2
          + (originalE.pageY - e.pageY) ** 2
        );
        if (len <= 10) {
          localStorage.setItem("width", width);
          localStorage.setItem("height", height);
          loadScript("2048");
          resetHtml("2048");
        }
      }
      saveTile.onpointerdown = (e) => {
        originalE = e
        timeout = setTimeout(() => {
          // Cancel ontouchend event by overwriting it
          saveTile.onpointerup = null;
          // Modify popUp window
          let popUpContinue = document.getElementById("popUpContinue");
          let popUpReset = document.getElementById("popUpReset");
          let popUpMenu = document.getElementById("popUpMenu");
          popUpMenu.style.display = "none";
          popUpReset.onpointerdown = () => hidePopUp();
          popUpReset.firstElementChild.src = "cross.png";
          popUpContinue.firstElementChild.src = "bin.png";
          popUpContinue.onpointerdown = () => {
            // Delete actual save data
            localStorage.setItem("score" + key, 0);
            for (let i = 0; i < 3; i++) localStorage.setItem("field" + i + key, 0);
            if (width === Number(localStorage.getItem("width")) && height === Number(localStorage.getItem("height"))){
              localStorage.setItem("width", 4);
              localStorage.setItem("height", 4);
            }
            // Update UI
            alignmentBox.style.display = "none";
            hidePopUp();
          }
          showPopup("Delete this <br>" + width + "x" + height +" game?");
        }, 1000);
      };
    }
  }

  let addGameBox = document.createElement("div");
  addGameBox.className = "alignmentBox";

  let addGameTile  = document.createElement("div");
  addGameTile.className = "saveTile";
  addGameTile.id = "addGameTile";

  let addGame = document.createElement("img");
  addGame.className = "button";
  addGame.src = "plus.png";
  addGame.id = "addGame";
  addGame.onpointerdown = () => {
    loadScript("createNew");
    resetHtml("createNew");
  };
  addGameTile.appendChild(addGame);
  addGameBox.appendChild(addGameTile);
  saveTileContainer.appendChild(addGameBox);

  let bottomMargin = document.createElement("div");
  bottomMargin.className = "saveMenu";
  saveTileContainer.appendChild(bottomMargin);

  // Restore previous scroll after switch to dark mode
  saveTileContainer.scrollTop = localStorage.getItem("scrollMenu") ?? 0;
  localStorage.setItem("scrollMenu", 0);
})();
