"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shortToBytes = void 0;
const byte_1 = require("./byte");
const shortToBytes = (value) => [value >> 8, value].map(byte_1.byte);
exports.shortToBytes = shortToBytes;
//# sourceMappingURL=shortToBytes.js.map