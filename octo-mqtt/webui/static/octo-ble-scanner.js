// Octo MQTT Web Interface v2.6.4

// Diagnostics panel setup (always available)
function ensureDiagnosticsPanel() {
  let diag = document.getElementById('octo-diagnostics-panel');
  if (!diag) {
    diag = document.createElement('div');
    diag.id = 'octo-diagnostics-panel';
    diag.style = 'position:fixed;bottom:0;right:0;z-index:9999;background:#222;color:#fff;padding:8px;font-size:12px;max-width:400px;max-height:50vh;overflow:auto;border-radius:8px 0 0 0;box-shadow:0 0 8px #000;';
    diag.innerHTML = '<b>Octo MQTT Diagnostics</b><br/>';
    document.body.appendChild(diag);
  }
  return diag;
}
function logDiag(msg, color) {
  const diag = ensureDiagnosticsPanel();
  const line = document.createElement('div');
  line.innerHTML = msg;
  if (color) line.style.color = color;
  diag.appendChild(line);
  diag.scrollTop = diag.scrollHeight;
  if (color === 'red') {
    console.error('[OctoMQTT]', msg);
  } else {
    console.log('[OctoMQTT]', msg);
  }
}

// API base path for Ingress/direct
function getApiBasePath() {
  const loc = window.location;
  const ingressMatch = loc.pathname.match(/\/api\/hassio_ingress\/[\w-]+\//);
  if (ingressMatch) {
    return ingressMatch[0].replace(/\/$/, '');
  }
  return '';
}
function apiUrl(endpoint) {
  const base = getApiBasePath();
  return base + (endpoint.startsWith('/') ? endpoint : '/' + endpoint);
}

// Remove cache warning banner if present
function removeCacheWarning() {
  const banners = document.querySelectorAll('div');
  for (const b of banners) {
    if (b.textContent && b.textContent.includes('Cache Issue Detected')) {
      b.style.display = 'none';
    }
  }
}
removeCacheWarning();

// BLEScannerApp (main UI logic)
class BLEScannerApp {
  constructor() {
    logDiag('BLEScannerApp constructor called');
    this.startScanBtn = document.getElementById('start-scan');
    this.stopScanBtn = document.getElementById('stop-scan');
    this.refreshStatusBtn = document.getElementById('refresh-status');
    this.testBLEProxyBtn = document.getElementById('test-ble-proxy');
    this.bleProxyStatus = document.getElementById('bleproxy-status');
    this.scanStatus = document.getElementById('scan-status');
    this.deviceCount = document.getElementById('device-count');
    this.bleProxyDiagnostics = document.getElementById('bleproxy-diagnostics');
    this.deviceList = document.getElementById('devices-list');
    this.logContainer = document.getElementById('logs');
    this.bindEvents();
    this.refreshStatus();
    setInterval(() => this.refreshStatus(), 5000);
  }
  bindEvents() {
    this.startScanBtn.addEventListener('click', () => this.safeCall(this.startScan));
    this.stopScanBtn.addEventListener('click', () => this.safeCall(this.stopScan));
    this.refreshStatusBtn.addEventListener('click', () => this.safeCall(this.refreshStatus));
    this.testBLEProxyBtn.addEventListener('click', () => this.safeCall(this.testBLEProxy));
  }
  async safeCall(fn) {
    try { await fn.call(this); }
    catch (e) { this.addLog('❌ UI error: ' + e.message, 'error'); logDiag('UI error: ' + e.message, 'red'); }
  }
  async startScan() {
    try {
      const timestamp = new Date().toISOString();
      this.addLog(`🎯 [${timestamp}] User clicked "Start BLE Scan" button`);
      this.addLog('🚀 Sending scan start request to backend...');
      this.startScanBtn.disabled = true;
      this.stopScanBtn.disabled = false;
      const response = await fetch(apiUrl('/scan/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientInfo: 'Octo MQTT Web UI v2.6.4', timestamp, userAction: 'start-scan-button-click' })
      });
      const data = await response.json();
      if (response.ok) {
        this.addLog(`✅ Backend response: ${data.message}`, 'success');
        if (data.startTime) this.addLog(`⏰ Scan started at: ${data.startTime}`, 'info');
        if (data.scanDuration) this.addLog(`⏱️ Scan duration: ${data.scanDuration/1000}s`, 'info');
        this.updateScanStatus(true);
      } else {
        this.addLog(`❌ Backend error: ${data.error}`, 'error');
        if (data.details) this.addLog(`🔧 Details: ${data.details}`, 'error');
        if (data.troubleshooting) data.troubleshooting.forEach((tip) => this.addLog(`   • ${tip}`, 'info'));
      }
    } catch (error) {
      this.addLog(`❌ Frontend error starting scan: ${error.message}`, 'error');
      logDiag('Frontend error starting scan: ' + error.message, 'red');
    } finally {
      this.startScanBtn.disabled = false;
    }
  }
  async stopScan() {
    try {
      const timestamp = new Date().toISOString();
      this.addLog(`🎯 [${timestamp}] User clicked "Stop BLE Scan" button`);
      this.addLog('⏹️ Sending scan stop request to backend...');
      const response = await fetch(apiUrl('/scan/stop'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientInfo: 'Octo MQTT Web UI v2.6.4', timestamp, userAction: 'stop-scan-button-click' })
      });
      const data = await response.json();
      if (response.ok) {
        this.addLog(`✅ Backend response: ${data.message}`, 'success');
        if (data.stopTime) this.addLog(`⏰ Scan stopped at: ${data.stopTime}`, 'info');
        if (data.duration) this.addLog(`📊 Total scan duration: ${(data.duration/1000).toFixed(1)}s`, 'info');
        this.updateScanStatus(false);
      } else {
        this.addLog(`❌ Backend error: ${data.error}`, 'error');
        if (data.details) this.addLog(`🔧 Details: ${data.details}`, 'error');
      }
    } catch (error) {
      this.addLog(`❌ Frontend error stopping scan: ${error.message}`, 'error');
      logDiag('Frontend error stopping scan: ' + error.message, 'red');
    } finally {
      this.stopScanBtn.disabled = true;
    }
  }
  async refreshStatus() {
    try {
      const response = await fetch(apiUrl('/scan/status?source=refresh-button'));
      const data = await response.json();
      this.updateScanStatus(data.isScanning);
      this.updateDeviceCount(data.devices ? data.devices.length : 0);
      this.updateDeviceList(data.devices || []);
      this.updateBLEProxyStatus();
    } catch (error) {
      this.addLog(`❌ Error refreshing status: ${error.message}`, 'error');
      logDiag('Error refreshing status: ' + error.message, 'red');
    }
  }
  async testBLEProxy() {
    const timestamp = new Date().toISOString();
    this.addLog(`🎯 [${timestamp}] User clicked "Test BLE Proxy" button`);
    this.bleProxyDiagnostics.innerHTML = '<div class="loading">🧪 Testing BLE proxy connections...</div>';
    try {
      this.addLog('🧪 Sending BLE proxy test request to backend...');
      const response = await fetch(apiUrl('/debug/ble-proxy?source=test-button'));
      const data = await response.json();
      if (data.status === 'connected') {
        const statusIcon = '✅';
        const statusClass = 'success';
        this.addLog(`✅ BLE proxy test successful: ${data.proxies} proxy(ies) connected`, 'success');
        this.bleProxyDiagnostics.innerHTML = `<div class="diagnostic-result ${statusClass}"><strong>BLE Proxy Status:</strong> ${statusIcon} Connected (${data.proxies}/${data.total || data.proxies} proxy${data.proxies !== 1 ? 'ies' : ''})</div>`;
      } else {
        this.addLog(`❌ BLE proxy test failed: ${data.error || 'Disconnected'}`, 'error');
        this.bleProxyDiagnostics.innerHTML = `<div class="diagnostic-result error">❌ BLE Proxy Status: ${data.error || 'Disconnected'}</div>`;
      }
    } catch (error) {
      this.addLog(`❌ Frontend error testing BLE proxy: ${error.message}`, 'error');
      logDiag('Frontend error testing BLE proxy: ' + error.message, 'red');
      this.bleProxyDiagnostics.innerHTML = `<div class="diagnostic-result error">Error testing BLE proxy: ${error.message}</div>`;
    }
  }
  updateScanStatus(isScanning) {
    if (!this.scanStatus) return;
    this.scanStatus.textContent = isScanning ? 'Scanning...' : 'Idle';
    this.scanStatus.className = `status-indicator ${isScanning ? 'scanning' : 'idle'}`;
    this.startScanBtn.disabled = isScanning;
    this.stopScanBtn.disabled = !isScanning;
  }
  updateDeviceCount(count) {
    if (!this.deviceCount) return;
    this.deviceCount.textContent = count.toString();
  }
  async updateBLEProxyStatus() {
    if (!this.bleProxyStatus) return;
    try {
      const response = await fetch(apiUrl('/debug/ble-proxy'));
      const data = await response.json();
      if (data.status === 'connected') {
        this.bleProxyStatus.textContent = 'Connected';
        this.bleProxyStatus.className = 'status-indicator connected';
      } else {
        this.bleProxyStatus.textContent = 'Disconnected';
        this.bleProxyStatus.className = 'status-indicator disconnected';
      }
    } catch (error) {
      this.bleProxyStatus.textContent = 'Error';
      this.bleProxyStatus.className = 'status-indicator error';
      logDiag('Error updating BLE proxy status: ' + error.message, 'red');
    }
  }
  updateDeviceList(devices) {
    if (!this.deviceList) return;
    if (devices.length === 0) {
      this.deviceList.innerHTML = '<div class="no-devices">No devices discovered yet. Start a scan to find BLE devices.</div>';
      return;
    }
    const devicesHtml = devices.map(device => `
      <div class="device-item">
        <div class="device-info">
          <div class="device-name">${device.name || 'Unknown Device'}</div>
          <div class="device-address">${device.address}</div>
          <div class="device-rssi">RSSI: ${device.rssi} dBm</div>
          ${device.service_uuids && device.service_uuids.length > 0 ? `<div class="device-services">Services: ${device.service_uuids.join(', ')}</div>` : ''}
        </div>
        <div class="device-actions">
          <button class="btn btn-primary btn-sm" onclick="app.addDevice('${device.name || 'Unknown Device'}', '${device.address}')">➕ Add Device</button>
        </div>
      </div>
    `).join('');
    this.deviceList.innerHTML = devicesHtml;
  }
  async addDevice(name, address) {
    try {
      const friendlyName = prompt(`Enter a friendly name for ${name}:`, name);
      if (!friendlyName) return;
      const response = await fetch(apiUrl('/devices/add'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, address, friendlyName })
      });
      const data = await response.json();
      if (response.ok) {
        this.addLog(`✅ Device added: ${friendlyName} (${address})`, 'success');
        this.refreshStatus();
      } else {
        this.addLog(`❌ ${data.error}`, 'error');
      }
    } catch (error) {
      this.addLog(`❌ Error adding device: ${error.message}`, 'error');
      logDiag('Error adding device: ' + error.message, 'red');
    }
  }
  addLog(message, type = 'info') {
    if (!this.logContainer) return;
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type}`;
    logEntry.innerHTML = `<span class="log-time">[${timestamp}]</span> ${message}`;
    this.logContainer.appendChild(logEntry);
    this.logContainer.scrollTop = this.logContainer.scrollHeight;
    while (this.logContainer.children.length > 50) {
      this.logContainer.removeChild(this.logContainer.firstChild);
    }
  }
}

// Initialize app when DOM is loaded (as before)
document.addEventListener('DOMContentLoaded', () => {
  try {
    logDiag('🚀 Octo MQTT v2.6.4 - UI Initialization...');
    window.app = new BLEScannerApp();
    logDiag('✅ Main UI loaded successfully.');
  } catch (e) {
    logDiag('❌ Main UI failed to load: ' + e.message, 'red');
    if (e.stack) logDiag('Stack: ' + e.stack, 'red');
  }
});

// Expose diagnostics for manual testing
window.OctoMQTTDiag = { apiUrl, logDiag };
logDiag('Diagnostics loaded.'); 