"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mocked = exports.testDevice = void 0;
exports.testDevice = {
    deviceTopic: 'device_topic',
    device: {
        ids: ['id'],
        name: 'Test Name',
        mf: 'Test mf',
        mdl: 'Test mdl',
    },
};
const mocked = (func) => func;
exports.mocked = mocked;
//# sourceMappingURL=testHelpers.js.map