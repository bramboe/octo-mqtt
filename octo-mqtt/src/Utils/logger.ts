// Logger utilities
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const format = (level: LogLevel, message: any) => {
  return `${level} [${new Date().toISOString()}] ${message}`;
};

export const logDebug = (message: any, ...optionalParams: any[]) => {
  console.debug(format('debug', message), ...optionalParams);
};
export const logInfo = (message: any, ...optionalParams: any[]) => {
  console.info(format('info', message), ...optionalParams);
};
export const logWarn = (message: any, ...optionalParams: any[]) => {
  console.warn(format('warn', message), ...optionalParams);
};
export const logError = (message: any, ...optionalParams: any[]) => {
  console.error(format('error', message), ...optionalParams);
};

// Cache-busting function
export const __forceCacheBust__ = () => {
  return "bust-" + Math.random().toString(36).substring(7);
};
