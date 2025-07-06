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
            this.addLog('🚀 Starting BLE scan...');
            this.startScanBtn.disabled = true;
            this.stopScanBtn.disabled = false;
            
            const response = await fetch('/scan/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.addLog(`✅ ${data.message}`, 'success');
                this.updateScanStatus(true);
            } else {
                this.addLog(`❌ ${data.error}: ${data.details || ''}`, 'error');
                if (data.troubleshooting) {
                    this.addLog('💡 Troubleshooting:', 'info');
                    data.troubleshooting.forEach((tip) => {
                        this.addLog(`   • ${tip}`, 'info');
                    });
                }
            }
        } catch (error) {
            this.addLog(`❌ Error starting scan: ${error.message}`, 'error');
        } finally {
            this.startScanBtn.disabled = false;
        }
    }

    async stopScan() {
        try {
            this.addLog('⏹️ Stopping BLE scan...');
            
            const response = await fetch('/scan/stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.addLog(`✅ ${data.message}`, 'success');
                this.updateScanStatus(false);
            } else {
                this.addLog(`❌ ${data.error}`, 'error');
            }
        } catch (error) {
            this.addLog(`❌ Error stopping scan: ${error.message}`, 'error');
        } finally {
            this.stopScanBtn.disabled = true;
        }
    }

    async refreshStatus() {
        try {
            const response = await fetch('/scan/status');
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
        this.bleProxyDiagnostics.innerHTML = '<div class="loading">🧪 Testing BLE proxy connections...</div>';
        
        try {
            const response = await fetch('/debug/ble-proxy');
            const data = await response.json();
            
            if (data.status === 'connected') {
                const statusIcon = '✅';
                const statusClass = 'success';
                this.bleProxyDiagnostics.innerHTML = `
                    <div class="diagnostic-result ${statusClass}">
                        <strong>BLE Proxy Status:</strong> 
                        ${statusIcon} Connected (${data.proxies}/${data.total || data.proxies} proxy${data.proxies !== 1 ? 'ies' : ''})
                    </div>
                `;
            } else {
                this.bleProxyDiagnostics.innerHTML = `
                    <div class="diagnostic-result error">
                        ❌ BLE Proxy Status: ${data.error || 'Disconnected'}
                    </div>
                `;
            }
        } catch (error) {
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
            const response = await fetch('/debug/ble-proxy');
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
            
            const response = await fetch('/devices/add', {
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
// Version 2.3.1 - Fixed BLE proxy API response handling
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔧 Octo MQTT v2.3.1 - BLE Proxy API Fix Applied');
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