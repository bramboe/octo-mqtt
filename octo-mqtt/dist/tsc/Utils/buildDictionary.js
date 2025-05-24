"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDictionary = void 0;
const buildDictionary = (items, mapper) => {
    return items.reduce((acc, item) => {
        const { key, value } = mapper(item);
        acc[key] = value;
        return acc;
    }, {});
};
exports.buildDictionary = buildDictionary;
//# sourceMappingURL=buildDictionary.js.map