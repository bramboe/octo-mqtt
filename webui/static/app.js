let isScanning = false;
let scanTimeout = null;
let deviceStatuses = {};
let selectedDeviceId = null;

document.addEventListener('DOMContentLoaded', function() {
    // Initialize WebSocket connection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const basePath = window.location.pathname.replace(/\/$/, '');
    const wsUrl = `${protocol}//${window.location.host}${basePath}/api/ws`;
    console.log('Connecting to WebSocket at:', wsUrl);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('WebSocket connected');
        loadConfiguredDevices();
        loadBLEProxies();
        updateScanStatus();
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleWebSocketMessage(data);
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        showError('WebSocket connection error');
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected');
        setTimeout(() => {
            window.location.reload();
        }, 5000);
    };
});

function handleWebSocketMessage(data) {
    switch (data.type) {
        case 'scan_status':
            handleScanStatus(data);
            break;
        case 'device_status':
            handleDeviceStatus(data);
            break;
        case 'device_connected':
            handleDeviceConnected(data);
            break;
        case 'device_disconnected':
            handleDeviceDisconnected(data);
            break;
        case 'error':
            handleError(data);
            break;
        default:
            console.warn('Unknown message type:', data.type);
    }
}

function startScan() {
    if (isScanning) return;
    
    isScanning = true;
    updateScanStatus('Scanning for devices...', true);
    
    fetch('/api/scan/start', { method: 'POST' })
        .then(response => {
            if (!response.ok) throw new Error('Failed to start scan');
            scanTimeout = setTimeout(() => stopScan(), 30000);
        })
        .catch(error => {
            console.error('Error starting scan:', error);
            showError('Failed to start scan');
            stopScan();
        });
}

function stopScan() {
    if (!isScanning) return;
    
    fetch('/api/scan/stop', { method: 'POST' })
        .catch(error => console.error('Error stopping scan:', error))
        .finally(() => {
            isScanning = false;
            if (scanTimeout) {
                clearTimeout(scanTimeout);
                scanTimeout = null;
            }
            updateScanStatus('Scan completed', false);
        });
}

function updateScanStatus(message, scanning) {
    const statusElement = document.getElementById('discovery-status');
    const button = document.getElementById('scan-beds');
    
    if (statusElement) statusElement.textContent = message;
    if (button) {
        button.disabled = scanning;
        button.innerHTML = scanning 
            ? '<i class="material-icons">hourglass_empty</i> Scanning...'
            : '<i class="material-icons">bluetooth_searching</i> Scan for Beds';
    }
}

function handleScanStatus(data) {
    if (data.scanning !== isScanning) {
        isScanning = data.scanning;
        updateScanStatus(
            data.scanning ? 'Scanning for devices...' : 'Scan completed',
            data.scanning
        );
    }
    
    if (data.devices) {
        updateDeviceList(data.devices);
    }
}

function updateDeviceList(devices) {
    const container = document.getElementById('devices-container');
    const section = document.getElementById('discovered-devices');
    
    if (!container || !section) return;
    
    container.innerHTML = '';
    section.style.display = devices.length ? 'block' : 'none';
    
    devices.forEach(device => {
        const card = createDeviceCard(device);
        container.appendChild(card);
    });
}

function createDeviceCard(device) {
    const card = document.createElement('div');
    card.className = 'device-card';
    
    const statusClass = device.isConfigured ? 'configured' : 'available';
    const statusText = device.isConfigured ? 'Already Added' : 'Available';
    const buttonText = device.isConfigured ? 'Configured' : 'Add Device';
    const buttonDisabled = device.isConfigured ? 'disabled' : '';
    
    card.innerHTML = `
        <div class="device-info">
            <h4>${device.name || 'Octo Bed'}</h4>
            <p class="device-address">${device.address}</p>
            <p class="device-rssi">Signal: ${device.rssi} dBm</p>
            <span class="device-status ${statusClass}">${statusText}</span>
        </div>
        <button class="action-button" ${buttonDisabled} onclick="showPinDialog('${device.address}', '${device.name || 'Octo Bed'}')">
            ${buttonText}
        </button>
    `;
    
    return card;
}

function showPinDialog(address, name) {
    const dialog = document.getElementById('pin-dialog');
    if (!dialog) return;
    
    document.querySelector('.device-name-in-dialog').textContent = `${name} (${address})`;
    dialog.style.display = 'flex';
    
    const input = document.getElementById('pin-input');
    if (input) {
        input.value = '';
        input.focus();
        dialog.dataset.address = address;
        dialog.dataset.name = name;
    }
}

