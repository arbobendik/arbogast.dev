"use strict";

(function () {

  class Game {
    #width;
    #height;
    #fields;
    #domField;
    #container;
    #pointerCoords;
    #key;
    #won = false;
    #alteredField = false;

    #deathMessage = [
      "HAHA! you've lost!!!<br>Need a retry?",
      "GAME OVER :(<br>Reset the game?",
      "Failed.<br>Too sad for you."
    ][Math.floor(Math.random() * 3)];

    #winMessage = [
      "You've won!!!<br> Wanna continue?",
      "You've done 2048!!!<br>But can you do 4096?",
      "Passed.<br>You may leave now."
    ][Math.floor(Math.random() * 3)];

    blockPopUp = false;
    blockTouch = false;
    darkMode = false;

    constructor (target, width, height) {
      target.innerHTML = "";
      this.#width = width;
      this.#height = height;
      this.#fields = new Array(3).fill(0);
      // Differentiate between localStorage objects for different field sizes.
      this.#key = "?key=" + width + "x" + height;
      this.#fields.forEach((item, i) => {
        this.#fields[i] = new Array(width);
      });
      this.#domField = new Array(width);
      this.#container = target;

      for (let x = 0; x < width; x++) {
        this.#fields.forEach((item, i) => this.#fields[i][x] = new Array(height).fill(0));
        this.#domField[x] = new Array(height);
      }

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let cell = document.createElement("div");
          cell.className = "cell";
          cell.style.minWidth = "min(" + 90 / width + "vw, " + 50 / width + "vh)";
          cell.style.minHeight = "min(" + 90 / width + "vw, " + 50 / width + "vh)";
          this.#domField[x][y] = cell;
          this.#container.appendChild(this.#domField[x][y]);
        }
      }

      this.#container.style.gridTemplateColumns = "repeat(" + width + ", auto)";
      if (localStorage.getItem("field0" + this.#key) === null || localStorage.getItem("field0" + this.#key) === "0") {
        this.reset();
      } else {
        this.#fields.forEach((item, i) => localStorage.getItem("field" + i + this.#key).split(",").forEach((elem, j) => item[Math.floor(j/height)][j%height] = Number(elem)));
      }
    }

    evalRow (values) {
      let newValues = new Array(values.length).fill(0);
      let nVIndex = 0;
      let score = 0;
      let allowMerge = false;
      for (let i = 0; i < values.length; i++) {
          if (allowMerge && newValues[nVIndex - 1] === values[i]) {
            values[i]++;
            score += 1 << values[i];
            newValues[nVIndex - 1] = values[i];
            allowMerge = false;
          } else if (values[i] !== 0) {
            newValues[nVIndex] = values[i];
            nVIndex ++;
            allowMerge = true;
          }
      }
      return newValues;
    }

    #evalRow (values) {
      let newValues = new Array(values.length).fill(0);
      let nVIndex = 0;
      let score = 0;

      let allowMerge = false;
      for (let i = 0; i < values.length; i++) {
          if (allowMerge && newValues[nVIndex - 1] === values[i]) {
            values[i]++;
            newValues[nVIndex - 1] = values[i];
            allowMerge = false;
            this.#alteredField = true;
            score += 1 << values[i];
          } else if (values[i] !== 0) {
            newValues[nVIndex] = values[i];
            nVIndex ++;
            allowMerge = true;
          }
      }

      for (let i in values) if (values[i] !== newValues[i]) this.#alteredField = true;
      score += Number(localStorage.getItem("score" + this.#key));
      localStorage.setItem("score" + this.#key, score);
      if (score > Number(localStorage.getItem("highScore" + this.#key))) localStorage.setItem("highScore" + this.#key, score);
      return newValues;
    }

    cloneArray (array) {
      if (!Array.isArray(array)) return array;
      let newArray = new Array(array.length);
      for (let i = 0; i < array.length; i++) newArray[i] = this.cloneArray(array[i]);
      return newArray;
    }

    isLost() {
      let found0 = this.#fields[0].some(item => item.includes(0));
      if (found0) return false;

      for (let x = 0; x < this.#fields[0].length; x++) {
        for (let y = 0; y < this.#fields[0][x].length; y++) {
          if (x + 1 !== this.#fields[0].length && this.#fields[0][x][y] === this.#fields[0][x + 1][y] || y + 1 !== this.#fields[0][x].length && this.#fields[0][x][y] === this.#fields[0][x][y + 1]) return false;
        }
      }

      return true;
    }

    isWon() {
      let counter2048 = 0;
      let counterGreater = 0;
      let counterPrevious1024 = 0;
      this.#fields[0].forEach((item, i) => {
        item.forEach((item, i) => {
          if (item === 11) counter2048++;
          if (item > 11) counterGreater++;
        });
      });
      this.#fields[1].forEach((item, i) => {
        item.forEach((item, i) => {
          if (item === 10) counterPrevious1024++;
        });
      });
      return counter2048 === 1 && counterGreater === 0 &&counterPrevious1024 === 2;
    }

    updateGui () {
      this.#fields.forEach((item, i) => localStorage.setItem("field" + i + this.#key, item));
      this.#fields[0].forEach((column, x) => {
        column.forEach((tileValue, y) => {
          this.#domField[x][y].innerHTML = tileValue? (2 ** tileValue) : "";

          if (darkMode) {
            if (tileValue === 0) this.#domField[x][y].style.backgroundColor = "#000";
            this.#domField[x][y].style.backgroundColor = "hsl(" + tileValue * 340 + ", "+ Math.min(tileValue * 70, 70) +"%, "+ Math.min(tileValue * 10 + 10, 30) +"%)";
          } else {
            this.#domField[x][y].style.backgroundColor = "hsl(" + tileValue * 340 + ", 70%, "+ Math.max(100 - tileValue * 15, 70) +"%)";
          }

          let chars = 5 + (tileValue + "").length;
          let pixelWidth = (Math.min(window.innerWidth, 0.5 * window.innerHeight) / this.#domField.length) * 2.5;
          this.#domField[x][y].style.fontSize = pixelWidth / chars + "px";
        });
      });

      let popUpMessage = document.getElementById("popUpMessage");
      let popUpReset = document.getElementById("popUpReset");
      let popUpContinue = document.getElementById("popUpContinue");
      let content = document.getElementById("content");
      if (this.isLost()) {
        popUpContinue.firstElementChild.src = "undo.png";
        showPopup(this.#deathMessage, this);
        popUpContinue.onpointerdown = () => {
          this.undo();
          hidePopUp(game);
          // Reset event to default
          popUpContinue.onpointerdown = () => {
            hidePopUp(game);
          };
        };
      } else {
        if (this.isWon() && !this.#won) {
          this.#won = true;
          showPopup(this.#winMessage, this);
        }
      }
      document.getElementById("scoreNow").innerHTML = localStorage.getItem("score" + this.#key);
      document.getElementById("highScore").innerHTML = localStorage.getItem("highScore" + this.#key);
    }

    reset () {
      ["score", "score1", "score2"].forEach((item, i) => localStorage.setItem(item + this.#key, 0));
      localStorage.setItem("undoCounter" + this.#key, 2);
      this.#fields.forEach((item, i) => this.#fields[i].forEach((column, x) => column.forEach(
        (tileValue, y) => this.#fields[i][x][y] = 0)));
        this.#fields[0][Math.floor(Math.random() * this.#width)][Math.floor(Math.random() * this.#height)] = Math.floor(Math.random() + 1.25);
        this.#won = false;
        this.updateGui();
      }

    move (x, y) {
      if (this.blockPopUp || this.blockTouch) return;
      let dx = x - this.#pointerCoords.x;
      let dy = y - this.#pointerCoords.y;
      this.#alteredField = false;
      let oldArray = this.cloneArray(this.#fields[0]);
      let oldScore = localStorage.getItem("score" + this.#key);
      if (Math.max(Math.abs(dy), Math.abs(dx)) <= 2) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        for (let x = 0; x < this.#fields[0].length; x++) {
          if (dy < 0) {
            this.#fields[0][x] = this.#evalRow(this.#fields[0][x]);
          } else {
            this.#fields[0][x] = this.#evalRow(this.#fields[0][x].reverse()).reverse();
          }
        }
      } else {
        for (let y = 0; y < this.#fields[0][0].length; y++) {
          let thisRow = [];
          for (let x = 0; x < this.#fields[0].length; x++) {
            thisRow.push(this.#fields[0][x][y])
          }
          if (dx < 0) {
            thisRow = this.#evalRow(thisRow);
          } else {
            thisRow = this.#evalRow(thisRow.reverse()).reverse();
          }
          for (let x = 0; x < this.#fields[0].length; x++) {
            this.#fields[0][x][y] = thisRow[x];
          }
        }
      }

      if (this.#alteredField) {
        let freeTiles = []
        this.#fields[0].forEach((column, x) => {
          column.forEach((tileValue, y) => {
            if (tileValue === 0) freeTiles.push({x: x, y: y});
          });
        });
        localStorage.setItem("score2" + this.#key, localStorage.getItem("score1" + this.#key));
        localStorage.setItem("score1" + this.#key, oldScore);
        let undoCounter = Number(localStorage.getItem("undoCounter" + this.#key));
        if (undoCounter > 0) undoCounter--;
        localStorage.setItem("undoCounter" + this.#key, undoCounter);
        let newTile = freeTiles[Math.floor(Math.random() * freeTiles.length)];
        let value = Math.floor(Math.random() + 1.25);
        this.#fields[0][newTile.x][newTile.y] = value;
        this.#fields[2] = this.cloneArray(this.#fields[1]);
        this.#fields[1] = oldArray;

        this.updateGui();
      }
    }

    updateCoords (x, y) {
      if (this.blockPopUp || this.blockTouch) return;
      this.#pointerCoords = {
        x: x,
        y: y
      };
    }

    undo () {
      let undoCounter = Number(localStorage.getItem("undoCounter" + this.#key));
      let undoLastStep = () => {
        localStorage.setItem("undoCounter" + this.#key, undoCounter + 1);
        this.#fields[0] =  this.cloneArray(this.#fields[1]);
        this.#fields[1] =  this.cloneArray(this.#fields[2]);
        localStorage.setItem("score" + this.#key, localStorage.getItem("score1" + this.#key));
        localStorage.setItem("score1" + this.#key, localStorage.getItem("score2" + this.#key));
        this.#won = false;
        this.updateGui();
      }
      if (Array.isArray(this.#fields[1])) {
        // Undo first step everytime
        if (undoCounter === 0) undoLastStep();
      }
    }
  }

  let urlParams = new URLSearchParams(location.search);

  let openPopUp = document.getElementById("openPopUp2048");
  let undoButton = document.getElementById("undo2048");

  let popUpReset = document.getElementById("popUpReset");
  let popUpMenu = document.getElementById("popUpMenu");
  let popUpContinue = document.getElementById("popUpContinue");

  let popUp = document.getElementById("popUp");
  let content = document.getElementById("content");
  let gameContainer = document.getElementById("container");

  document.body.style.height = window.innerHeight;
  let game = new Game(gameContainer, Number(localStorage.getItem("width") || 4), Number(localStorage.getItem("height") || 4));

  let updateStyle = () => link.href = darkMode ? "dark.css" : "light.css";

  undoButton.onpointerdown = () => game.undo();
  openPopUp.onpointerdown = () => {
    showPopup("Reset game ?<br>Go to menu <br>or continue.", game);
  };

  setTimeout(() => game.updateGui(), 500);

  popUpReset.style.display = "flex";
  popUpReset.onpointerdown = () => {
    game.reset();
    hidePopUp(game);
  };
  popUpMenu.style.marginLeft = "min(2.5vh, 5vw)";
  popUpMenu.onpointerdown = () => {
    loadScript("menu");
    resetHtml("menu");
    hidePopUp(game);
  };

  popUpContinue.onpointerdown = () => {
    hidePopUp(game);
  };

  window.ontouchstart = (e) => {
    game.blockTouch = false;
    game.updateCoords(e.touches[0].screenX, e.touches[0].screenY);
  };
  window.ontouchmove = (e) => {
    game.move(e.changedTouches[0].screenX, e.changedTouches[0].screenY);
    game.blockTouch = true;
  };

  window.onmousedown = (e) => {
    if (e.which === 1) game.updateCoords(e.x, e.y);
  }
  window.onmouseup = (e) => {
    if (e.which === 1) game.move(e.x, e.y);
  }

  window.onkeyup = (e) => {
    game.updateCoords(0, 0);
    switch (e.key) {
      case "ArrowUp":
        game.move(0, -100);
        break;
      case "ArrowDown":
        game.move(0, 100);
        break;
      case "ArrowRight":
        game.move(100, 0);
        break;
      case "ArrowLeft":
        game.move(-100, 0);
        break;
    }
  }

  let onWheelTime = performance.now();
  let onWheel = false;
  window.onwheel = (e) => {
    if (onWheelTime + 100 < performance.now()){
      game.updateCoords(0, 0);
      game.move(e.deltaX, e.deltaY);
    }
    onWheelTime = performance.now();
  }

  window.ontouchend = (e) => game.blockTouch = false;
  window.ontouchcancel = (e) => game.blockTouch = false;
})();
