// Octo MQTT Web Interface
class OctoMQTTInterface {
    constructor() {
        this.isScanning = false;
        this.scanStartTime = null;
        this.scanDuration = 30000; // 30 seconds
        this.updateInterval = null;
        this.statusInterval = null;
        
        this.initializeElements();
        this.bindEvents();
        this.startStatusUpdates();
        this.addLog('Web interface initialized');
    }

    initializeElements() {
        // Status elements
        this.mqttStatus = document.getElementById('mqtt-status');
        this.scanStatus = document.getElementById('scan-status');
        this.deviceCount = document.getElementById('device-count');
        
        // Control elements
        this.startScanBtn = document.getElementById('start-scan');
        this.stopScanBtn = document.getElementById('stop-scan');
        this.refreshStatusBtn = document.getElementById('refresh-status');
        
        // Scan elements
        this.scanProgress = document.getElementById('scan-progress');
        this.progressFill = document.getElementById('progress-fill');
        this.scanTime = document.getElementById('scan-time');
        this.devicesList = document.getElementById('devices-list');
        
        // Config elements
        this.proxyCount = document.getElementById('proxy-count');
        this.octoCount = document.getElementById('octo-count');
        
        // Logs element
        this.logsContainer = document.getElementById('logs');
        
        this.bleProxyStatus = document.getElementById('bleproxy-status');
    }

    bindEvents() {
        this.startScanBtn.addEventListener('click', () => this.startScan());
        this.stopScanBtn.addEventListener('click', () => this.stopScan());
        this.refreshStatusBtn.addEventListener('click', () => this.refreshStatus());
    }

    async startStatusUpdates() {
        // Update status immediately
        await this.refreshStatus();
        
        // Then update every 5 seconds
        this.statusInterval = setInterval(() => {
            this.refreshStatus();
        }, 5000);
    }

    async refreshStatus() {
        try {
            const response = await fetch(apiUrl('/health'));
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            
            this.updateMQTTStatus(data.mqttConnected);
            this.updateScanStatus(data.isScanning);
            this.updateBLEProxyStatus(data.bleProxyConnected || false);
            this.addLog(`Status refreshed - MQTT: ${data.mqttConnected ? 'Connected' : 'Disconnected'} BLE Proxy: ${data.bleProxyConnected ? 'Connected' : 'Disconnected'}`);
            
        } catch (error) {
            this.addLog(`Error refreshing status: ${error.message}`, 'error');
            this.updateMQTTStatus(false);
            this.updateBLEProxyStatus(false);
        }
    }

    updateMQTTStatus(connected) {
        this.mqttStatus.textContent = connected ? 'Connected' : 'Disconnected';
        this.mqttStatus.className = `status-indicator ${connected ? 'connected' : 'disconnected'}`;
    }

    updateBLEProxyStatus(connected) {
        if (!this.bleProxyStatus) return;
        this.bleProxyStatus.textContent = connected ? 'Connected' : 'Disconnected';
        this.bleProxyStatus.className = `status-indicator ${connected ? 'connected' : 'disconnected'}`;
    }

    updateScanStatus(scanning) {
        this.isScanning = scanning;
        this.scanStatus.textContent = scanning ? 'Scanning...' : 'Idle';
        this.scanStatus.className = `status-indicator ${scanning ? 'scanning' : 'idle'}`;
        
        this.startScanBtn.disabled = scanning;
        this.stopScanBtn.disabled = !scanning;
        
        if (scanning) {
            this.scanProgress.style.display = 'block';
            this.startScanProgress();
      } else {
            this.scanProgress.style.display = 'none';
            this.stopScanProgress();
        }
    }

