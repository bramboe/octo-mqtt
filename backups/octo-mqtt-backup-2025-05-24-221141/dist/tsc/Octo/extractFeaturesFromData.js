"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractFeatureValuePairFromData = void 0;
const logger_1 = require("../Utils/logger");
const extractFeatureValuePairFromData = (data) => {
    try {
        const arr = Array.from(data);
        if (arr.length === 0) {
            (0, logger_1.logWarn)('[Octo] Received empty data array for feature extraction');
            return null;
        }
        // Require at least 6 bytes for a valid feature payload
        if (arr.length < 6) {
            (0, logger_1.logWarn)(`[Octo] Received too short data array for feature extraction: ${arr.length} bytes`);
            return null;
        }
        const feature = arr.splice(0, 3).reduce((val, byte) => (val << 8) + byte, 0);
        arr.splice(0, 1)[0]; // flag?
        // Get skip length
        const skipLength = arr.splice(0, 1)[0];
        // Ensure we have enough bytes remaining
        if (arr.length < skipLength + 1) {
            (0, logger_1.logWarn)(`[Octo] Not enough bytes remaining for feature ${feature.toString(16)}: expected ${skipLength + 1}, got ${arr.length}`);
            return null;
        }
        arr.splice(0, skipLength + 1); // ??
        const value = arr;
        return { feature, value };
    }
    catch (error) {
        (0, logger_1.logWarn)(`[Octo] Error extracting feature data: ${error}`);
        return null;
    }
};
exports.extractFeatureValuePairFromData = extractFeatureValuePairFromData;
//# sourceMappingURL=extractFeaturesFromData.js.map