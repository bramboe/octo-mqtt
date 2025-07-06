// Octo MQTT Web Interface
class BLEScannerApp {
    constructor() {
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
        
        // Auto-refresh status every 5 seconds
        setInterval(() => this.refreshStatus(), 5000);
    }

    bindEvents() {
        this.startScanBtn.addEventListener('click', () => this.startScan());
        this.stopScanBtn.addEventListener('click', () => this.stopScan());
        this.refreshStatusBtn.addEventListener('click', () => this.refreshStatus());
        this.testBLEProxyBtn.addEventListener('click', () => this.testBLEProxy());
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
                body: JSON.stringify({
                    clientInfo: 'Octo MQTT Web UI v2.6.3',
                    timestamp: timestamp,
                    userAction: 'start-scan-button-click'
                })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.addLog(`✅ Backend response: ${data.message}`, 'success');
                if (data.startTime) {
                    this.addLog(`⏰ Scan started at: ${data.startTime}`, 'info');
                }
                if (data.scanDuration) {
                    this.addLog(`⏱️ Scan duration: ${data.scanDuration/1000}s`, 'info');
                }
                this.updateScanStatus(true);
            } else {
                this.addLog(`❌ Backend error: ${data.error}`, 'error');
                if (data.details) {
                    this.addLog(`🔧 Details: ${data.details}`, 'error');
                }
                if (data.troubleshooting) {
                    this.addLog('💡 Troubleshooting:', 'info');
                    data.troubleshooting.forEach((tip) => {
                        this.addLog(`   • ${tip}`, 'info');
                    });
                }
            }
        } catch (error) {
            this.addLog(`❌ Frontend error starting scan: ${error.message}`, 'error');
            this.addLog('🔧 This indicates a network or connectivity issue', 'error');
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
                body: JSON.stringify({
                    clientInfo: 'Octo MQTT Web UI v2.6.3',
                    timestamp: timestamp,
                    userAction: 'stop-scan-button-click'
                })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.addLog(`✅ Backend response: ${data.message}`, 'success');
                if (data.stopTime) {
                    this.addLog(`⏰ Scan stopped at: ${data.stopTime}`, 'info');
                }
                if (data.duration) {
                    this.addLog(`📊 Total scan duration: ${(data.duration/1000).toFixed(1)}s`, 'info');
                }
                this.updateScanStatus(false);
            } else {
                this.addLog(`❌ Backend error: ${data.error}`, 'error');
                if (data.details) {
                    this.addLog(`🔧 Details: ${data.details}`, 'error');
                }
            }
        } catch (error) {
            this.addLog(`❌ Frontend error stopping scan: ${error.message}`, 'error');
            this.addLog('🔧 This indicates a network or connectivity issue', 'error');
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
            
            // Also update BLE proxy status
            this.updateBLEProxyStatus();
            
        } catch (error) {
            this.addLog(`❌ Error refreshing status: ${error.message}`, 'error');
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
                this.bleProxyDiagnostics.innerHTML = `
                    <div class="diagnostic-result ${statusClass}">
                        <strong>BLE Proxy Status:</strong> 
                        ${statusIcon} Connected (${data.proxies}/${data.total || data.proxies} proxy${data.proxies !== 1 ? 'ies' : ''})
                    </div>
                `;
            } else {
                this.addLog(`❌ BLE proxy test failed: ${data.error || 'Disconnected'}`, 'error');
                this.bleProxyDiagnostics.innerHTML = `
                    <div class="diagnostic-result error">
                        ❌ BLE Proxy Status: ${data.error || 'Disconnected'}
                    </div>
                `;
            }
        } catch (error) {
            this.addLog(`❌ Frontend error testing BLE proxy: ${error.message}`, 'error');
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
                    ${device.service_uuids && device.service_uuids.length > 0 ? 
                        `<div class="device-services">Services: ${device.service_uuids.join(', ')}</div>` : ''}
                </div>
                <div class="device-actions">
                    <button class="btn btn-primary btn-sm" onclick="app.addDevice('${device.name || 'Unknown Device'}', '${device.address}')">
                        ➕ Add Device
                    </button>
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
                body: JSON.stringify({
                    name: name,
                    address: address,
                    friendlyName: friendlyName
                })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.addLog(`✅ Device added: ${friendlyName} (${address})`, 'success');
                this.refreshStatus(); // Refresh to update device list
            } else {
                this.addLog(`❌ ${data.error}`, 'error');
            }
        } catch (error) {
            this.addLog(`❌ Error adding device: ${error.message}`, 'error');
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
        
        // Keep only last 50 log entries
        while (this.logContainer.children.length > 50) {
            this.logContainer.removeChild(this.logContainer.firstChild);
        }
    }
}

