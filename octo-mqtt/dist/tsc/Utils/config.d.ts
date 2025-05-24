interface Config {
    octoDevices: Array<{
        name: string;
        friendlyName: string;
        pin?: string;
    }>;
}
export declare function getConfig(): Promise<Config>;
export declare function saveConfig(config: Config): Promise<void>;
export {};
