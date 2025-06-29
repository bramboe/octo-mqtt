import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { Switch } from '../HomeAssistant/Switch';
import { buildEntityConfig } from '../Common/buildEntityConfig';
import { IController } from '../Common/IController';
import { Command } from '../BLE/BLEController';
import { logInfo, logError } from '../Utils/logger';
import { extractFeatureValuePairFromData } from './extractFeaturesFromData';
import { extractPacketFromMessage } from './extractPacketFromMessage';
import { IEventSource } from '../Common/IEventSource';

interface LightCache {
  lightSwitch?: Switch;
  lightState?: boolean;
}

export const setupLightSwitch = (
  mqtt: IMQTTConnection,
  controller: IController<number[] | Command> & IEventSource & { cache: LightCache },
  initialState: boolean = false
) => {
  logInfo('[Octo] Setting up light switch');
  
  try {
    // Create cache if needed
    if (!controller.cache.lightSwitch) {
      // Use the exact command formats from ESPHome config
      const ON_COMMAND = { 
        command: [0x20, 0x72], 
        data: [0x00, 0x01, 0x02, 0x01, 0x01, 0x01, 0x01, 0x01] 
      };
      
      const OFF_COMMAND = { 
      command: [0x20, 0x72],
        data: [0x00, 0x01, 0x02, 0x01, 0x01, 0x01, 0x01, 0x00] 
      };
      
      // Create the light switch
      controller.cache.lightSwitch = new Switch(
        mqtt,
        controller.deviceData,
        buildEntityConfig('UnderBedLights', { icon: 'mdi:lightbulb' }),
        async (state: boolean) => {
          logInfo(`[Octo] Light switch ${state ? 'ON' : 'OFF'} command received`);
          try {
            // Use the exact command format from ESPHome
            const command = state ? ON_COMMAND : OFF_COMMAND;
            
            await controller.writeCommand(command);
            logInfo(`[Octo] Light switch command sent successfully`);
            
            // Store state in cache for state recovery
            controller.cache.lightState = state;
            
            return true;
          } catch (error) {
            logError(`[Octo] Error sending light command: ${error}`);
            return false;
          }
        }
      );
      
      // Set initial state
      controller.cache.lightSwitch.setState(initialState);
      logInfo(`[Octo] Light switch created with initial state: ${initialState}`);
    }

    controller.on('feedback', (message: Uint8Array) => {
    const packet = extractPacketFromMessage(message);
    if (!packet) return;
    const { command, data } = packet;
    if (command[0] == 0x21 && command[1] == 0x71) {
      // feature
      const featureValuePair = extractFeatureValuePairFromData(data);
      if (!featureValuePair) return;
      const { feature, value } = featureValuePair;
        if (feature == 0x3 && controller.cache.lightSwitch) {
          controller.cache.lightSwitch.setState(value[0] == 0x01);
        }
    }
  });
  } catch (error) {
    logError(`[Octo] Error setting up light switch: ${error}`);
  }
}; 