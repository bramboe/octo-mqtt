"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Sensor = void 0;
const StatefulEntity_1 = require("./base/StatefulEntity");
class Sensor extends StatefulEntity_1.StatefulEntity {
    constructor(mqtt, deviceData, entityConfig) {
        super(mqtt, deviceData, entityConfig, 'sensor');
    }
}
exports.Sensor = Sensor;
//# sourceMappingURL=Sensor.js.map