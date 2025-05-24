"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRootOptions = void 0;
const tslib_1 = require("tslib");
const fs_1 = require("fs");
const logger_1 = require("./logger");
const path_1 = tslib_1.__importDefault(require("path"));
// Export the options
const getRootOptions = () => {
    try {
        // Try production path first (/data/options.json)
        let optionsPath = '/data/options.json';
        let fileContents;
        try {
            (0, logger_1.logInfo)('[Options] Attempting to read /data/options.json');
            fileContents = (0, fs_1.readFileSync)(optionsPath);
        }
        catch (err) {
            // If production path fails, try local development path
            optionsPath = path_1.default.join(process.cwd(), 'data', 'options.json');
            (0, logger_1.logInfo)(`[Options] Production path failed, trying local path: ${optionsPath}`);
            fileContents = (0, fs_1.readFileSync)(optionsPath);
        }
        const options = JSON.parse(fileContents.toString());
        // Ensure octoDevices array exists (initialize if missing)
        if (!options.octoDevices) {
            options.octoDevices = [];
        }
        (0, logger_1.logInfo)(`[Options] Successfully loaded options from ${optionsPath}`);
        return options;
    }
    catch (err) {
        (0, logger_1.logError)('[Options] Failed to read options:', err);
        // Empty fallback options
        const emptyOptions = {
            bleProxies: [],
            octoDevices: []
        };
        (0, logger_1.logError)('[Options] Using empty default options');
        return emptyOptions;
    }
};
exports.getRootOptions = getRootOptions;
//# sourceMappingURL=options.js.map