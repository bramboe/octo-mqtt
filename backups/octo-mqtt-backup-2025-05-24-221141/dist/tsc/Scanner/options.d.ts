export interface ScannerDevice {
    name: string;
    pair?: boolean;
}
export declare const getDevices: () => ScannerDevice[];
