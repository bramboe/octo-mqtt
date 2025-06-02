export interface IDeviceData {
  deviceTopic: string;
  device: {
    ids: string[];
    name: string;
    mf: string;
    mdl: string;
    sw_version?: string;  // Optional software/firmware version
  };
  firmwareVersion?: string;  // Added for device info tracking
}

interface IDevice {
  ids: string[];
  name: string;
  mf: string;
  mdl: string;
}
