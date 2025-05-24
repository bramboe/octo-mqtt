"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Entity = void 0;
const safeId_1 = require("../../Utils/safeId");
const seconds_1 = require("../../Utils/seconds");
const ONLINE = 'online';
const OFFLINE = 'offline';
class Entity {
    constructor(mqtt, deviceData, entityConfig, componentType) {
        this.mqtt = mqtt;
        this.deviceData = deviceData;
        this.entityConfig = entityConfig;
        this.componentType = componentType;
        this.entityTag = (0, safeId_1.safeId)(entityConfig.description);
        this.uniqueId = `${(0, safeId_1.safeId)(deviceData.device.ids[0])}_${this.entityTag}`;
        this.baseTopic = `${deviceData.deviceTopic}/${this.entityTag}`;
        this.availabilityTopic = `${this.baseTopic}/status`;
        this.mqtt.subscribe('homeassistant/status');
        this.mqtt.on('homeassistant/status', (message) => {
            if (message === ONLINE)
                setTimeout(() => this.publishDiscovery(), (0, seconds_1.seconds)(15));
        });
        setTimeout(() => this.publishDiscovery(), 50);
    }
    publishDiscovery() {
        const discoveryTopic = `homeassistant/${this.componentType}/${this.deviceData.deviceTopic}_${this.entityTag}/config`;
        const discoveryMessage = {
            name: this.entityConfig.description,
            unique_id: this.uniqueId,
            device: this.deviceData.device,
            ...this.discoveryState(),
        };
        this.mqtt.publish(discoveryTopic, discoveryMessage);
    }
    discoveryState() {
        return {
            availability_topic: this.availabilityTopic,
            payload_available: ONLINE,
            payload_not_available: OFFLINE,
            ...(this.entityConfig.category ? { entity_category: this.entityConfig.category } : {}),
            ...(this.entityConfig.icon ? { icon: this.entityConfig.icon } : {}),
        };
    }
    setOffline() {
        this.sendAvailability(OFFLINE);
        return this;
    }
    setOnline() {
        this.sendAvailability(ONLINE);
        return this;
    }
    sendAvailability(availability) {
        setTimeout(() => this.mqtt.publish(this.availabilityTopic, availability), 500);
    }
}
exports.Entity = Entity;
//# sourceMappingURL=Entity.js.map