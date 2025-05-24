"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.arrayEquals = void 0;
const arrayEquals = (arr1, arr2) => arr1.length === arr2.length && arr1.every((v, i) => v === arr2[i]);
exports.arrayEquals = arrayEquals;
//# sourceMappingURL=arrayEquals.js.map