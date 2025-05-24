/**
 * A simple utility to test if an ESPHome device is accessible
 * This can be called from the command line with:
 * ts-node src/ESPHome/testConnection.ts <host> <port>
 */
declare const testConnection: (host: string, port: number) => Promise<boolean>;
export { testConnection };
