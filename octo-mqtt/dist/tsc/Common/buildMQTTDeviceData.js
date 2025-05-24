"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildMQTTDeviceData = void 0;
const safeId_1 = require("../Utils/safeId");
const buildMQTTDeviceData = ({ friendlyName, name, address }, manufacturer) => {
    return {
        deviceTopic: `${(0, safeId_1.safeId)(manufacturer)}/${(0, safeId_1.safeId)(address.toString())}`,
        device: {
            ids: [`${address}`],
            name: friendlyName,
            mf: manufacturer,
            mdl: name,
        },
    };
};
exports.buildMQTTDeviceData = buildMQTTDeviceData;
//# sourceMappingURL=buildMQTTDeviceData.js.map