// Initialize app when DOM is loaded
// Version 2.6.3 - BUILD FIX RELEASE
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Octo MQTT v2.6.3 - BUILD FIX RELEASE LOADED!');
    console.log('✅ JavaScript file: octo-ble-scanner.js loaded successfully');
    console.log('🔧 BLE Proxy API Fix + Enhanced UI Action Logging Applied!');
    window.app = new BLEScannerApp();
});

// Helper to get base path for API calls (Ingress compatibility)
function getApiBasePath() {
  // If running under Home Assistant Ingress, window.location.pathname will include /api/hassio_ingress/<token>/
  const path = window.location.pathname;
  const match = path.match(/\/api\/hassio_ingress\/[a-zA-Z0-9]+\//);
  if (match) {
    return match[0].replace(/\/$/, ''); // Remove trailing slash
  }
  return '';
}

function apiUrl(endpoint) {
  return getApiBasePath() + endpoint;
}

// == Octo MQTT BLE Scanner Diagnostics & Hardened Frontend ==
(function() {
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

  // Diagnostics panel setup
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
    // Also log to console
    if (color === 'red') {
      console.error('[OctoMQTT]', msg);
    } else {
      console.log('[OctoMQTT]', msg);
    }
  }

  // Global error handlers
  window.onerror = function(msg, url, line, col, err) {
    logDiag('JS Error: ' + msg + ' at ' + url + ':' + line + ':' + col, 'red');
    if (err && err.stack) logDiag('Stack: ' + err.stack, 'red');
  };
  window.onunhandledrejection = function(e) {
    logDiag('Promise rejection: ' + (e.reason ? e.reason : e), 'red');
  };

  // API base URL detection (Ingress/direct)
  function getApiBase() {
    const loc = window.location;
    // If running under Ingress, path will be /api/hassio_ingress/<token>/...
    const ingressMatch = loc.pathname.match(/\/api\/hassio_ingress\/[\w-]+\//);
    if (ingressMatch) {
      // Use the ingress prefix as base
      return ingressMatch[0].replace(/\/$/, '');
    }
    // Otherwise, use root
    return '';
  }
  const API_BASE = getApiBase();
  logDiag('API base detected: ' + (API_BASE || '[root]'));

  // API call helper
  async function apiCall(path, opts) {
    // Ensure path does not double up slashes
    let url = API_BASE + (path.startsWith('/') ? path : '/' + path);
    logDiag('API call: ' + url);
    try {
      const resp = await fetch(url, opts);
      logDiag('Response ' + url + ': ' + resp.status);
      if (!resp.ok) {
        const text = await resp.text();
        logDiag('Error response: ' + text, 'red');
        throw new Error('API ' + path + ' failed: ' + resp.status);
      }
      const ct = resp.headers.get('content-type') || '';
      if (ct.includes('json')) {
        const data = await resp.json();
        logDiag('Data: ' + JSON.stringify(data));
        return data;
      } else {
        const text = await resp.text();
        logDiag('Text: ' + text);
        return text;
      }
    } catch (e) {
      logDiag('API call failed: ' + e, 'red');
      throw e;
    }
  }

  // Startup self-test
  async function selfTest() {
    logDiag('Running startup self-test...');
    try {
      await apiCall('/health');
    } catch (e) {
      logDiag('Health check failed: ' + e, 'red');
    }
    try {
      await apiCall('/scan/status');
    } catch (e) {
      logDiag('Scan status failed: ' + e, 'red');
    }
  }

  // Run self-test after DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', selfTest);
  } else {
    selfTest();
  }

  // Expose diagnostics for manual testing
  window.OctoMQTTDiag = { apiCall, logDiag };

  logDiag('Diagnostics loaded.');
})(); 