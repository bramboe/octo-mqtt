import { IMQTTConnection } from '@mqtt/IMQTTConnection';
import { IDeviceData } from './IDeviceData';
import { Entity, EntityConfig } from './base/Entity';
import { logInfo, logError } from '@utils/logger';

export class NumericSensor extends Entity {
  private stateTopic: string;
  
  constructor(
    mqtt: IMQTTConnection,
    deviceData: IDeviceData,
    entityConfig: EntityConfig
  ) {
    super(mqtt, deviceData, entityConfig, 'sensor');
    this.stateTopic = `${this.baseTopic}/state`;
    
    logInfo(`[Sensor] Setting up numeric sensor: ${entityConfig.description}`);
  }
  
  setValue(value: number): void {
    try {
      this.mqtt.publish(this.stateTopic, value.toString());
      logInfo(`[Sensor] Published value for ${this.entityConfig.description}: ${value}`);
    } catch (error) {
      logError(`[Sensor] Error publishing value: ${error}`);
    }
  }
  
  discoveryState(): any {
    return {
      ...super.discoveryState(),
      state_topic: this.stateTopic,
      unit_of_measurement: this.entityConfig.unit || '',
      value_template: "{{ value }}",
    };
  }
} 