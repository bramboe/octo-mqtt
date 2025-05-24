import EventEmitter from 'events';
import { MqttClient } from '../mqtt';
import { IMQTTConnection } from './IMQTTConnection';
export declare class MQTTConnection extends EventEmitter implements IMQTTConnection {
    private client;
    private subscribedTopics;
    constructor(client: MqttClient);
    publish(topic: string, message: any): void;
    subscribe(topic: string): void;
    unsubscribe(topic: string): void;
    disconnect(): Promise<void>;
}
