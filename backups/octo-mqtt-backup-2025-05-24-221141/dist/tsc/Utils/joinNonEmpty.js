"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.joinNonEmpty = void 0;
const notEmpty_1 = require("./notEmpty");
const joinNonEmpty = (separator, ...items) => items
    .filter(notEmpty_1.notEmpty)
    .filter((item) => item !== '')
    .join(separator);
exports.joinNonEmpty = joinNonEmpty;
//# sourceMappingURL=joinNonEmpty.js.map