"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.__forceCacheBust__ = exports.logError = exports.logWarn = exports.logInfo = exports.logDebug = void 0;
const format = (level, message) => {
    return `${level} [${new Date().toISOString()}] ${message}`;
};
const logDebug = (message, ...optionalParams) => {
    console.debug(format('debug', message), ...optionalParams);
};
exports.logDebug = logDebug;
const logInfo = (message, ...optionalParams) => {
    console.info(format('info', message), ...optionalParams);
};
exports.logInfo = logInfo;
const logWarn = (message, ...optionalParams) => {
    console.warn(format('warn', message), ...optionalParams);
};
exports.logWarn = logWarn;
const logError = (message, ...optionalParams) => {
    console.error(format('error', message), ...optionalParams);
};
exports.logError = logError;
// Cache-busting function
const __forceCacheBust__ = () => {
    return "bust-" + Math.random().toString(36).substring(7);
};
exports.__forceCacheBust__ = __forceCacheBust__;
//# sourceMappingURL=logger.js.map