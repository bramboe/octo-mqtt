"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deepArrayEquals = void 0;
const arrayEquals_1 = require("./arrayEquals");
const deepArrayEquals = (arr1, arr2) => arr1.length === arr2.length && arr1.every((v, i) => (0, arrayEquals_1.arrayEquals)(v, arr2[i]));
exports.deepArrayEquals = deepArrayEquals;
//# sourceMappingURL=deepArrayEquals.js.map