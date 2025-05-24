"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateChecksum = void 0;
const byte_1 = require("../Utils/byte");
const sum_1 = require("../Utils/sum");
const calculateChecksum = (bytes) => (0, byte_1.byte)((bytes.reduce(sum_1.sum) ^ 0xff) + 1);
exports.calculateChecksum = calculateChecksum;
//# sourceMappingURL=calculateChecksum.js.map