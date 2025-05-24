"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatefulEntity = void 0;
const Entity_1 = require("./Entity");
class StatefulEntity extends Entity_1.Entity {
    constructor(mqtt, deviceData, entityConfig, componentType) {
        super(mqtt, deviceData, entityConfig, componentType);
        this.stateTopic = `${this.baseTopic}/state`;
    }
    discoveryState() {
        return {
            ...super.discoveryState(),
            state_topic: this.stateTopic,
        };
    }
    mapState(state) {
        return state === undefined ? null : state;
    }
    setState(state) {
        if (state === null) {
            return this.setOffline();
        }
        if (this.state === state)
            return this;
        this.state = state;
        this.sendState();
        this.setOnline();
        return this;
    }
    getState() {
        return this.state;
    }
    sendState() {
        setTimeout(() => {
            const message = this.mapState(this.state);
            this.mqtt.publish(this.stateTopic, message);
        }, 250);
    }
}
exports.StatefulEntity = StatefulEntity;
//# sourceMappingURL=StatefulEntity.js.map