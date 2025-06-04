import { Connection } from '@2colors/esphome-native-api';
import { logError, logInfo, logWarn } from '../Utils/logger';

export const connect = async (connection: Connection): Promise<Connection> => {
  try {
    await connection.connect();
    logInfo('[ESPHome] Connected successfully');
    return connection;
  } catch (error) {
    logError('[ESPHome] Connection failed:', error);
    throw error;
  }
};
