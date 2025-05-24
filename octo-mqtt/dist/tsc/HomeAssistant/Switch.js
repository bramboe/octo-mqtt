"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Switch = void 0;
const logger_1 = require("../Utils/logger");
const StatefulEntity_1 = require("./base/StatefulEntity");
const supportedMessages = ['ON', 'OFF'];
class Switch extends StatefulEntity_1.StatefulEntity {
    constructor(mqtt, deviceData, entityConfig, onChange) {
        super(mqtt, deviceData, entityConfig, 'switch');
        this.commandTopic = `${this.baseTopic}/command`;
        mqtt.subscribe(this.commandTopic);
        mqtt.on(this.commandTopic, async (message) => {
            if (!supportedMessages.includes(message))
                return;
            const value = message === 'ON';
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
        return state ? 'ON' : 'OFF';
    }
    discoveryState() {
        return {
            ...super.discoveryState(),
            command_topic: this.commandTopic,
        };
    }
}
exports.Switch = Switch;
//# sourceMappingURL=Switch.js.map