function hidePinDialog() {
    const dialog = document.getElementById('pin-dialog');
    if (dialog) dialog.style.display = 'none';
}

async function submitPin() {
    const dialog = document.getElementById('pin-dialog');
    const input = document.getElementById('pin-input');
    if (!dialog || !input) return;
    
    const pin = input.value;
    const address = dialog.dataset.address;
    const name = dialog.dataset.name;
    
    if (!/^\d{4}$/.test(pin)) {
        showError('PIN must be 4 digits');
        return;
    }
    
    try {
        showLoading('Adding device...');
        
        const response = await fetch('/api/device/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address, pin })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to add device');
        }
        
        hidePinDialog();
        await loadConfiguredDevices();
        showSuccess('Device added successfully');
        
    } catch (error) {
        console.error('Error adding device:', error);
        showError(error.message);
    } finally {
        hideLoading();
    }
}

async function loadConfiguredDevices() {
    try {
        const response = await fetch('/api/devices/configured');
        if (!response.ok) throw new Error('Failed to load configured devices');
        
        const data = await response.json();
        updateConfiguredDevicesList(data.devices || []);
        
    } catch (error) {
        console.error('Error loading configured devices:', error);
        showError('Failed to load configured devices');
    }
}

function updateConfiguredDevicesList(devices) {
    const loading = document.getElementById('configured-devices-loading');
    const list = document.getElementById('configured-devices-list');
    const empty = document.getElementById('configured-devices-empty');
    const container = document.getElementById('configured-devices-items');
    
    if (!loading || !list || !empty || !container) return;
    
    loading.style.display = 'none';
    
    if (devices.length === 0) {
        list.style.display = 'none';
        empty.style.display = 'block';
        return;
    }
    
    empty.style.display = 'none';
    list.style.display = 'block';
    container.innerHTML = '';
    
    devices.forEach(device => {
        const card = createConfiguredDeviceCard(device);
        container.appendChild(card);
    });
}

function createConfiguredDeviceCard(device) {
    const card = document.createElement('div');
    card.className = 'device-card configured';
    
    card.innerHTML = `
        <div class="device-info">
            <h4>${device.friendlyName || device.name}</h4>
            <p class="device-address">${device.name}</p>
            <p class="device-pin">PIN: ${device.pin}</p>
            <span class="device-status configured">Configured</span>
        </div>
        <button class="action-button" onclick="removeDevice('${device.name}', '${device.friendlyName || device.name}')">
            Remove
        </button>
    `;
    
    return card;
}

