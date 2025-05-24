"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConfig = getConfig;
exports.saveConfig = saveConfig;
const tslib_1 = require("tslib");
const fs = tslib_1.__importStar(require("fs"));
const path = tslib_1.__importStar(require("path"));
const logger_1 = require("./logger");
const CONFIG_FILE = path.join(process.env.DATA_DIR || './data', 'config.json');
async function getConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const data = fs.readFileSync(CONFIG_FILE, 'utf8');
            return JSON.parse(data);
        }
        return { octoDevices: [] };
    }
    catch (error) {
        (0, logger_1.logError)('[Config] Error reading config:', error);
        return { octoDevices: [] };
    }
}
async function saveConfig(config) {
    try {
        const dir = path.dirname(CONFIG_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        (0, logger_1.logInfo)('[Config] Saved config to storage');
    }
    catch (error) {
        (0, logger_1.logError)('[Config] Error saving config:', error);
        throw error;
    }
}
//# sourceMappingURL=config.js.map