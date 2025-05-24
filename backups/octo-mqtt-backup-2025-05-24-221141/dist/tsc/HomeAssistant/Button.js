"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Button = void 0;
const logger_1 = require("../Utils/logger");
const Entity_1 = require("./base/Entity");
class Button extends Entity_1.Entity {
    constructor(mqtt, deviceData, entityConfig, onPress) {
        super(mqtt, deviceData, entityConfig, 'button');
        this.commandTopic = `${this.baseTopic}/command`;
        mqtt.subscribe(this.commandTopic);
        mqtt.on(this.commandTopic, async (message) => {
            if (message !== 'PRESS')
                return;
            try {
                await onPress();
            }
            catch (err) {
                (0, logger_1.logError)(err);
            }
        });
    }
    discoveryState() {
        return {
            ...super.discoveryState(),
            command_topic: this.commandTopic,
        };
    }
}
exports.Button = Button;
//# sourceMappingURL=Button.js.map