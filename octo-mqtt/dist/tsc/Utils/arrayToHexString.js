"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.arrayToHexString = void 0;
const byte_1 = require("./byte");
const arrayToHexString = (bytes) => Array.from(bytes, (b) => (0, byte_1.byte)(b).toString(16).padStart(2, '0')).join('');
exports.arrayToHexString = arrayToHexString;
//# sourceMappingURL=arrayToHexString.js.map