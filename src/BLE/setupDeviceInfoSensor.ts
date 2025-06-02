import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { BLEController } from './BLEController';
// ... existing code ... 

export const setupDeviceInfoSensor = async (
  mqtt: IMQTTConnection,
  controller: BLEController,
  deviceId: string,
  name: string,
  model: string,
  manufacturer: string
) => {
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

  mqtt.publish(
    `homeassistant/sensor/${deviceId}/device_info/config`,
    JSON.stringify(config)
  );

  mqtt.publish(
    `homeassistant/sensor/${deviceId}/device_info/state`,
    'Online'
  );

  mqtt.publish(
    `homeassistant/sensor/${deviceId}/device_info/attributes`,
    JSON.stringify({
      firmware_version: controller.deviceData.firmwareVersion || 'Unknown',
      model,
      manufacturer
    })
  );
}; 