import { IDeviceData } from '../HomeAssistant/IDeviceData';
import { safeId } from '../Utils/safeId';

export type Device = { friendlyName: string; name: string; address: string };

export const buildMQTTDeviceData = ({ friendlyName, name, address }: Device, manufacturer: string): IDeviceData => {
  return {
    deviceTopic: `${safeId(manufacturer)}/${safeId(address)}`,
    device: {
      ids: [address],
      name: friendlyName,
      mf: manufacturer,
      mdl: name,
    },
  };
};
