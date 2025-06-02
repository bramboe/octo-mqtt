import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { BLEController } from '../BLE/BLEController';
import { logInfo } from '../Utils/logger';
// ... existing code ... 

export const setupDeviceInfoSensor = async (
  mqtt: IMQTTConnection,
  controller: BLEController,
  deviceId: string,
  name: string,
  model: string,
  manufacturer: string
) => {
  logInfo(`[DeviceInfo] Setting up device info sensor for ${name}`);
  
  const deviceData = {
    identifiers: [deviceId],
    name,
    model,
    manufacturer,
    sw_version: controller.deviceData.firmwareVersion || 'Unknown'
  };

  const config = {
    name: `${name} Device Info`,
    unique_id: `${deviceId}_device_info`,
    device: deviceData,
    state_topic: `homeassistant/sensor/${deviceId}/device_info/state`,
    json_attributes_topic: `homeassistant/sensor/${deviceId}/device_info/attributes`,
    icon: 'mdi:information',
    retain: true
  };

  // Publish device info configuration
  mqtt.publish(
    `homeassistant/sensor/${deviceId}/device_info/config`,
    config
  );

  // Publish device state
  mqtt.publish(
    `homeassistant/sensor/${deviceId}/device_info/state`,
    'Online'
  );

  // Publish detailed attributes
  const attributes = {
    firmware_version: controller.deviceData.firmwareVersion || 'Unknown',
    model,
    manufacturer,
    mac_address: deviceId,
    friendly_name: name
  };

  mqtt.publish(
    `homeassistant/sensor/${deviceId}/device_info/attributes`,
    attributes
  );

  logInfo(`[DeviceInfo] Successfully set up device info sensor for ${name}`);
}; 