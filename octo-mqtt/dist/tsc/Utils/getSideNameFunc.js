"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSideNameFunc = void 0;
const sideNames = ['Left', 'Right'];
const getSideNameFunc = (items, getSideId) => items.length === 1 ? () => '' : (item) => sideNames[getSideId(item)];
exports.getSideNameFunc = getSideNameFunc;
//# sourceMappingURL=getSideNameFunc.js.map