"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Light = void 0;
const logger_1 = require("../Utils/logger");
const StatefulEntity_1 = require("./base/StatefulEntity");
class Light extends StatefulEntity_1.StatefulEntity {
    constructor(mqtt, deviceData, { supportsBrightness, supportsRGB, ...config }, onChange) {
        super(mqtt, deviceData, config, 'light');
        this.supportsBrightness = supportsBrightness !== undefined ? supportsBrightness : false;
        this.supportsRGB = supportsRGB !== undefined ? supportsRGB : false;
        this.supportedColorMode = this.supportsRGB ? 'rgb' : this.supportsBrightness ? 'brightness' : 'onoff';
        this.commandTopic = `${this.baseTopic}/command`;
        mqtt.subscribe(this.commandTopic);
        mqtt.on(this.commandTopic, async (message) => {
            const { state, ...obj } = JSON.parse(message);
            if (state == 'ON')
                obj.status = true;
            if (state == 'OFF')
                obj.status = false;
            try {
                const result = await onChange(obj);
                this.setState(result === undefined ? obj : result);
            }
            catch (err) {
                (0, logger_1.logError)(err);
            }
        });
    }
    mapState(state) {
        if (state === undefined)
            return {};
        const { status, ...rest } = state;
        return { state: status ? 'ON' : 'OFF', color_mode: this.supportedColorMode, ...rest };
    }
    discoveryState() {
        return {
            ...super.discoveryState(),
            schema: 'json',
            brightness: this.supportsBrightness,
            command_topic: this.commandTopic,
            supported_color_modes: [this.supportedColorMode],
        };
    }
}
exports.Light = Light;
//# sourceMappingURL=Light.js.map