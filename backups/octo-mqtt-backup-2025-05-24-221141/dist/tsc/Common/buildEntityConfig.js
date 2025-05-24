"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildEntityConfig = void 0;
const getString_1 = require("../Utils/getString");
const buildEntityConfig = (key, additionalConfig) => {
    if (typeof additionalConfig === 'string')
        additionalConfig = { category: additionalConfig };
    return {
        description: (0, getString_1.getString)(key),
        ...(additionalConfig || {}),
    };
};
exports.buildEntityConfig = buildEntityConfig;
//# sourceMappingURL=buildEntityConfig.js.map