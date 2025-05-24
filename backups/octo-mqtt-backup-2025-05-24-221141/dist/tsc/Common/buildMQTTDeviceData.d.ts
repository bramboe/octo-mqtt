import { IDeviceData } from '../HomeAssistant/IDeviceData';
type Device = {
    friendlyName: string;
    name: string;
    address: number | string;
};
export declare const buildMQTTDeviceData: ({ friendlyName, name, address }: Device, manufacturer: string) => IDeviceData;
export {};
