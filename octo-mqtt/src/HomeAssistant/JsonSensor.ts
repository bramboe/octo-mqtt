import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { IDeviceData } from './IDeviceData';
import { Sensor } from './Sensor';
import { EntityConfig } from './base/Entity';

export type JsonSensorConfig = {
  valueField?: string;
};

export class JsonSensor extends Sensor {
  private valueField: string;

  constructor(
    mqtt: IMQTTConnection,
    deviceData: IDeviceData,
    { valueField = 'value', ...config }: JsonSensorConfig & EntityConfig
  ) {
    super(mqtt, deviceData, config);
    this.valueField = valueField;
  }

  protected mapState(state: any): any {
    return state === undefined ? {} : state;
  }

  discoveryState() {
    const value_template = [`default('')`];
    if (this.valueField) value_template.unshift(`value_json.${this.valueField}`);
    return {
      ...super.discoveryState(),
      value_template: `{{ ${value_template.join(' | ')} }}`,
      json_attributes_topic: this.stateTopic,
    };
  }
}
