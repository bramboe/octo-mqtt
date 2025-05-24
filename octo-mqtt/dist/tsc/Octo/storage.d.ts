export interface OctoStorageData {
    head_up_duration: number;
    feet_up_duration: number;
    head_current_position: number;
    feet_current_position: number;
    pin?: string;
}
export declare class OctoStorage {
    private data;
    private initialized;
    constructor();
    private ensureDirectoryExists;
    private load;
    save(): void;
    get<K extends keyof OctoStorageData>(key: K): OctoStorageData[K];
    set<K extends keyof OctoStorageData>(key: K, value: OctoStorageData[K]): void;
    getAllData(): OctoStorageData;
    updateData(updates: Partial<OctoStorageData>): void;
}
