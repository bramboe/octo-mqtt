import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { OctoStorage } from './storage';
export interface MQTTDevicePlaceholder {
    identifiers: string[];
    name: string;
    model: string;
    manufacturer: string;
    sw_version?: string;
    availability_topic?: string;
}
export interface MQTTItemConfigPlaceholder extends Record<string, any> {
    name: string;
    command_topic?: string;
    state_topic?: string;
    position_topic?: string;
    set_position_topic?: string;
    availability?: {
        topic: string;
    }[];
    payload_available?: string;
    payload_not_available?: string;
}
interface OctoControllerMinimal {
    writeCommand(command: number[] | {
        command: number[];
        data?: number[];
    }): Promise<void>;
    on(event: 'feedback', listener: (message: Uint8Array) => void): void;
    off(event: 'feedback', listener: (message: Uint8Array) => void): void;
    deviceData: MQTTDevicePlaceholder;
    setPin(pin: string): void;
}
export declare const setupOctoMqttEntities: (mqtt: IMQTTConnection, bleController: OctoControllerMinimal, storage: OctoStorage, devicePin: string | undefined, mqttDeviceData: MQTTDevicePlaceholder) => void;
export declare const cleanupOctoMqttEntities: (mqtt: IMQTTConnection, deviceData: MQTTDevicePlaceholder | undefined) => void;
export {};
