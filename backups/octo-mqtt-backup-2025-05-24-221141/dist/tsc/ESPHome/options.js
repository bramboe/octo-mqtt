"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProxies = void 0;
const options_1 = require("../Utils/options");
const getProxies = () => {
    // Read fresh configuration each time instead of caching
    const options = (0, options_1.getRootOptions)();
    const proxies = options.bleProxies;
    if (Array.isArray(proxies)) {
        return proxies;
    }
    return [];
};
exports.getProxies = getProxies;
//# sourceMappingURL=options.js.map