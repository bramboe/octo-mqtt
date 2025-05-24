"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hexStringToBytes = void 0;
const hexStringToBytes = (str) => {
    if (!str || str.length % 2 != 0) {
        return null;
    }
    const lowerCase = str.replace(/:/g, '').toLowerCase();
    const length = lowerCase.length / 2;
    const results = new Array(length);
    for (let index = 0; index < length; index++) {
        const byte = lowerCase.substring(index * 2, index * 2 + 2);
        results[index] = parseInt(byte, 16);
    }
    return results;
};
exports.hexStringToBytes = hexStringToBytes;
//# sourceMappingURL=hexStringToBytes.js.map