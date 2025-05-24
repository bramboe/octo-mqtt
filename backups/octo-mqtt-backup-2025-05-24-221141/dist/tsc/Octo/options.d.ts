export interface OctoDevice {
    friendlyName: string;
    name: string;
    pin?: string;
}
export declare const getDevices: () => OctoDevice[];
