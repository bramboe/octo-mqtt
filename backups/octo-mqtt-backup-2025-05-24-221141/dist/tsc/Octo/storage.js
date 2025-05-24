"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OctoStorage = void 0;
const tslib_1 = require("tslib");
const fs_1 = tslib_1.__importDefault(require("fs"));
const path_1 = tslib_1.__importDefault(require("path"));
const logger_1 = require("../Utils/logger");
const STORAGE_FILE_PATH = '/data/octo_storage.json';
const DEFAULT_STORAGE_DATA = {
    head_up_duration: 30000, // Default 30 seconds in ms
    feet_up_duration: 30000, // Default 30 seconds in ms
    head_current_position: 0, // Default 0%
    feet_current_position: 0, // Default 0%
};
class OctoStorage {
    constructor() {
        this.initialized = false;
        this.data = { ...DEFAULT_STORAGE_DATA };
        this.load();
    }
    ensureDirectoryExists() {
        const dirname = path_1.default.dirname(STORAGE_FILE_PATH);
        if (!fs_1.default.existsSync(dirname)) {
            try {
                fs_1.default.mkdirSync(dirname, { recursive: true });
                (0, logger_1.logInfo)(`[OctoStorage] Created storage directory: ${dirname}`);
            }
            catch (error) {
                (0, logger_1.logError)(`[OctoStorage] Error creating storage directory ${dirname}:`, error);
                // Proceed with in-memory storage if directory creation fails
            }
        }
    }
    load() {
        this.ensureDirectoryExists();
        try {
            if (fs_1.default.existsSync(STORAGE_FILE_PATH)) {
                const fileContent = fs_1.default.readFileSync(STORAGE_FILE_PATH, 'utf-8');
                const parsedData = JSON.parse(fileContent);
                this.data = { ...DEFAULT_STORAGE_DATA, ...parsedData };
                (0, logger_1.logInfo)('[OctoStorage] Data loaded successfully from', STORAGE_FILE_PATH);
            }
            else {
                (0, logger_1.logInfo)('[OctoStorage] No storage file found, using default data.');
                this.save(); // Create the file with default data
            }
        }
        catch (error) {
            (0, logger_1.logError)('[OctoStorage] Error loading data:', error);
            (0, logger_1.logWarn)('[OctoStorage] Using default data due to load error.');
            this.data = { ...DEFAULT_STORAGE_DATA };
        }
        this.initialized = true;
    }
    save() {
        if (!this.initialized) {
            (0, logger_1.logWarn)('[OctoStorage] Attempted to save before initialization finished. Load will overwrite.');
            // It's generally better to let the initial load complete and create the file if needed.
            // If save is called prematurely, it might write default data over existing data if load hasn't run.
        }
        this.ensureDirectoryExists();
        try {
            const fileContent = JSON.stringify(this.data, null, 2);
            fs_1.default.writeFileSync(STORAGE_FILE_PATH, fileContent, 'utf-8');
            (0, logger_1.logInfo)('[OctoStorage] Data saved successfully to', STORAGE_FILE_PATH);
        }
        catch (error) {
            (0, logger_1.logError)('[OctoStorage] Error saving data:', error);
        }
    }
    get(key) {
        return this.data[key];
    }
    set(key, value) {
        this.data[key] = value;
        this.save();
    }
    getAllData() {
        return { ...this.data };
    }
    updateData(updates) {
        this.data = { ...this.data, ...updates };
        this.save();
    }
}
exports.OctoStorage = OctoStorage;
//# sourceMappingURL=storage.js.map