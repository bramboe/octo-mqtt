"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MQTTConnection = void 0;
const tslib_1 = require("tslib");
const logger_1 = require("../Utils/logger");
const events_1 = tslib_1.__importDefault(require("events"));
class MQTTConnection extends events_1.default {
    constructor(client) {
        super();
        this.client = client;
        this.subscribedTopics = [];
        client.on('connect', () => {
            (0, logger_1.logInfo)('[MQTT] Connected');
            this.emit('connect');
        });
        client.on('reconnect', () => {
            (0, logger_1.logInfo)('[MQTT] Reconnecting...');
        });
        client.on('disconnect', client.removeAllListeners);
        client.on('error', (error) => {
            (0, logger_1.logError)('[MQTT] Error', error);
        });
        client.on('message', (topic, message) => {
            this.emit(topic, message.toString());
        });
        this.setMaxListeners(0);
    }
    publish(topic, message) {
        if (message instanceof Object) {
            message = JSON.stringify(message);
        }
        this.client.publish(topic, message, { qos: 1 });
    }
    subscribe(topic) {
        if (!this.subscribedTopics.includes(topic)) {
            this.client.subscribe(topic);
            this.subscribedTopics.push(topic);
        }
    }
    unsubscribe(topic) {
        const index = this.subscribedTopics.indexOf(topic);
        if (index !== -1) {
            this.client.unsubscribe(topic);
            this.subscribedTopics.splice(index, 1);
        }
    }
    async disconnect() {
        return new Promise((resolve, reject) => {
            try {
                if (this.client.connected) {
                    (0, logger_1.logInfo)('[MQTT] Disconnecting...');
                    this.client.end(false, {}, () => {
                        (0, logger_1.logInfo)('[MQTT] Disconnected successfully');
                        resolve();
                    });
                }
                else {
                    (0, logger_1.logInfo)('[MQTT] Already disconnected');
                    resolve();
                }
            }
            catch (error) {
                (0, logger_1.logError)('[MQTT] Error disconnecting:', error);
                reject(error);
            }
        });
    }
}
exports.MQTTConnection = MQTTConnection;
//# sourceMappingURL=MQTTConnection.js.map