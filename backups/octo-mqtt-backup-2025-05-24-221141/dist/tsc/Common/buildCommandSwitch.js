"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCommandSwitch = void 0;
const Switch_1 = require("../HomeAssistant/Switch");
const getString_1 = require("../Utils/getString");
const logger_1 = require("../Utils/logger");
const buildEntityConfig_1 = require("./buildEntityConfig");
const buildCommandSwitch = (context, mqtt, { cache, deviceData, writeCommand }, name, onCommand, offCommand, category) => {
    if (cache[name])
        return;
    cache[name] = new Switch_1.Switch(mqtt, deviceData, (0, buildEntityConfig_1.buildEntityConfig)(name, category), async (state) => {
        const commandToSend = state ? onCommand : offCommand;
        if (!commandToSend)
            return;
        try {
            await writeCommand(commandToSend);
        }
        catch (e) {
            (0, logger_1.logError)(`[${context}] Failed to write '${(0, getString_1.getString)(name)}'`, e);
        }
    }).setOnline();
};
exports.buildCommandSwitch = buildCommandSwitch;
//# sourceMappingURL=buildCommandSwitch.js.map