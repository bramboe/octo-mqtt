"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinarySensor = void 0;
const StatefulEntity_1 = require("./base/StatefulEntity");
class BinarySensor extends StatefulEntity_1.StatefulEntity {
    constructor(mqtt, deviceData, config) {
        super(mqtt, deviceData, config, 'binary_sensor');
    }
    mapState(state) {
        return state ? 'ON' : 'OFF';
    }
}
exports.BinarySensor = BinarySensor;
//# sourceMappingURL=BinarySensor.js.map