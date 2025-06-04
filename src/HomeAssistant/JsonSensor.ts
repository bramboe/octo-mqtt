import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { IDeviceData } from './IDeviceData';
import { EntityConfig } from './base/Entity';
import { StatefulEntity } from './base/StatefulEntity';

export class JsonSensor<T extends Record<string, any>> extends StatefulEntity<string> {
  private currentState?: T;

  constructor(
    mqtt: IMQTTConnection,
    deviceData: IDeviceData,
    entityConfig: EntityConfig
  ) {
    super(mqtt, deviceData, entityConfig, 'sensor');
  }

  setJsonState(state: T) {
    this.currentState = state;
    super.setState(JSON.stringify(state));
    return this;
  }

  getJsonState(): T | undefined {
    return this.currentState;
  }

  discoveryState() {
    return {
      ...super.discoveryState(),
      json_attributes_topic: this.stateTopic,
      value_template: '{{ value_json }}',
    };
  }
}
