"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.byte = void 0;
const byte = (value) => {
    while (value < 0) {
        value += 0xff;
    }
    return value & 0xff;
};
exports.byte = byte;
//# sourceMappingURL=byte.js.map