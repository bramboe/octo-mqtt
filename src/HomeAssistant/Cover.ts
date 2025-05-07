import { IMQTTConnection } from '@mqtt/IMQTTConnection';
import { IDeviceData } from './IDeviceData';
import { Entity, EntityConfig } from './base/Entity';
import { logInfo, logError } from '@utils/logger';

export class Cover extends Entity {
  private commandTopic: string;

  constructor(
    mqtt: IMQTTConnection,
    deviceData: IDeviceData,
    entityConfig: EntityConfig,
    onCommand: (command: string) => void
  ) {
    super(mqtt, deviceData, entityConfig, 'cover');
    this.commandTopic = `${this.baseTopic}/command`;
    
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

  discoveryState() {
    return {
      ...super.discoveryState(),
      command_topic: this.commandTopic,
    };
  }
}
