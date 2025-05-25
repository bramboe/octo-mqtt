import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { BLEController } from './BLEController';

// Helper function to silence unused parameter warnings
const _silence = (..._args: any[]): void => {
  // Do nothing
};

// Simple stub implementation
export const setupDeviceInfoSensor = (
  mqtt: IMQTTConnection,
  controller: BLEController,
  deviceInfo: any
): void => {
  // Silence unused parameter warnings
  _silence(mqtt, controller, deviceInfo);
  // This is just a stub implementation to satisfy the import
};
