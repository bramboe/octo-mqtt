import { logError, logInfo } from '@utils/logger';
import { getDevices } from './options';
import { IESPConnection } from 'ESPHome/IESPConnection';
import { Deferred } from '@utils/deferred';
import { IBLEDevice } from 'ESPHome/types/IBLEDevice';

const characteristicPropertyValues = {
  BROADCAST: 0x01,
  READ: 0x02,
  WRITE_NO_RESPONSE: 0x04,
  WRITE: 0x08,
  NOTIFY: 0x10,
  INDICATE: 0x20,
  AUTHENTICATED: 0x40,
  EXTENDED: 0x80,
};

const extractPropertyNames = (properties: number) => {
  const propertiesList: string[] = [];

  for (const [name, value] of Object.entries(characteristicPropertyValues)) {
    if ((properties & value) === value) {
      properties -= value;
      propertiesList.push(name);
      if (properties === 0) break;
    }
  }
  return propertiesList.sort();
};

export const scanner = async (esphome: IESPConnection) => {
  const devices = getDevices().filter((d) => !!d.name);
  
  if (devices.length === 0) {
    logInfo('[Scanner] No devices configured');
    return;
  }
  
  // Create a map of device names to their configs
  const deviceMap: Record<string, any> = {};
  devices.forEach(device => {
    deviceMap[device.name.toLowerCase()] = device;
  });
  
  const deviceNames = devices.map(d => d.name.toLowerCase());
  
  if (deviceNames.length !== devices.length) {
    return logError('[Scanner] Duplicate name detected in configuration');
  }

  const bleDevices = await esphome.getBLEDevices(deviceNames);
  
  for (const bleDevice of bleDevices) {
    const { name, mac } = bleDevice;
    
    logInfo(`[Scanner] Found device: ${name} (${mac})`);
    
    try {
      const { connect, disconnect, getDeviceInfo, getServices } = bleDevice;
      
      logInfo(`[Scanner] Connecting to ${name}`);
      await connect();
      
      logInfo('[Scanner] Querying GATT services');
      const services = await getServices();

      logInfo('[Scanner] Extracting device info');
      const deviceInfo = await getDeviceInfo();

      const servicesList = await Promise.all(
        services.map(async (service) => {
          const characteristicList = await Promise.all(
            service.characteristicsList.map(async (characteristic: any) => {
              const { properties, handle } = characteristic;
              const propertyList = [properties, ...extractPropertyNames(properties)];
              let data = undefined;
              if ((properties & 2) === 2) {
                try {
                  const value = await bleDevice.readCharacteristic(handle);
                  const buffer = Buffer.from(value);
                  data = {
                    base64: buffer.toString('base64'),
                    ascii: buffer.toString(),
                    raw: Array.from(value),
                  };
                } catch {
                  data = 'Read Error';
                  console.error(`Couldn't read characteristic 0x${handle.toString(16)}`);
                }
              }
              return { ...characteristic, properties: propertyList, ...(data ? { data } : {}) };
            })
          );
          return {
            ...service,
            characteristicsList: characteristicList.sort(({ uuid: uuidA }, { uuid: uuidB }) =>
              uuidA.localeCompare(uuidB)
            ),
          };
        })
      );
      
      const { address, addressType, rssi } = bleDevice.advertisement;
      const deviceData = {
        name,
        mac,
        address,
        addressType,
        rssi,
        ...(deviceInfo ? { deviceInfo } : {}),
        servicesList: servicesList.sort(({ uuid: uuidA }, { uuid: uuidB }) => uuidA.localeCompare(uuidB)),
      };

      logInfo(`[Scanner] Output:\n${JSON.stringify(deviceData, null, 2)}`);

      await disconnect();
    } catch (error) {
      logError(`[Scanner] Error scanning device ${name}:`, error);
    }
  }
  
  esphome.disconnect();
  logInfo('[Scanner] Done');
};
