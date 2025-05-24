"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.minutes = void 0;
const seconds_1 = require("./seconds");
const minutes = (numMinutes) => numMinutes * (0, seconds_1.seconds)(60);
exports.minutes = minutes;
//# sourceMappingURL=minutes.js.map