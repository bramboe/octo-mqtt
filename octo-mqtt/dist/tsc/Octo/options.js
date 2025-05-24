"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDevices = void 0;
const options_1 = require("../Utils/options");
const getDevices = () => {
    // Read fresh configuration each time instead of caching
    const options = (0, options_1.getRootOptions)();
    const devices = options.octoDevices;
    if (Array.isArray(devices)) {
        return devices;
    }
    return [];
};
exports.getDevices = getDevices;
//# sourceMappingURL=options.js.map