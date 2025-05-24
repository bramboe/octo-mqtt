"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Cover = void 0;
const Entity_1 = require("./base/Entity");
const logger_1 = require("../Utils/logger");
class Cover extends Entity_1.Entity {
    constructor(mqtt, deviceData, entityConfig, onCommand) {
        super(mqtt, deviceData, entityConfig, 'cover');
        this.commandTopic = `${this.baseTopic}/command`;
        this.positionTopic = `${this.baseTopic}/position`;
        this.positionStateTopic = `${this.baseTopic}/position/state`;
        try {
            (0, logger_1.logInfo)(`[Cover] Setting up cover entity: ${entityConfig.description}`);
            mqtt.subscribe(this.commandTopic);
            mqtt.on(this.commandTopic, (message) => {
                try {
                    (0, logger_1.logInfo)(`[Cover] Received command for ${entityConfig.description}: ${message}`);
                    onCommand(message);
                }
                catch (error) {
                    (0, logger_1.logError)(`[Cover] Error handling command: ${error}`);
                }
            });
            (0, logger_1.logInfo)(`[Cover] Cover entity setup complete: ${entityConfig.description}`);
        }
        catch (error) {
            (0, logger_1.logError)(`[Cover] Error setting up cover entity: ${error}`);
        }
    }
    /**
     * Publish the current position of the cover to Home Assistant
     * @param position Position value between 0 and 1 (0 = closed, 1 = open)
     */
    publishPosition(position) {
        try {
            // Ensure position is between 0 and 1
            const validPosition = Math.max(0, Math.min(1, position));
            // Convert to percentage for MQTT
            const positionPercent = Math.round(validPosition * 100);
            // Publish to MQTT
            this.mqtt.publish(this.positionStateTopic, positionPercent.toString());
            (0, logger_1.logInfo)(`[Cover] Published position for ${this.entityConfig.description}: ${positionPercent}%`);
        }
        catch (error) {
            (0, logger_1.logError)(`[Cover] Error publishing position: ${error}`);
        }
    }
    discoveryState() {
        return {
            ...super.discoveryState(),
            command_topic: this.commandTopic,
            position_topic: this.positionTopic,
            state_topic: this.positionStateTopic,
            position_open: 100,
            position_closed: 0,
            set_position_topic: this.positionTopic,
            position_template: "{{ value }}",
        };
    }
}
exports.Cover = Cover;
//# sourceMappingURL=Cover.js.map