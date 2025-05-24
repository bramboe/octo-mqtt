"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.round = void 0;
const round = (value, dp) => {
    const multiplier = Math.pow(10, dp);
    return Math.round(value * multiplier) / multiplier;
};
exports.round = round;
//# sourceMappingURL=round.js.map