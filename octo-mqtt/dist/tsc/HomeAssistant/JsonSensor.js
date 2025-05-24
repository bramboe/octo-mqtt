"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonSensor = void 0;
const Sensor_1 = require("./Sensor");
class JsonSensor extends Sensor_1.Sensor {
    constructor(mqtt, deviceData, { valueField = 'value', ...config }) {
        super(mqtt, deviceData, config);
        this.valueField = valueField;
    }
    mapState(state) {
        return state === undefined ? {} : state;
    }
    discoveryState() {
        const value_template = [`default('')`];
        if (this.valueField)
            value_template.unshift(`value_json.${this.valueField}`);
        return {
            ...super.discoveryState(),
            value_template: `{{ ${value_template.join(' | ')} }}`,
            json_attributes_topic: this.stateTopic,
        };
    }
}
exports.JsonSensor = JsonSensor;
//# sourceMappingURL=JsonSensor.js.map