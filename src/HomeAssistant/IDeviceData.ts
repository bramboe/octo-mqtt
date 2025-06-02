export interface IDeviceData {
  deviceTopic: string;
  device: {
    ids: string[];
    name: string;
    mf: string;
    mdl: string;
    sw_version?: string;
  };
  firmwareVersion?: string;
}
