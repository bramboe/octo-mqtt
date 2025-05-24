"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Select = void 0;
const logger_1 = require("../Utils/logger");
const StatefulEntity_1 = require("./base/StatefulEntity");
class Select extends StatefulEntity_1.StatefulEntity {
    constructor(mqtt, deviceData, { options, ...config }, onChange) {
        super(mqtt, deviceData, config, 'select');
        this.commandTopic = `${this.baseTopic}/command`;
        this.options = options;
        mqtt.subscribe(this.commandTopic);
        mqtt.on(this.commandTopic, async (message) => {
            if (!this.options.includes(message))
                return;
            try {
                const result = await onChange(message);
                this.setState(result !== undefined ? result : message);
            }
            catch (err) {
                (0, logger_1.logError)(err);
            }
        });
    }
    getIndex() {
        const state = this.getState();
        if (state)
            return this.options.indexOf(state);
        return undefined;
    }
    setIndex(index) {
        this.setState(this.options[index]);
    }
    discoveryState() {
        return {
            ...super.discoveryState(),
            command_topic: this.commandTopic,
            options: this.options,
        };
    }
}
exports.Select = Select;
//# sourceMappingURL=Select.js.map