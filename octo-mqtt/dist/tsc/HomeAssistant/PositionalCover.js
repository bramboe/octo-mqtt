"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PositionalCover = void 0;
const Cover_1 = require("./Cover");
class PositionalCover extends Cover_1.Cover {
    constructor(mqtt, deviceData, config, onSetPosition, options = {}) {
        super(mqtt, deviceData, config, (message) => {
            switch (message) {
                case 'OPEN':
                    return onSetPosition(options.positionOpen || 100);
                case 'CLOSE':
                    return onSetPosition(options.positionClosed || 0);
                case 'STOP':
                    if (options.onStop)
                        return options.onStop();
                    return onSetPosition(this.position || 0);
            }
        });
        this.options = options;
        this.position = 0;
        this.setPositionTopic = `${this.baseTopic}/set_position`;
        mqtt.subscribe(this.setPositionTopic);
        mqtt.on(this.setPositionTopic, (message) => onSetPosition(parseInt(message)));
    }
    discoveryState() {
        return {
            ...super.discoveryState(),
            set_position_topic: this.setPositionTopic,
            position_open: this.options.positionOpen || 100,
            position_closed: this.options.positionClosed || 0,
        };
    }
    setPosition(position) {
        if (position === null) {
            return this.setOffline();
        }
        this.position = position;
        this.sendPosition();
        this.setOnline();
        return this;
    }
    getPosition() {
        return this.position;
    }
    mapPosition(position) {
        return position === undefined ? null : position.toString();
    }
    sendPosition() {
        setTimeout(() => {
            const message = this.mapPosition(this.position);
            this.publishPosition(this.position);
        }, 250);
    }
}
exports.PositionalCover = PositionalCover;
//# sourceMappingURL=PositionalCover.js.map