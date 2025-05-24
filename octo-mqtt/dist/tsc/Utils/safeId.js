"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeId = void 0;
const safeId = (value) => {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .replace(/__+/, '_');
};
exports.safeId = safeId;
//# sourceMappingURL=safeId.js.map