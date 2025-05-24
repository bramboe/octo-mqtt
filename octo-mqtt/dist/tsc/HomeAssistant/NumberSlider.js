"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NumberSlider = void 0;
const logger_1 = require("../Utils/logger");
const StatefulEntity_1 = require("./base/StatefulEntity");
class NumberSlider extends StatefulEntity_1.StatefulEntity {
    constructor(mqtt, deviceData, { min = 0, max = 100, icon, ...config }, onChange) {
        super(mqtt, deviceData, config, 'number');
        this.min = min;
        this.max = max;
        this.icon = icon;
        this.commandTopic = `${this.baseTopic}/command`;
        mqtt.subscribe(this.commandTopic);
        mqtt.on(this.commandTopic, async (message) => {
            const value = parseInt(message);
            if (Number.isNaN(value))
                return;
            try {
                const result = await onChange(value);
                this.setState(result !== undefined ? result : value);
            }
            catch (err) {
                (0, logger_1.logError)(err);
            }
        });
    }
    mapState(state) {
        return state == undefined ? null : state.toString();
    }
    discoveryState() {
        return {
            ...super.discoveryState(),
            command_topic: this.commandTopic,
            mode: 'slider',
            icon: this.icon,
            min: this.min,
            max: this.max,
        };
    }
}
exports.NumberSlider = NumberSlider;
//# sourceMappingURL=NumberSlider.js.map