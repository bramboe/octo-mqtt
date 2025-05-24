export interface BLEProxy {
    host: string;
    port: number;
    password?: string;
    encryptionKey?: string;
    expectedServerName?: string;
}
export declare const getProxies: () => BLEProxy[];
