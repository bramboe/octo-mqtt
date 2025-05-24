"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.intToBytes = void 0;
const byte_1 = require("./byte");
const intToBytes = (value) => [value >> 24, value >> 16, value >> 8, value].map(byte_1.byte);
exports.intToBytes = intToBytes;
//# sourceMappingURL=intToBytes.js.map