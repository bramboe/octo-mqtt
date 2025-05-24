"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCommandsButton = void 0;
const Button_1 = require("../HomeAssistant/Button");
const getString_1 = require("../Utils/getString");
const logger_1 = require("../Utils/logger");
const buildEntityConfig_1 = require("./buildEntityConfig");
const buildCommandsButton = (context, mqtt, { cache, deviceData, writeCommands }, name, commands, category) => {
    if (cache[name])
        return;
    cache[name] = new Button_1.Button(mqtt, deviceData, (0, buildEntityConfig_1.buildEntityConfig)(name, category), async () => {
        try {
            await writeCommands(commands);
        }
        catch (e) {
            (0, logger_1.logError)(`[${context}] Failed to write '${(0, getString_1.getString)(name)}'`, e);
        }
    }).setOnline();
};
exports.buildCommandsButton = buildCommandsButton;
//# sourceMappingURL=buildCommandsButton.js.map