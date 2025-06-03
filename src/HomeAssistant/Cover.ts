import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { IDeviceData } from './IDeviceData';
import { Entity, EntityConfig } from './base/Entity';
import { logInfo, logError } from '../Utils/logger';

export class Cover extends Entity {
  private commandTopic: string;
  private positionTopic: string;
  private positionStateTopic: string;

  constructor(
    mqtt: IMQTTConnection,
    deviceData: IDeviceData,
    entityConfig: EntityConfig,
    onCommand: (command: string) => void
  ) {
    super(mqtt, deviceData, entityConfig, 'cover');
    this.commandTopic = `${this.baseTopic}/command`;
    this.positionTopic = `${this.baseTopic}/position`;
    this.positionStateTopic = `${this.baseTopic}/position/state`;
    
    try {
      logInfo(`[Cover] Setting up cover entity: ${entityConfig.description}`);
    mqtt.subscribe(this.commandTopic);
      
    mqtt.on(this.commandTopic, (message) => {
        try {
          logInfo(`[Cover] Received command for ${entityConfig.description}: ${message}`);
      onCommand(message);
        } catch (error) {
          logError(`[Cover] Error handling command: ${error}`);
        }
      });
      
      logInfo(`[Cover] Cover entity setup complete: ${entityConfig.description}`);
    } catch (error) {
      logError(`[Cover] Error setting up cover entity: ${error}`);
    }
  }

  /**
   * Publish the current position of the cover to Home Assistant
   * @param position Position value between 0 and 1 (0 = closed, 1 = open)
   */
  publishPosition(position: number): void {
    try {
      // Ensure position is between 0 and 1
      const validPosition = Math.max(0, Math.min(1, position));
      
      // Convert to percentage for MQTT
      const positionPercent = Math.round(validPosition * 100);
      
      // Publish to MQTT
      this.mqtt.publish(this.positionStateTopic, positionPercent.toString());
      logInfo(`[Cover] Published position for ${this.entityConfig.description}: ${positionPercent}%`);
    } catch (error) {
      logError(`[Cover] Error publishing position: ${error}`);
    }
  }

  discoveryState() {
    return {
      ...super.discoveryState(),
      command_topic: this.commandTopic,
      position_topic: this.positionTopic,
      state_topic: this.positionStateTopic,
      position_open: 100,
      position_closed: 0,
      set_position_topic: this.positionTopic,
      position_template: "{{ value }}",
    };
  }
}
