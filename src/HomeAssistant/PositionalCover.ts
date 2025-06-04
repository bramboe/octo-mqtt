import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { IDeviceData } from './IDeviceData';
import { EntityConfig } from './base/Entity';
import { StatefulEntity } from './base/StatefulEntity';
import { ComponentType } from './base/ComponentTypeWithState';

export class PositionalCover extends StatefulEntity<number> {
  private commandTopic: string;
  private setPositionTopic: string;
  private currentPosition: number = 0;

  constructor(
    mqtt: IMQTTConnection,
    deviceData: IDeviceData,
    entityConfig: EntityConfig,
    onCommand: (command: 'OPEN' | 'CLOSE' | 'STOP') => Promise<void>,
    onSetPosition: (position: number) => Promise<void>
  ) {
    super(mqtt, deviceData, entityConfig, 'cover' as ComponentType);
    this.commandTopic = `${this.baseTopic}/command`;
    this.setPositionTopic = `${this.baseTopic}/set_position`;

    mqtt.subscribe(this.commandTopic);
    mqtt.on(this.commandTopic, (message) => {
      if (message !== 'OPEN' && message !== 'CLOSE' && message !== 'STOP') return;
      onCommand(message);
    });

    mqtt.subscribe(this.setPositionTopic);
    mqtt.on(this.setPositionTopic, (message: string) => {
      const position = parseInt(message);
      if (!isNaN(position)) {
        this.currentPosition = position;
        onSetPosition(position);
      }
    });
  }

  setPosition(position: number) {
    this.currentPosition = position;
    this.setState(position);
  }

  getPosition(): number {
    return this.currentPosition;
  }

  discoveryState() {
    return {
      ...super.discoveryState(),
      command_topic: this.commandTopic,
      set_position_topic: this.setPositionTopic,
      position_topic: this.stateTopic,
      payload_open: 'OPEN',
      payload_close: 'CLOSE',
      payload_stop: 'STOP',
      position_open: 100,
      position_closed: 0,
      optimistic: false,
    };
  }
}
