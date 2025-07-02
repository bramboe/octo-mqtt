import { logError, logInfo } from '../Utils/logger';
import EventEmitter from 'events';
import { MqttClient } from 'mqtt';
import { IMQTTConnection } from './IMQTTConnection';

export class MQTTConnection extends EventEmitter implements IMQTTConnection {
  private subscribedTopics: string[] = [];

  constructor(private client: MqttClient) {
    super();

    client.on('connect', () => {
      logInfo('[MQTT] Connected');
      this.emit('connect');
    });

    client.on('reconnect', () => {
      logInfo('[MQTT] Reconnecting...');
    });

    client.on('disconnect', client.removeAllListeners);

    client.on('error', (error) => {
      logError('[MQTT] Error', error);
    });

    client.on('message', (topic, message) => {
      this.emit(topic, message.toString());
    });
    this.setMaxListeners(0);
  }

  publish(topic: string, message: any) {
    if (message instanceof Object) {
      message = JSON.stringify(message);
    }
    this.client.publish(topic, message, { qos: 1 });
  }

  subscribe(topic: string) {
    if (!this.subscribedTopics.includes(topic)) {
      this.client.subscribe(topic);
      this.subscribedTopics.push(topic);
    }
  }

  unsubscribe(topic: string) {
    const index = this.subscribedTopics.indexOf(topic);
    if (index !== -1) {
      this.client.unsubscribe(topic);
      this.subscribedTopics.splice(index, 1);
    }
  }
  
  async disconnect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        if (this.client.connected) {
          logInfo('[MQTT] Disconnecting...');
          this.client.end(false, {}, () => {
            logInfo('[MQTT] Disconnected successfully');
            resolve();
          });
        } else {
          logInfo('[MQTT] Already disconnected');
          resolve();
        }
      } catch (error) {
        logError('[MQTT] Error disconnecting:', error);
        reject(error);
      }
    });
  }
}
