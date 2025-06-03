import { IDeviceData } from '../HomeAssistant/IDeviceData';

export const testDevice: IDeviceData = {
  deviceTopic: 'device_topic',
  device: {
    ids: ['id'],
    name: 'Test Name',
    mf: 'Test mf',
    mdl: 'Test mdl',
  },
};

// export const mocked = <T>(func: T): T & jest.MockedFunction<any> => func as any;
