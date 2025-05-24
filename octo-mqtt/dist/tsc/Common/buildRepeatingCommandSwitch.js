"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRepeatingCommandSwitch = void 0;
const Switch_1 = require("../HomeAssistant/Switch");
const getString_1 = require("../Utils/getString");
const logger_1 = require("../Utils/logger");
const buildEntityConfig_1 = require("./buildEntityConfig");
const buildRepeatingCommandSwitch = (context, mqtt, { cache, deviceData, writeCommand, cancelCommands }, name, command, category, count, waitTime) => {
    if (cache[name])
        return;
    const entity = (cache[name] = new Switch_1.Switch(mqtt, deviceData, (0, buildEntityConfig_1.buildEntityConfig)(name, category), async (state) => {
        if (!state)
            return cancelCommands();
        try {
            await writeCommand(command, count, waitTime);
            entity.setState(false);
        }
        catch (e) {
            (0, logger_1.logError)(`[${context}] Failed to write '${(0, getString_1.getString)(name)}'`, e);
        }
    }).setOnline());
};
exports.buildRepeatingCommandSwitch = buildRepeatingCommandSwitch;
//# sourceMappingURL=buildRepeatingCommandSwitch.js.map