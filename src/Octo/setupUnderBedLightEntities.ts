import { IMQTTConnection } from '@mqtt/IMQTTConnection';
import { BLEController } from '../BLE/BLEController';
import { logInfo } from '@utils/logger';

export async function setupUnderBedLightEntities(mqtt: IMQTTConnection, controller: BLEController): Promise<void> {
  logInfo('[Octo] Setting up under bed light entities');
  // TODO: Implement under bed light entities setup
} 