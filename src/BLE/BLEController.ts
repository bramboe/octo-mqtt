import { EventEmitter } from 'events';
import { logError } from '../Utils/logger';
import { IBLEDevice } from '../ESPHome/types/IBLEDevice';
import { IController } from '../Common/IController';
import { Dictionary } from '../Utils/Dictionary';
import { IDeviceData } from '../HomeAssistant/IDeviceData';
import { IEventSource } from '../Common/IEventSource';

export interface BLEDeviceAdvertisement {
  name: string;
  address: number;
  rssi: number;
  service_uuids: string[];
}

export interface Command {
  command: number[];
  data?: number[];
  retries?: number;
  waitTime?: number;
}

export interface LightCache {
  state: boolean;
  brightness: number;
}

export class BLEController<TCommand = Command | number[]> extends EventEmitter implements IController<TCommand>, IEventSource {
  public cache: Dictionary<Object> = {};
  public deviceData: IDeviceData;
  private timer?: any;
  private notifyValues: Dictionary<Uint8Array> = {};
  private disconnectTimeout?: NodeJS.Timeout;
  private lastCommands?: number[][];

  constructor(
    deviceData: IDeviceData,
    private bleDevice: IBLEDevice,
    private handle: number,
    private commandBuilder: (command: TCommand) => number[],
    private notifyHandles: Dictionary<number> = {},
    private stayConnected: boolean = false
  ) {
    super();
    this.deviceData = deviceData;
    
    Object.entries(this.notifyHandles).forEach(([key, handle]) => {
      this.stayConnected ||= true;
      void this.bleDevice.subscribeToCharacteristic(handle, (data) => {
        const previous = this.notifyValues[key];
        if (previous && this.arrayEquals(data, previous)) return;
        this.emit(key, data);
      });
    });
  }

  private arrayEquals(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  private disconnect = () => this.bleDevice.disconnect();

  private write = async (command: number[]) => {
    if (this.disconnectTimeout) {
      clearTimeout(this.disconnectTimeout);
      this.disconnectTimeout = undefined;
    }
    try {
      await this.bleDevice.writeCharacteristic(this.handle, new Uint8Array(command));
    } catch (e) {
      logError(`[BLE] Failed to write characteristic`, e);
    }
    if (this.stayConnected) return;

    this.disconnectTimeout = setTimeout(this.disconnect, 60_000);
  };

  writeCommand = (command: TCommand, count: number = 1, waitTime?: number) =>
    this.writeCommands([command], count, waitTime);

  writeCommands = async (commands: TCommand[], count: number = 1, waitTime?: number) => {
    const commandList = commands.map(this.commandBuilder).filter((command) => command.length > 0);
    if (commandList.length === 0) return;

    await this.bleDevice.connect();

    const onTick =
      commandList.length === 1 ? () => this.write(commandList[0]) : () => this.loopWithWait(commandList, this.write);
    if (count === 1 && !waitTime) return await onTick();

    if (this.timer && this.lastCommands) {
      if (this.deepArrayEquals(commandList, this.lastCommands)) return void this.timer.extendCount(count);
      await this.cancelCommands();
    }

    this.lastCommands = commandList;
    const onFinish = () => {
      this.timer = undefined;
      this.lastCommands = undefined;
    };
    this.timer = new (class Timer {
      private count: number;
      private onTick: () => void;
      private waitTime?: number;
      private onFinish: () => void;
      private interval?: NodeJS.Timeout;

      constructor(onTick: () => void, count: number, waitTime?: number, onFinish?: () => void) {
        this.onTick = onTick;
        this.count = count;
        this.waitTime = waitTime;
        this.onFinish = onFinish || (() => {});
      }

      async start() {
        for (let i = 0; i < this.count; i++) {
          await this.onTick();
          if (this.waitTime && i < this.count - 1) {
            await new Promise(resolve => setTimeout(resolve, this.waitTime));
          }
        }
        this.onFinish();
      }

      extendCount(count: number) {
        this.count += count;
      }

      async cancel() {
        if (this.interval) {
          clearInterval(this.interval);
        }
        this.onFinish();
      }
    })(onTick, count, waitTime, onFinish);
    await this.timer.start();
  };

  private async loopWithWait(commands: number[][], writeFn: (command: number[]) => Promise<void>) {
    for (const command of commands) {
      await writeFn(command);
    }
  }

  private deepArrayEquals(a: number[][], b: number[][]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!this.arrayEquals(new Uint8Array(a[i]), new Uint8Array(b[i]))) return false;
    }
    return true;
  }

  cancelCommands = async () => {
    await this.timer?.cancel();
  };

  on = (eventName: string, handler: (data: Uint8Array) => void): this => {
    this.addListener(eventName, handler);
    return this;
  };
} 