async function removeDevice(address, name) {
    if (!confirm(`Remove device "${name}"?`)) return;
    
    try {
        showLoading('Removing device...');
        
        const response = await fetch(`/api/device/remove/${encodeURIComponent(address)}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to remove device');
        }
        
        await loadConfiguredDevices();
        showSuccess('Device removed successfully');
        
    } catch (error) {
        console.error('Error removing device:', error);
        showError(error.message);
    } finally {
        hideLoading();
    }
}

function showLoading(message = 'Loading...') {
    const overlay = document.getElementById('loading-overlay');
    const messageEl = document.getElementById('loading-message');
    if (overlay && messageEl) {
        messageEl.textContent = message;
        overlay.style.display = 'flex';
    }
}

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'none';
}

function showError(message) {
    alert(`Error: ${message}`);
}

function showSuccess(message) {
    alert(message);
}

function showTab(tabName) {
    const tabs = document.querySelectorAll('.tab-content');
    const buttons = document.querySelectorAll('.tab-button');
    
    tabs.forEach(tab => tab.style.display = 'none');
    buttons.forEach(button => button.classList.remove('active'));
    
    const selectedTab = document.getElementById(tabName);
    if (selectedTab) selectedTab.style.display = 'block';
    
    buttons.forEach(button => {
        if (button.textContent.toLowerCase().includes(tabName.replace('-', ' '))) {
            button.classList.add('active');
        }
    });
    
    if (tabName === 'configuration') {
        loadBLEProxies();
    }
}

async function loadBLEProxies() {
    try {
        const response = await fetch('/api/config/ble-proxies');
        const config = await response.json();
        
        const configDiv = document.getElementById('ble-proxy-config');
        if (!configDiv) return;
        
        let html = '<h3>BLE Proxy Configuration</h3>';
        
        if (config.hasValidProxies) {
            html += '<div class="alert alert-success">✓ BLE proxy configuration is valid</div>';
        } else {
            html += '<div class="alert alert-warning">⚠️ BLE proxy configuration needs attention</div>';
        }
        
        html += `<p>Current proxies: ${config.count}</p>`;
        html += '<div class="proxy-list">';
        
        config.proxies.forEach((proxy, index) => {
            html += `
                <div class="proxy-item">
                    <h4>Proxy ${index + 1}</h4>
                    <div>
                        <label>Host/IP Address:</label>
                        <input type="text" id="proxy-host-${index}" value="${proxy.host || ''}" placeholder="192.168.1.100">
                    </div>
                    <div>
                        <label>Port:</label>
                        <input type="number" id="proxy-port-${index}" value="${proxy.port || 6052}" placeholder="6052">
                    </div>
                    <button onclick="removeProxy(${index})" class="action-button">Remove</button>
                </div>
            `;
        });
        
        html += '</div>';
        html += `
            <div style="margin: 20px 0;">
                <button onclick="addProxy()" class="action-button">Add Proxy</button>
                <button onclick="saveProxyConfig()" class="action-button">Save Configuration</button>
            </div>
        `;
        
        configDiv.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading BLE proxy config:', error);
        const configDiv = document.getElementById('ble-proxy-config');
        if (configDiv) {
            configDiv.innerHTML = '<div class="alert alert-danger">Error loading configuration</div>';
        }
    }
}

window.addProxy = function() {
    const proxyList = document.querySelector('.proxy-list');
    if (!proxyList) return;
    
    const index = proxyList.children.length;
    const proxyDiv = document.createElement('div');
    proxyDiv.className = 'proxy-item';
    
    proxyDiv.innerHTML = `
        <h4>Proxy ${index + 1}</h4>
        <div>
            <label>Host/IP Address:</label>
            <input type="text" id="proxy-host-${index}" placeholder="192.168.1.100">
        </div>
        <div>
            <label>Port:</label>
            <input type="number" id="proxy-port-${index}" value="6052" placeholder="6052">
        </div>
        <button onclick="removeProxy(${index})" class="action-button">Remove</button>
    `;
    
    proxyList.appendChild(proxyDiv);
};

window.removeProxy = function(index) {
    const proxyItem = document.querySelector(`#proxy-host-${index}`).closest('.proxy-item');
    if (!proxyItem) return;
    
    proxyItem.remove();
    
    // Re-index remaining proxies
    const proxyItems = document.querySelectorAll('.proxy-item');
    proxyItems.forEach((item, newIndex) => {
        const title = item.querySelector('h4');
        const hostInput = item.querySelector('input[type="text"]');
        const portInput = item.querySelector('input[type="number"]');
        const removeBtn = item.querySelector('button');
        
        if (title) title.textContent = `Proxy ${newIndex + 1}`;
        if (hostInput) hostInput.id = `proxy-host-${newIndex}`;
        if (portInput) portInput.id = `proxy-port-${newIndex}`;
        if (removeBtn) removeBtn.setAttribute('onclick', `removeProxy(${newIndex})`);
    });
};

window.saveProxyConfig = async function() {
    try {
        const proxyItems = document.querySelectorAll('.proxy-item');
        const proxies = [];
        
        proxyItems.forEach((item, index) => {
            const host = document.getElementById(`proxy-host-${index}`).value.trim();
            const port = parseInt(document.getElementById(`proxy-port-${index}`).value) || 6052;
            
            if (host) {
                proxies.push({ host, port });
            }
        });
        
        const response = await fetch('/api/config/ble-proxies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ proxies })
        });
        
        const result = await response.json();
        const resultDiv = document.getElementById('config-result');
        
        if (response.ok) {
            if (resultDiv) {
                resultDiv.innerHTML = `
                    <div class="alert alert-success">
                        ✓ Configuration saved successfully!
                        <br><small>Please restart the addon for changes to take effect.</small>
                    </div>
                `;
            }
            setTimeout(() => loadBLEProxies(), 1000);
        } else {
            if (resultDiv) {
                resultDiv.innerHTML = `
                    <div class="alert alert-danger">
                        ✗ Error: ${result.error}
                        ${result.details ? '<br><small>' + result.details + '</small>' : ''}
                    </div>
                `;
            }
        }
    } catch (error) {
        console.error('Error saving config:', error);
        const resultDiv = document.getElementById('config-result');
        if (resultDiv) {
            resultDiv.innerHTML = `
                <div class="alert alert-danger">
                    ✗ Error saving configuration: ${error.message}
                </div>
            `;
        }
    }
}; 