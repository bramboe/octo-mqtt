import { IMQTTConnection } from '../MQTT/IMQTTConnection';
import { logInfo } from '../Utils/logger';
import { IDeviceData } from '../HomeAssistant/IDeviceData';
import { JsonSensor } from '../HomeAssistant/JsonSensor';

interface DeviceInfo {
  name: string;
  model: string;
  manufacturer: string;
  firmware_version: string;
}

export const setupDeviceInfoSensor = (mqtt: IMQTTConnection, deviceData: IDeviceData) => {
  logInfo('[DeviceInfo] Setting up device info sensor');
  
  const deviceInfoSensor = new JsonSensor<DeviceInfo>(mqtt, deviceData, {
    description: 'Device Info',
    category: 'diagnostic',
    icon: 'mdi:information'
  });

  deviceInfoSensor.setJsonState({
    name: deviceData.device.name || 'Unknown',
    model: deviceData.device.mdl || 'Unknown',
    manufacturer: deviceData.device.mf || 'Unknown',
    firmware_version: deviceData.firmwareVersion || 'Unknown'
  });

  return deviceInfoSensor;
}; 