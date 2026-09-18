/**
 * Cassidy Utility Functions and Classes
 * FileControl, UTYPlayer, delay, chance, range, ClassV, MathNum, etc.
 */

const fs = require("fs-extra");
const path = require("path");

class FileControl {
  constructor(filePath, options = { strict: false, sync: true }) {
    this.path = filePath;
    this.strict = options.strict;
    this.sync = options.sync;
  }

  content(encoding = "utf-8") {
    if (this.sync) {
      try {
        return fs.readFileSync(this.path, encoding);
      } catch (err) {
        if (this.strict) throw err;
        return null;
      }
    }
    return fs.promises.readFile(this.path, encoding).catch(err => {
      if (this.strict) throw err;
      return null;
    });
  }

  write(content, encoding = "utf-8") {
    if (this.sync) {
      try {
        fs.writeFileSync(this.path, content, encoding);
        return true;
      } catch (err) {
        if (this.strict) throw err;
        return false;
      }
    }
    return fs.promises.writeFile(this.path, content, encoding).then(() => true).catch(err => {
      if (this.strict) throw err;
      return false;
    });
  }

  exists() {
    return fs.existsSync(this.path);
  }

  delete() {
    try {
      fs.unlinkSync(this.path);
      return true;
    } catch (err) {
      if (this.strict) throw err;
      return false;
    }
  }

  isDirectory() {
    try {
      return fs.statSync(this.path).isDirectory();
    } catch {
      return false;
    }
  }

  files() {
    try {
      return fs.readdirSync(this.path);
    } catch {
      return [];
    }
  }
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function chance(probability) {
  return Math.random() < probability;
}

function range(start, end, step = 1) {
  const result = [];
  for (let i = start; i < end; i += step) {
    result.push(i);
  }
  return result;
}

function randArrValue(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function randArrIndex(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return -1;
  return Math.floor(Math.random() * arr.length);
}

function randObjKey(obj) {
  const keys = Object.keys(obj || {});
  return keys[Math.floor(Math.random() * keys.length)];
}

function randObjValue(obj) {
  const values = Object.values(obj || {});
  return values[Math.floor(Math.random() * values.length)];
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

class Tiles {
  constructor({
    sizeX = 5,
    sizeY = 5,
    tileIcon = "🟨",
    bombIcon = "💣",
    coinIcon = "💰",
    emptyIcon = "⬜"
  } = {}) {
    this.size = [Number(sizeX), Number(sizeY)];
    this.tileIcon = tileIcon;
    this.emptyIcon = emptyIcon;
    this.bombIcon = bombIcon;
    this.coinIcon = coinIcon;
    this.board = this.generateFirstBoard();
    this.state = this.generateEmptyBoard();
  }

  randomTile() {
    const types = [this.emptyIcon, this.bombIcon, this.coinIcon, this.bombIcon, this.coinIcon];
    return types[Math.floor(Math.random() * types.length)];
  }

  generateFirstBoard() {
    const board = [];
    for (let i = 0; i < this.size[0]; i++) {
      for (let j = 0; j < this.size[1]; j++) {
        board.push(this.randomTile());
      }
    }
    return board;
  }

  generateEmptyBoard() {
    const board = [];
    for (let i = 0; i < this.size[0]; i++) {
      for (let j = 0; j < this.size[1]; j++) {
        board.push(this.tileIcon);
      }
    }
    return board;
  }

  range() {
    return [1, this.board.length];
  }

  reveal() {
    for (const index in this.board) {
      this.state[index] = this.board[index];
    }
  }

  isEnd() {
    return !this.state.includes(this.tileIcon);
  }

  choose(num) {
    if (this.isOutRange(num)) return "OUT_OF_RANGE";
    if (!this.isFree(num)) return "ALREADY_CHOSEN";
    if (this.isBomb(num)) {
      this.state[num - 1] = this.bombIcon;
      return "BOMB";
    }
    if (this.isCoin(num)) {
      this.state[num - 1] = this.coinIcon;
      return "COIN";
    }
    if (this.isEmpty(num)) {
      this.state[num - 1] = this.emptyIcon;
      return "EMPTY";
    }
    return "UNKNOWN_ERROR";
  }

  isBomb(num) {
    return this.board[num - 1] === this.bombIcon;
  }

  isOutRange(num) {
    return !this.board[num - 1];
  }

  isEmpty(num) {
    return this.board[num - 1] === this.emptyIcon;
  }

  isCoin(num) {
    return this.board[num - 1] === this.coinIcon;
  }

  isFree(num) {
    const types = [this.emptyIcon, this.bombIcon, this.coinIcon];
    return !types.includes(this.state[num - 1]);
  }

  toString() {
    let result = "";
    for (let i = 0; i < this.size[0]; i++) {
      result += Tiles.numberTile((i + 1) * this.size[1] - (this.size[1] - 1));
      result += this.state.slice(i * this.size[1], (i + 1) * this.size[1]).join("");
      result += Tiles.numberTile((i + 1) * this.size[1]);
      result += "\n";
    }
    return result;
  }

  static numberTile(number) {
    const map = [" 0 ", " 1 ", " 2 ", " 3 ", " 4 ", " 5 ", " 6 ", " 7 ", " 8 ", " 9 "];
    const numberStr = String(number);
    let result = "";
    if (number < 10) {
      result += map[0];
    }
    for (let digit of numberStr) {
      digit = Number(digit);
      if (digit >= 0 && digit <= 9) {
        result += map[digit];
      } else {
        result += "❓";
      }
    }
    return result;
  }
}

const StylerGlobal = {
  CassidyResponseStylerControl: require("./styler.js").CassidyResponseStylerControl
};

module.exports = {
  FileControl,
  delay,
  chance,
  range,
  randArrValue,
  randArrIndex,
  randObjKey,
  randObjValue,
  deepClone,
  Tiles,
  StylerGlobal
};
