// bleproxy-test.js
// Usage: node bleproxy-test.js <host> <port>
const { Connection } = require('@2colors/esphome-native-api');

const host = process.argv[2] || '192.168.1.109';
const port = parseInt(process.argv[3] || '6053', 10);

async function main() {
  const conn = new Connection({ host, port });
  await conn.connect();
  console.log(`[BLEPROXY-TEST] Connected to ${host}:${port}`);

  conn.on('message.BluetoothLEAdvertisementResponse', (data) => {
    console.log('[BLE ADV]', JSON.stringify(data));
  });

  await conn.subscribeBluetoothAdvertisementService();
  console.log('[BLEPROXY-TEST] Subscribed to advertisements. Listening...');

  // Keep alive
  setInterval(() => {}, 1000);
}

main().catch((err) => {
  console.error('[BLEPROXY-TEST] Error:', err);
  process.exit(1);
}); 