    async startScan() {
        try {
            this.addLog('Starting BLE scan...', 'info');
            
            const response = await fetch(apiUrl('/scan/start'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
            if (!response.ok) {
                const errorText = await response.text();
                let errorData;
                try {
                    errorData = JSON.parse(errorText);
                } catch (e) {
                    throw new Error(`HTTP ${response.status}: ${errorText}`);
                }
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            this.addLog(`Scan started successfully - Duration: ${data.scanDuration}ms`, 'success');
            this.updateScanStatus(true);
            this.scanStartTime = Date.now();
            this.startScanProgress();
            
        } catch (error) {
            this.addLog(`Error starting scan: ${error.message}`, 'error');
        }
    }

    async stopScan() {
        try {
            this.addLog('Stopping BLE scan...', 'info');
            this.updateScanStatus(false);
            this.stopScanProgress();
        } catch (error) {
            this.addLog(`Error stopping scan: ${error.message}`, 'error');
        }
    }

    startScanProgress() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        this.updateInterval = setInterval(() => {
            this.updateScanProgress();
        }, 100);
    }

    stopScanProgress() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    updateScanProgress() {
        if (!this.scanStartTime) return;
        
        const elapsed = Date.now() - this.scanStartTime;
        const remaining = Math.max(0, this.scanDuration - elapsed);
        const progress = Math.min(100, (elapsed / this.scanDuration) * 100);
        
        this.progressFill.style.width = `${progress}%`;
        this.scanTime.textContent = `Time remaining: ${Math.ceil(remaining / 1000)}s`;
        
        if (remaining <= 0) {
            this.stopScanProgress();
            this.updateScanStatus(false);
            this.addLog('Scan completed', 'info');
        }
    }

    async updateScanStatus() {
    try {
      const response = await fetch(apiUrl('/scan/status'));
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
      
            this.updateScanStatus(data.isScanning);
            this.deviceCount.textContent = data.devices ? data.devices.length : 0;
      
            if (data.devices && data.devices.length > 0) {
                this.updateDevicesList(data.devices);
      }
      
    } catch (error) {
            this.addLog(`Error updating scan status: ${error.message}`, 'error');
        }
    }

    updateDevicesList(devices) {
        if (!devices || devices.length === 0) {
            this.devicesList.innerHTML = '<p class="no-devices">No devices discovered yet. Start a scan to find Octo beds.</p>';
      return;
    }
    
        const devicesHtml = devices.map(device => `
            <div class="device-item">
      <div class="device-info">
                    <div class="device-name">${device.name || 'Unknown Device'}</div>
                    <div class="device-mac">${device.address || device.mac || 'No MAC address'}</div>
      </div>
                <div class="device-actions">
                    <button class="btn btn-success" onclick="octoInterface.addDevice('${device.address || device.mac}')">
                        ➕ Add Device
      </button>
                </div>
            </div>
        `).join('');
        
        this.devicesList.innerHTML = devicesHtml;
    }

    async addDevice(mac) {
        this.addLog(`Adding device with MAC: ${mac}`, 'info');
        // TODO: Send request to backend to add device for MQTT control
        // For now, just log the action
        this.addLog(`Device ${mac} would be added to configuration`, 'info');
    }

    addLog(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        logEntry.textContent = `[${timestamp}] ${message}`;
        
        this.logsContainer.appendChild(logEntry);
        
        // Keep only the last 50 log entries
        while (this.logsContainer.children.length > 50) {
            this.logsContainer.removeChild(this.logsContainer.firstChild);
        }
        
        // Auto-scroll to bottom
        this.logsContainer.scrollTop = this.logsContainer.scrollHeight;
    }

    async loadConfiguration() {
        try {
            // This would typically load configuration from the server
            // For now, use placeholder values
            this.proxyCount.textContent = 'Loading...';
            this.octoCount.textContent = 'Loading...';
            
            // Simulate loading configuration
            setTimeout(() => {
                this.proxyCount.textContent = '1 configured';
                this.octoCount.textContent = '0 devices';
            }, 1000);
      
    } catch (error) {
            this.addLog(`Error loading configuration: ${error.message}`, 'error');
        }
    }

    destroy() {
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
        }
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
    }
}

// Initialize the interface when the page loads
let octoInterface;

document.addEventListener('DOMContentLoaded', () => {
    octoInterface = new OctoMQTTInterface();
    octoInterface.loadConfiguration();
});

// Clean up when the page unloads
window.addEventListener('beforeunload', () => {
    if (octoInterface) {
        octoInterface.destroy();
    }
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