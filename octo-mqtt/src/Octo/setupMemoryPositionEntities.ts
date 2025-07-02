import { BLEController } from '../BLE/BLEController';
import { Commands } from '../Common/Commands';
import { buildMQTTDeviceData } from '../Common/buildMQTTDeviceData';
import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { logInfo, logError } from '../Utils/logger';
import { OctoStorage } from './storage';

interface MemoryPosition {
  head: number;
  feet: number;
}

interface MemoryPositions {
  A: MemoryPosition | null;
  B: MemoryPosition | null;
  C: MemoryPosition | null;
}

const MEMORY_POSITIONS: MemoryPositions = {
  A: null,
  B: null,
  C: null,
};

export async function setupMemoryPositionEntities(
  controller: BLEController,
  storage: OctoStorage,
  mqtt: IMQTTConnection
): Promise<void> {
  logInfo('[Octo] Setting up memory position entities');

  // Ensure we have a valid address for the device
  const deviceAddress = controller.deviceData.device.ids?.[0] || controller.deviceData.device.mdl || 'unknown';
  
  const deviceData = buildMQTTDeviceData({
    friendlyName: controller.deviceData.device.name,
    name: controller.deviceData.device.mdl,
    address: deviceAddress
  }, 'Octo');
  
  const deviceId = deviceData.deviceTopic;

  // Setup memory position buttons (A, B, C)
  ['A', 'B', 'C'].forEach((position) => {
    // Set Memory Position Button
    const setMemoryConfig = {
      name: `Set Memory ${position}`,
      unique_id: `${deviceId}_set_memory_${position.toLowerCase()}`,
      device: deviceData.device,
      command_topic: `homeassistant/button/${deviceId}/set_memory_${position.toLowerCase()}/command`,
      icon: 'mdi:content-save',
      retain: true
    };

    mqtt.publish(
      `homeassistant/button/${deviceId}/set_memory_${position.toLowerCase()}/config`,
      setMemoryConfig
    );

    // Recall Memory Position Button
    const recallMemoryConfig = {
      name: `Memory ${position}`,
      unique_id: `${deviceId}_recall_memory_${position.toLowerCase()}`,
      device: deviceData.device,
      command_topic: `homeassistant/button/${deviceId}/recall_memory_${position.toLowerCase()}/command`,
      icon: 'mdi:numeric-${position.toLowerCase()}-box-outline',
      retain: true
    };

    mqtt.publish(
      `homeassistant/button/${deviceId}/recall_memory_${position.toLowerCase()}/config`,
      recallMemoryConfig
    );

    // Subscribe to set memory button
    mqtt.subscribe(setMemoryConfig.command_topic);
    mqtt.on(setMemoryConfig.command_topic, async () => {
      try {
        // Get current positions from storage
        const headPosition = storage.get('head_current_position');
        const feetPosition = storage.get('feet_current_position');

        // Store the positions
        MEMORY_POSITIONS[position as keyof MemoryPositions] = {
          head: headPosition,
          feet: feetPosition
        };

        logInfo(`[Octo] Stored memory position ${position}: Head=${headPosition}%, Feet=${feetPosition}%`);
      } catch (error) {
        logError(`[Octo] Failed to store memory position ${position}:`, error);
      }
    });

    // Subscribe to recall memory button
    mqtt.subscribe(recallMemoryConfig.command_topic);
    mqtt.on(recallMemoryConfig.command_topic, async () => {
      try {
        const memoryPosition = MEMORY_POSITIONS[position as keyof MemoryPositions];
        if (!memoryPosition) {
          logInfo(`[Octo] No position stored in memory ${position}`);
          return;
        }

        // Send commands to move to stored position
        const command = position === 'A' ? Commands.PresetMemory1 :
                       position === 'B' ? Commands.PresetMemory2 :
                       Commands.PresetMemory3;

        await controller.writeCommand({ command: [command] });
        logInfo(`[Octo] Recalled memory position ${position}: Head=${memoryPosition.head}%, Feet=${memoryPosition.feet}%`);
      } catch (error) {
        logError(`[Octo] Failed to recall memory position ${position}:`, error);
      }
    });
  });

  logInfo('[Octo] Memory position entities setup complete');
}