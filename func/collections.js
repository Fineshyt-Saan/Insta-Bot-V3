/**
 * Collections and Data Structures
 * MultiMap, ConsoleArray, PythonDict, ObjectX, OBJQuery, Datum
 */

class MultiMap {
  constructor() {
    this.map = new Map();
  }

  set(key, value) {
    this.map.set(key, value);
    return this;
  }

  addOne(key, value) {
    this.map.set(key, value);
    return this;
  }

  get(key) {
    return this.map.get(key);
  }

  getOne(key) {
    return this.map.get(key);
  }

  has(key) {
    return this.map.has(key);
  }

  delete(key) {
    return this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }

  get size() {
    return this.map.size;
  }

  entries() {
    return Array.from(this.map.entries());
  }

  values() {
    return Array.from(this.map.values());
  }

  keys() {
    return Array.from(this.map.keys());
  }

  findOne(predicate) {
    for (const [key, value] of this.map.entries()) {
      if (predicate(key, value)) return [key, value];
    }
    return null;
  }

  deleteRefs(entries) {
    for (const [key] of entries) {
      this.map.delete(key);
    }
  }

  toUnique(keyFn) {
    const seen = new Set();
    const result = new Map();
    for (const [k, v] of this.map.entries()) {
      const key = keyFn ? keyFn(v) : k;
      if (!seen.has(key)) {
        seen.add(key);
        result.set(k, v);
      }
    }
    return result;
  }
}

class ConsoleArray {
  constructor(maxSize = 200) {
    this.maxSize = maxSize;
    this.logs = [];
  }

  push(...items) {
    this.logs.push(...items);
    if (this.logs.length > this.maxSize) {
      this.logs.splice(0, this.logs.length - this.maxSize);
    }
    return this.logs.length;
  }

  get length() {
    return this.logs.length;
  }

  getAll() {
    return [...this.logs];
  }

  clear() {
    this.logs = [];
  }
}

class PythonDict {
  constructor(initial = {}) {
    this._data = { ...initial };
  }

  get(key, defaultValue = null) {
    return this._data[key] !== undefined ? this._data[key] : defaultValue;
  }

  set(key, value) {
    this._data[key] = value;
    return this;
  }

  keys() {
    return Object.keys(this._data);
  }

  values() {
    return Object.values(this._data);
  }

  items() {
    return Object.entries(this._data);
  }

  has(key) {
    return key in this._data;
  }

  delete(key) {
    delete this._data[key];
  }
}

const OBJQuery = {
  get(obj, path, defaultValue = undefined) {
    if (!obj) return defaultValue;
    const parts = Array.isArray(path) ? path : path.split(".");
    let curr = obj;
    for (const p of parts) {
      if (curr === null || curr === undefined) return defaultValue;
      curr = curr[p];
    }
    return curr !== undefined ? curr : defaultValue;
  },

  set(obj, path, value) {
    if (!obj) return obj;
    const parts = Array.isArray(path) ? path : path.split(".");
    let curr = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (!(p in curr) || typeof curr[p] !== "object" || curr[p] === null) {
        curr[p] = {};
      }
      curr = curr[p];
    }
    curr[parts[parts.length - 1]] = value;
    return obj;
  }
};

const Datum = {
  toUniqueArray(arr, keyFn) {
    const seen = new Set();
    const res = [];
    for (const item of arr) {
      const key = keyFn ? keyFn(item) : item;
      if (!seen.has(key)) {
        seen.add(key);
        res.push(item);
      }
    }
    return res;
  }
};

module.exports = {
  MultiMap,
  ConsoleArray,
  PythonDict,
  OBJQuery,
  Datum
};
