// This is just a stub file to satisfy imports
export class DeviceInfoSensor {
  constructor(mqtt: any, deviceData: any) {
    // Silence unused parameter warnings
    this._silence(mqtt, deviceData);
  }
  
  private _silence(...args: any[]): void {
    // Do nothing
  }
  
  setState(deviceInfo: any): DeviceInfoSensor {
    // Silence unused parameter warnings
    this._silence(deviceInfo);
    return this;
  }
}
