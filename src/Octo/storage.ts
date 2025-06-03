import fs from 'fs';
import path from 'path';
import { logError, logInfo, logWarn } from '../Utils/logger';

const STORAGE_FILE_PATH = '/data/octo_storage.json';

export interface OctoStorageData {
  head_up_duration: number;
  feet_up_duration: number;
  head_current_position: number;
  feet_current_position: number;
  pin?: string; // Optionally store the PIN if needed, though typically from config
}

const DEFAULT_STORAGE_DATA: OctoStorageData = {
  head_up_duration: 30000, // Default 30 seconds in ms
  feet_up_duration: 30000, // Default 30 seconds in ms
  head_current_position: 0, // Default 0%
  feet_current_position: 0, // Default 0%
};

export class OctoStorage {
  private data: OctoStorageData;
  private initialized: boolean = false;

  constructor() {
    this.data = { ...DEFAULT_STORAGE_DATA };
    this.load();
  }

  private ensureDirectoryExists() {
    const dirname = path.dirname(STORAGE_FILE_PATH);
    if (!fs.existsSync(dirname)) {
      try {
        fs.mkdirSync(dirname, { recursive: true });
        logInfo(`[OctoStorage] Created storage directory: ${dirname}`);
      } catch (error: any) {
        logError(`[OctoStorage] Error creating storage directory ${dirname}:`, error);
        // Proceed with in-memory storage if directory creation fails
      }
    }
  }

  private load() {
    this.ensureDirectoryExists();
    try {
      if (fs.existsSync(STORAGE_FILE_PATH)) {
        const fileContent = fs.readFileSync(STORAGE_FILE_PATH, 'utf-8');
        const parsedData = JSON.parse(fileContent) as OctoStorageData;
        this.data = { ...DEFAULT_STORAGE_DATA, ...parsedData };
        logInfo('[OctoStorage] Data loaded successfully from', STORAGE_FILE_PATH);
      } else {
        logInfo('[OctoStorage] No storage file found, using default data.');
        this.save(); // Create the file with default data
      }
    } catch (error: any) {
      logError('[OctoStorage] Error loading data:', error);
      logWarn('[OctoStorage] Using default data due to load error.');
      this.data = { ...DEFAULT_STORAGE_DATA };
    }
    this.initialized = true;
  }

  public save() {
    if (!this.initialized) {
        logWarn('[OctoStorage] Attempted to save before initialization finished. Load will overwrite.');
        // It's generally better to let the initial load complete and create the file if needed.
        // If save is called prematurely, it might write default data over existing data if load hasn't run.
    }
    this.ensureDirectoryExists();
    try {
      const fileContent = JSON.stringify(this.data, null, 2);
      fs.writeFileSync(STORAGE_FILE_PATH, fileContent, 'utf-8');
      logInfo('[OctoStorage] Data saved successfully to', STORAGE_FILE_PATH);
    } catch (error: any) {
      logError('[OctoStorage] Error saving data:', error);
    }
  }

  public get<K extends keyof OctoStorageData>(key: K): OctoStorageData[K] {
    return this.data[key];
  }

  public set<K extends keyof OctoStorageData>(key: K, value: OctoStorageData[K]): void {
    this.data[key] = value;
    this.save();
  }

  public getAllData(): OctoStorageData {
    return { ...this.data };
  }

  public updateData(updates: Partial<OctoStorageData>): void {
    this.data = { ...this.data, ...updates };
    this.save();
  }
} 