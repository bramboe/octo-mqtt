// RC2 Bed Control Panel - Enhanced JavaScript
document.addEventListener('DOMContentLoaded', () => {
  console.log('RC2 Bed Control Panel - Initializing...');

  // Global state
  let socket = null;
  let reconnectAttempts = 0;
  let selectedDeviceId = null;
  let deviceStatuses = {};
  let isScanning = false;
  let scanTimeout = null;
  let scanningResults = [];
  let scanInProgress = false;
  let currentDevices = [];

  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000;

  // Initialize the application
  init();

  function init() {
    setupTabSwitching();
    setupWebSocket();
    setupControlEventListeners();
    setupDiscoveryEventListeners();
    setupCalibrationEventListeners();
    loadDevices();
    loadConfiguredDevices();
  }

  // Tab switching functionality
  function setupTabSwitching() {
  const tabs = document.querySelectorAll('.tab-button');
  const sections = document.querySelectorAll('.tab-section');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      sections.forEach(s => s.classList.remove('active'));
      
      tab.classList.add('active');
      const sectionId = tab.id.replace('tab-', 'section-');
      document.getElementById(sectionId).classList.add('active');

        // Load data when switching to specific tabs
        if (tab.id === 'tab-discovery') {
          loadConfiguredDevices();
        } else if (tab.id === 'tab-config') {
          loadCalibrationDevices();
        }
      });
    });
  }

  // WebSocket connection management
  function setupWebSocket() {
    connectWebSocket();
  }
  
  function connectWebSocket() {
    console.log('Connecting to WebSocket...');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    try {
      socket = new WebSocket(wsUrl);
      
      socket.onopen = () => {
        console.log('WebSocket connected');
        updateWebSocketStatus('Connected');
        reconnectAttempts = 0;
        
        // Request initial status
        sendWebSocketMessage('status');
        sendWebSocketMessage('deviceInfo');
      };
      
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWebSocketMessage(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
      
      socket.onclose = () => {
        console.log('WebSocket disconnected');
        updateWebSocketStatus('Disconnected');
        
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          const delay = reconnectDelay * reconnectAttempts;
          console.log(`Reconnecting in ${delay}ms...`);
          setTimeout(connectWebSocket, delay);
        }
      };
      
      socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateWebSocketStatus('Error');
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      updateWebSocketStatus('Failed');
    }
  }
  
  function sendWebSocketMessage(type, payload = {}) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type, payload }));
    } else {
      console.warn('WebSocket not connected');
    }
  }

  function handleWebSocketMessage(data) {
    const { type, payload } = data;
    
    switch (type) {
      case 'deviceManagerStatus':
        updateDeviceManagerStatus(payload);
        break;
      case 'deviceConnected':
        handleDeviceConnected(payload);
        break;
      case 'deviceDisconnected':
        handleDeviceDisconnected(payload);
        break;
      case 'positionChanged':
        handlePositionChanged(payload);
        break;
      case 'lightChanged':
        handleLightChanged(payload);
        break;
      case 'deviceInfo':
        handleDeviceInfo(payload);
        break;
      case 'error':
        handleError(payload);
        break;
      default:
        console.log('Unknown WebSocket message type:', type);
    }
  }

  // Device management
  function updateDeviceManagerStatus(status) {
    deviceStatuses = status.devices || {};
    
    // Update system info
    document.getElementById('total-devices').textContent = status.totalDevices || 0;
    document.getElementById('connected-devices').textContent = status.connectedDevices || 0;
    
    // Update device selector
    updateDeviceSelector();
    
    // Update current device status if one is selected
    if (selectedDeviceId && deviceStatuses[selectedDeviceId]) {
      updateDeviceStatus(deviceStatuses[selectedDeviceId]);
    }
  }

  function updateDeviceSelector() {
    const selector = document.getElementById('device-selector');
    const loading = document.getElementById('device-selector-loading');
    const list = document.getElementById('device-selector-list');
    const noDevices = document.getElementById('no-devices-message');
    
    // Clear existing options except the first one
    while (selector.children.length > 1) {
      selector.removeChild(selector.lastChild);
    }
    
    const deviceIds = Object.keys(deviceStatuses);
    
    if (deviceIds.length === 0) {
      loading.style.display = 'none';
      list.style.display = 'none';
      noDevices.style.display = 'block';
      return;
    }
    
    // Add devices to selector
    deviceIds.forEach(deviceId => {
      const option = document.createElement('option');
      option.value = deviceId;
      option.textContent = `RC2 Bed (${deviceId.slice(-8).toUpperCase()})`;
      selector.appendChild(option);
    });
    
    loading.style.display = 'none';
    noDevices.style.display = 'none';
    list.style.display = 'block';
    
    // Auto-select first device if none selected
    if (!selectedDeviceId && deviceIds.length > 0) {
      selectDevice(deviceIds[0]);
      selector.value = deviceIds[0];
    }
  }

  function selectDevice(deviceId) {
    selectedDeviceId = deviceId;
    
    if (deviceStatuses[deviceId]) {
      updateDeviceStatus(deviceStatuses[deviceId]);
      showControlPanels();
      updateDeviceInfo(deviceId);
    } else {
      hideControlPanels();
    }
  }

  function showControlPanels() {
    document.getElementById('control-panels').style.display = 'block';
  }

  function hideControlPanels() {
    document.getElementById('control-panels').style.display = 'none';
  }

  function updateDeviceStatus(status) {
    // Update connection status
    const connectionStatus = document.getElementById('connection-status');
    const statusIndicator = document.querySelector('.device-status-indicator');
    const statusText = document.querySelector('.device-status-text');
    
    if (status.connected) {
      connectionStatus.textContent = 'Connected';
      connectionStatus.className = 'status-value connected';
      statusIndicator.style.color = '#4CAF50';
      statusText.textContent = 'Online';
    } else {
      connectionStatus.textContent = 'Offline';
      connectionStatus.className = 'status-value disconnected';
      statusIndicator.style.color = '#f44336';
      statusText.textContent = 'Offline';
    }
    
    // Update positions
    updatePositions(status.positions);
    
    // Update light state
    updateLightState(status.lightState);
    
    // Update calibration
    updateCalibrationDisplay(status.calibration);
    
    // Update last update time
    const lastUpdate = new Date(status.lastUpdate);
    document.getElementById('last-update-status').textContent = lastUpdate.toLocaleTimeString();
  }
  
  function updatePositions(positions) {
    // Head position
      document.getElementById('head-position-value').textContent = `${positions.head}%`;
      document.getElementById('head-position').value = positions.head;
    document.getElementById('head-position-status').textContent = `${positions.head}%`;
    
    // Feet position
      document.getElementById('feet-position-value').textContent = `${positions.feet}%`;
      document.getElementById('feet-position').value = positions.feet;
    document.getElementById('feet-position-status').textContent = `${positions.feet}%`;
  }
  
  function updateLightState(state) {
    document.getElementById('light-toggle').checked = state;
    document.getElementById('light-status').textContent = state ? 'ON' : 'OFF';
    document.getElementById('light-state-status').textContent = state ? 'ON' : 'OFF';
  }
  
  function updateCalibrationDisplay(calibration) {
    document.getElementById('head-calibration-status').textContent = `${calibration.head.toFixed(1)}s`;
    document.getElementById('feet-calibration-status').textContent = `${calibration.feet.toFixed(1)}s`;
  }

  function updateDeviceInfo(deviceId) {
    const deviceName = document.querySelector('.device-name');
    if (deviceName) {
      deviceName.textContent = `RC2 Bed (${deviceId.slice(-8).toUpperCase()})`;
    }
    
    const selectedInfo = document.getElementById('selected-device-info');
    if (selectedInfo) {
      selectedInfo.style.display = 'flex';
    }
  }

  // Control event listeners
  function setupControlEventListeners() {
    // Device selector
    document.getElementById('device-selector').addEventListener('change', (e) => {
      if (e.target.value) {
        selectDevice(e.target.value);
      } else {
        hideControlPanels();
        selectedDeviceId = null;
      }
    });

    // Preset buttons
    document.querySelectorAll('.preset-button').forEach(button => {
      button.addEventListener('click', () => {
        const preset = button.dataset.preset;
        if (selectedDeviceId) {
          applyPreset(preset);
        }
      });
    });

    // Position sliders
    document.getElementById('head-position').addEventListener('input', (e) => {
      document.getElementById('head-position-value').textContent = `${e.target.value}%`;
    });

    document.getElementById('feet-position').addEventListener('input', (e) => {
      document.getElementById('feet-position-value').textContent = `${e.target.value}%`;
    });

    document.getElementById('head-position').addEventListener('change', (e) => {
      if (selectedDeviceId) {
        const currentFeet = deviceStatuses[selectedDeviceId]?.positions?.feet || 0;
        setPosition(parseInt(e.target.value), currentFeet);
      }
    });

    document.getElementById('feet-position').addEventListener('change', (e) => {
      if (selectedDeviceId) {
        const currentHead = deviceStatuses[selectedDeviceId]?.positions?.head || 0;
        setPosition(currentHead, parseInt(e.target.value));
      }
    });

    // Control buttons
    document.getElementById('head-up').addEventListener('click', () => moveSection('head', 'up'));
    document.getElementById('head-down').addEventListener('click', () => moveSection('head', 'down'));
    document.getElementById('head-stop').addEventListener('click', () => stopDevice());
    
    document.getElementById('feet-up').addEventListener('click', () => moveSection('feet', 'up'));
    document.getElementById('feet-down').addEventListener('click', () => moveSection('feet', 'down'));
    document.getElementById('feet-stop').addEventListener('click', () => stopDevice());
    
    document.getElementById('both-up').addEventListener('click', () => moveBoth('up'));
    document.getElementById('both-down').addEventListener('click', () => moveBoth('down'));
    document.getElementById('stop-all').addEventListener('click', () => stopDevice());

    // Light toggle
    document.getElementById('light-toggle').addEventListener('change', (e) => {
      if (selectedDeviceId) {
        setLight(e.target.checked);
      }
    });
  }

  // Control functions
  async function applyPreset(preset) {
    if (!selectedDeviceId) return;
    
    try {
      const response = await fetch(`/api/rc2/devices/${selectedDeviceId}/preset/${preset}`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to apply preset: ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log('Preset applied:', result);
    } catch (error) {
      console.error('Error applying preset:', error);
      showError('Failed to apply preset');
    }
  }

  async function setPosition(head, feet) {
    if (!selectedDeviceId) return;
    
    try {
      const response = await fetch(`/api/rc2/devices/${selectedDeviceId}/position`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ head, feet })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to set position: ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log('Position set:', result);
    } catch (error) {
      console.error('Error setting position:', error);
      showError('Failed to set position');
    }
  }

  async function setLight(state) {
    if (!selectedDeviceId) return;
    
    try {
      const response = await fetch(`/api/rc2/devices/${selectedDeviceId}/light`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to set light: ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log('Light set:', result);
    } catch (error) {
      console.error('Error setting light:', error);
      showError('Failed to set light');
    }
  }

  async function stopDevice() {
    if (!selectedDeviceId) return;
    
    try {
      const response = await fetch(`/api/rc2/devices/${selectedDeviceId}/stop`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to stop device: ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log('Device stopped:', result);
    } catch (error) {
      console.error('Error stopping device:', error);
      showError('Failed to stop device');
    }
  }

  function moveSection(section, direction) {
    if (!selectedDeviceId || !deviceStatuses[selectedDeviceId]) return;
    
    const currentPositions = deviceStatuses[selectedDeviceId].positions;
    const increment = 10; // Move in 10% increments
    
    let newHead = currentPositions.head;
    let newFeet = currentPositions.feet;
    
    if (section === 'head') {
      newHead = direction === 'up' 
        ? Math.min(100, currentPositions.head + increment)
        : Math.max(0, currentPositions.head - increment);
    } else if (section === 'feet') {
      newFeet = direction === 'up'
        ? Math.min(100, currentPositions.feet + increment)
        : Math.max(0, currentPositions.feet - increment);
    }
    
    setPosition(newHead, newFeet);
  }

  function moveBoth(direction) {
    if (!selectedDeviceId || !deviceStatuses[selectedDeviceId]) return;
    
    const currentPositions = deviceStatuses[selectedDeviceId].positions;
    const increment = 10;
    
    const newHead = direction === 'up'
      ? Math.min(100, currentPositions.head + increment)
      : Math.max(0, currentPositions.head - increment);
      
    const newFeet = direction === 'up'
      ? Math.min(100, currentPositions.feet + increment)
      : Math.max(0, currentPositions.feet - increment);
    
    setPosition(newHead, newFeet);
  }

  // Discovery functionality
  function setupDiscoveryEventListeners() {
    document.getElementById('scan-beds').addEventListener('click', startScan);
    document.getElementById('pin-cancel').addEventListener('click', hidePinDialog);
    document.getElementById('pin-submit').addEventListener('click', submitPin);
  }

  async function startScan() {
    if (isScanning) return;
    
    try {
      console.log('🔍 [SCAN] Starting scan request...');
      showLoading('Scanning for RC2 beds...');
      
      const requestUrl = '/scan/start';
      console.log('🔍 [SCAN] Making request to:', requestUrl);
      
      const response = await fetch(requestUrl, { 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('🔍 [SCAN] Response status:', response.status);
      console.log('🔍 [SCAN] Response headers:', Array.from(response.headers.entries()));
      
      if (!response.ok) {
        console.log('🔍 [SCAN] Response not OK, attempting to parse error...');
        
        let errorData;
        let rawResponseText = '';
        
        try {
          // First try to get raw text to see what we're actually receiving
          rawResponseText = await response.text();
          console.log('🔍 [SCAN] Raw response text:', rawResponseText);
          
          // Try to parse as JSON
          errorData = JSON.parse(rawResponseText);
          console.log('🔍 [SCAN] Parsed error data:', errorData);
        } catch (jsonError) {
          console.error('🔍 [SCAN] Failed to parse JSON error response:', jsonError);
          console.log('🔍 [SCAN] Using raw text as error message');
          
          // If JSON parsing fails, use the raw text
          throw new Error(`Scan failed (HTTP ${response.status}): ${rawResponseText || response.statusText}`);
        }
        
        // Build comprehensive error message from parsed JSON
        let errorMessage = errorData.error || 'Scan failed';
        let detailedMessage = errorData.details || `HTTP ${response.status}: ${response.statusText}`;
        
        let fullErrorMessage = `Error: ${errorMessage}`;
        
        if (detailedMessage && detailedMessage !== errorMessage) {
          fullErrorMessage += `\n\nDetails: ${detailedMessage}`;
        }
        
        // Add troubleshooting tips if available
        if (errorData.troubleshooting && Array.isArray(errorData.troubleshooting)) {
          fullErrorMessage += '\n\n🔧 Troubleshooting Tips:\n• ' + errorData.troubleshooting.join('\n• ');
        }
        
        // Add configuration info if available
        if (errorData.currentConfiguration) {
          fullErrorMessage += '\n\n📋 Current Configuration:\n' + JSON.stringify(errorData.currentConfiguration, null, 2);
        }
        
        console.log('🔍 [SCAN] Throwing error with message:', fullErrorMessage);
        throw new Error(fullErrorMessage);
      }
      
      // Success case
      const result = await response.json();
      console.log('🔍 [SCAN] Scan started successfully:', result);
      
      isScanning = true;
      updateScanStatus(`Scanning for devices... (${result.proxiesConfigured || 0} proxies configured)`, true);
      
      // Poll for scan results
      scanTimeout = setInterval(checkScanStatus, 2000);
      
      // Auto-stop after 30 seconds
      setTimeout(() => {
        if (isScanning) {
          console.log('🔍 [SCAN] Auto-stopping scan after 30 seconds');
          stopScan();
        }
      }, 30000);
      
    } catch (error) {
      console.error('🔍 [SCAN] Error starting scan:', error);
      console.error('🔍 [SCAN] Error type:', typeof error);
      console.error('🔍 [SCAN] Error constructor:', error.constructor.name);
      console.error('🔍 [SCAN] Error message:', error.message);
      console.error('🔍 [SCAN] Error stack:', error.stack);
      
      showDetailedError('Failed to Start Scan', error.message);
    } finally {
      hideLoading();
    }
  }

  async function checkScanStatus() {
    try {
      const response = await fetch('/scan/status');
      if (!response.ok) return;
      
      const status = await response.json();
      
      if (!status.isScanning && isScanning) {
        stopScan();
      }
      
      updateScanResults(status.devices || []);
      
    } catch (error) {
      console.error('Error checking scan status:', error);
    }
  }

  function stopScan() {
    isScanning = false;
    if (scanTimeout) {
      clearInterval(scanTimeout);
      scanTimeout = null;
    }
    updateScanStatus('Scan completed', false);
  }

  function updateScanStatus(message, scanning) {
    document.getElementById('discovery-status').textContent = message;
    const button = document.getElementById('scan-beds');
    button.disabled = scanning;
    button.innerHTML = scanning 
      ? '<i class="material-icons">hourglass_empty</i> Scanning...'
      : '<i class="material-icons">bluetooth_searching</i> Scan for Beds';
  }

  function updateScanResults(devices) {
    const container = document.getElementById('devices-container');
    const section = document.getElementById('discovered-devices');
    
    container.innerHTML = '';
    
    if (devices.length === 0) {
      section.style.display = 'none';
      return;
    }
    
    section.style.display = 'block';
    
    devices.forEach(device => {
      const deviceCard = createDeviceCard(device);
      container.appendChild(deviceCard);
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
        <h4>${device.name || 'RC2 Bed'}</h4>
        <p class="device-address">${device.address}</p>
        <p class="device-rssi">Signal: ${device.rssi} dBm</p>
        <span class="device-status ${statusClass}">${statusText}</span>
      </div>
      <button class="add-device-button" ${buttonDisabled} data-address="${device.address}" data-name="${device.name || 'RC2 Bed'}">
        ${buttonText}
      </button>
    `;
    
    if (!device.isConfigured) {
      card.querySelector('.add-device-button').addEventListener('click', () => {
        showPinDialog(device.address, device.name || 'RC2 Bed');
      });
    }
    
    return card;
  }

  function showPinDialog(address, name) {
    document.querySelector('.device-name-in-dialog').textContent = `${name} (${address})`;
    document.getElementById('pin-dialog').style.display = 'flex';
    document.getElementById('pin-input').value = '';
    document.getElementById('pin-input').focus();
    
    // Store for later use
    document.getElementById('pin-dialog').dataset.address = address;
    document.getElementById('pin-dialog').dataset.name = name;
  }

  function hidePinDialog() {
    document.getElementById('pin-dialog').style.display = 'none';
  }

  async function submitPin() {
    const dialog = document.getElementById('pin-dialog');
    const pin = document.getElementById('pin-input').value;
    const address = dialog.dataset.address;
    const name = dialog.dataset.name;
    
    if (!/^\d{4}$/.test(pin)) {
      showError('PIN must be 4 digits');
      return;
    }
    
    try {
      showLoading('Adding device...');
      
      const response = await fetch('/device/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, pin })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to add device');
      }
      
      const result = await response.json();
      console.log('Device added:', result);
      
      hidePinDialog();
      loadDevices();
      loadConfiguredDevices();
      
      showSuccess('Device added successfully!');
      
    } catch (error) {
      console.error('Error adding device:', error);
      showError(error.message);
    } finally {
      hideLoading();
    }
  }

  // Calibration functionality
  function setupCalibrationEventListeners() {
    document.getElementById('calibration-device-select').addEventListener('change', (e) => {
      const controls = document.getElementById('calibration-controls');
      if (e.target.value) {
        controls.style.display = 'block';
        loadCalibrationValues(e.target.value);
      } else {
        controls.style.display = 'none';
      }
    });

    document.getElementById('update-head-calibration').addEventListener('click', updateHeadCalibration);
    document.getElementById('update-feet-calibration').addEventListener('click', updateFeetCalibration);
  }

  function loadCalibrationDevices() {
    const selector = document.getElementById('calibration-device-select');
    
    // Clear existing options except first
    while (selector.children.length > 1) {
      selector.removeChild(selector.lastChild);
    }
    
    Object.keys(deviceStatuses).forEach(deviceId => {
      const option = document.createElement('option');
      option.value = deviceId;
      option.textContent = `RC2 Bed (${deviceId.slice(-8).toUpperCase()})`;
      selector.appendChild(option);
    });
  }

  function loadCalibrationValues(deviceId) {
    if (deviceStatuses[deviceId]) {
      const calibration = deviceStatuses[deviceId].calibration;
      document.getElementById('head-calibration-input').value = calibration.head;
      document.getElementById('feet-calibration-input').value = calibration.feet;
    }
  }

  async function updateHeadCalibration() {
    const deviceId = document.getElementById('calibration-device-select').value;
    const headSeconds = parseFloat(document.getElementById('head-calibration-input').value);
    const feetSeconds = deviceStatuses[deviceId]?.calibration?.feet || 30;
    
    await updateCalibration(deviceId, headSeconds, feetSeconds);
  }

  async function updateFeetCalibration() {
    const deviceId = document.getElementById('calibration-device-select').value;
    const headSeconds = deviceStatuses[deviceId]?.calibration?.head || 30;
    const feetSeconds = parseFloat(document.getElementById('feet-calibration-input').value);
    
    await updateCalibration(deviceId, headSeconds, feetSeconds);
  }

  async function updateCalibration(deviceId, headSeconds, feetSeconds) {
    if (!deviceId) return;
    
    try {
      const response = await fetch(`/api/rc2/devices/${deviceId}/calibration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headSeconds, feetSeconds })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to update calibration: ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log('Calibration updated:', result);
      showSuccess('Calibration updated successfully!');
      
    } catch (error) {
      console.error('Error updating calibration:', error);
      showError('Failed to update calibration');
    }
  }

  // Utility functions
  async function loadDevices() {
    try {
      const response = await fetch('/api/rc2/devices');
      if (response.ok) {
        const data = await response.json();
        updateDeviceManagerStatus(data);
      }
    } catch (error) {
      console.error('Error loading devices:', error);
    }
  }

  async function loadConfiguredDevices() {
    try {
      const response = await fetch('/devices/configured');
      if (!response.ok) return;
      
      const data = await response.json();
      updateConfiguredDevicesList(data.devices || []);
      
    } catch (error) {
      console.error('Error loading configured devices:', error);
    }
  }

  function updateConfiguredDevicesList(devices) {
    const loading = document.getElementById('configured-devices-loading');
    const list = document.getElementById('configured-devices-list');
    const empty = document.getElementById('configured-devices-empty');
    const container = document.getElementById('configured-devices-items');
    
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
      <button class="remove-device-button" data-address="${device.name}" data-name="${device.friendlyName || device.name}">
        Remove
      </button>
    `;
    
    card.querySelector('.remove-device-button').addEventListener('click', () => {
      removeDevice(device.name, device.friendlyName || device.name);
    });
    
    return card;
  }

  async function removeDevice(address, name) {
    if (!confirm(`Remove device "${name}"?`)) return;
    
    try {
      showLoading('Removing device...');
      
      const response = await fetch(`/device/remove/${encodeURIComponent(address)}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to remove device');
      }
      
      loadDevices();
      loadConfiguredDevices();
      showSuccess('Device removed successfully!');
      
    } catch (error) {
      console.error('Error removing device:', error);
      showError(error.message);
    } finally {
      hideLoading();
    }
  }

  // Event handlers for WebSocket messages
  function handleDeviceConnected(payload) {
    console.log('Device connected:', payload);
    if (deviceStatuses[payload.deviceId]) {
      deviceStatuses[payload.deviceId].connected = true;
      if (selectedDeviceId === payload.deviceId) {
        updateDeviceStatus(deviceStatuses[payload.deviceId]);
      }
    }
  }

  function handleDeviceDisconnected(payload) {
    console.log('Device disconnected:', payload);
    if (deviceStatuses[payload.deviceId]) {
      deviceStatuses[payload.deviceId].connected = false;
      if (selectedDeviceId === payload.deviceId) {
        updateDeviceStatus(deviceStatuses[payload.deviceId]);
      }
    }
  }

  function handlePositionChanged(payload) {
    if (deviceStatuses[payload.deviceId]) {
      deviceStatuses[payload.deviceId].positions = payload.position;
      if (selectedDeviceId === payload.deviceId) {
        updatePositions(payload.position);
      }
    }
  }

  function handleLightChanged(payload) {
    if (deviceStatuses[payload.deviceId]) {
      deviceStatuses[payload.deviceId].lightState = payload.state;
      if (selectedDeviceId === payload.deviceId) {
        updateLightState(payload.state);
      }
    }
  }

  function handleDeviceInfo(payload) {
    console.log('Device info:', payload);
  }

  function handleError(payload) {
    console.error('Server error:', payload);
    showError(payload.message || 'An error occurred');
  }

  // UI utility functions
  function updateWebSocketStatus(status) {
    const element = document.getElementById('websocket-status');
    if (element) {
      element.textContent = status;
      element.className = `info-value ${status.toLowerCase()}`;
    }
  }

  function showLoading(message = 'Loading...') {
    const overlay = document.getElementById('loading-overlay');
    const messageEl = document.getElementById('loading-message');
    messageEl.textContent = message;
    overlay.style.display = 'flex';
  }

  function hideLoading() {
    document.getElementById('loading-overlay').style.display = 'none';
  }

  function showError(message) {
    // Simple alert for now - could be enhanced with toast notifications
      alert(`Error: ${message}`);
  }

  function showSuccess(message) {
    // Simple alert for now - could be enhanced with toast notifications
      alert(message);
  }

  function showDetailedError(title, message) {
    // Create a modal dialog for better error display
    const existingModal = document.getElementById('error-modal');
    if (existingModal) {
      existingModal.remove();
    }

    const modal = document.createElement('div');
    modal.id = 'error-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 1000;
    `;

    modal.innerHTML = `
      <div style="
        background: white;
        padding: 20px;
        border-radius: 8px;
        max-width: 500px;
        width: 90%;
        max-height: 80%;
        overflow-y: auto;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <h3 style="margin: 0; color: #dc3545;">${title}</h3>
          <button onclick="closeErrorModal()" style="
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: #666;
          ">&times;</button>
        </div>
        <div style="
          white-space: pre-wrap;
          margin-bottom: 20px;
          padding: 15px;
          background: #f8f9fa;
          border-radius: 4px;
          border-left: 4px solid #dc3545;
          font-family: monospace;
          font-size: 14px;
          line-height: 1.4;
        ">${message}</div>
        <div style="text-align: right;">
          <button onclick="closeErrorModal()" style="
            background: #007bff;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
          ">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    console.error(title, message);
  }

  // Add global function to close error modal
  window.closeErrorModal = function() {
    const modal = document.getElementById('error-modal');
    if (modal) {
      modal.remove();
    }
  };

  // Configuration Management Functions
  async function loadBLEProxyConfig() {
    try {
      const response = await fetch('/api/config/ble-proxies');
      const config = await response.json();
      
      const configDiv = document.getElementById('ble-proxy-config');
      if (!configDiv) return;

      let html = '<h3>BLE Proxy Configuration</h3>';
      
      if (config.hasValidProxies) {
        html += '<div class="alert alert-success">✓ BLE proxy configuration is valid</div>';
      } else {
        html += '<div class="alert alert-warning">⚠️  BLE proxy configuration needs attention</div>';
      }

      html += `<p>Current proxies: ${config.count}</p>`;
      
      html += '<div class="proxy-list">';
      config.proxies.forEach((proxy, index) => {
        html += `
          <div class="proxy-item" style="margin: 10px 0; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
            <h4>Proxy ${index + 1}</h4>
            <div style="margin: 5px 0;">
              <label>Host/IP Address:</label>
              <input type="text" id="proxy-host-${index}" value="${proxy.host || ''}" placeholder="192.168.1.100" style="margin-left: 10px; padding: 5px;">
            </div>
            <div style="margin: 5px 0;">
              <label>Port:</label>
              <input type="number" id="proxy-port-${index}" value="${proxy.port || 6052}" placeholder="6052" style="margin-left: 10px; padding: 5px;">
            </div>
            <button onclick="removeProxy(${index})" style="background: #dc3545; color: white; border: none; padding: 5px 10px; border-radius: 3px; margin-top: 5px;">Remove</button>
          </div>
        `;
      });
      html += '</div>';
      
      html += `
        <div style="margin: 20px 0;">
          <button onclick="addProxy()" style="background: #28a745; color: white; border: none; padding: 10px 15px; border-radius: 5px; margin-right: 10px;">Add Proxy</button>
          <button onclick="saveProxyConfig()" style="background: #007bff; color: white; border: none; padding: 10px 15px; border-radius: 5px;">Save Configuration</button>
        </div>
        <div style="margin: 10px 0; padding: 10px; background: #f8f9fa; border-radius: 5px;">
          <small>
            <strong>How to find your ESPHome device IP:</strong><br>
            1. Check your router's admin panel for connected devices<br>
            2. Look for a device named similar to your ESPHome device name<br>
            3. The IP address is usually in format 192.168.x.x or 10.x.x.x
          </small>
        </div>
      `;
      
      configDiv.innerHTML = html;
      
    } catch (error) {
      console.error('Error loading BLE proxy config:', error);
      document.getElementById('ble-proxy-config').innerHTML = '<div class="alert alert-danger">Error loading configuration</div>';
    }
  }

  window.addProxy = function() {
    const configDiv = document.getElementById('ble-proxy-config');
    const proxyList = configDiv.querySelector('.proxy-list');
    const index = proxyList.children.length;
    
    const proxyDiv = document.createElement('div');
    proxyDiv.className = 'proxy-item';
    proxyDiv.style.cssText = 'margin: 10px 0; padding: 10px; border: 1px solid #ddd; border-radius: 5px;';
    proxyDiv.innerHTML = `
      <h4>Proxy ${index + 1}</h4>
      <div style="margin: 5px 0;">
        <label>Host/IP Address:</label>
        <input type="text" id="proxy-host-${index}" value="" placeholder="192.168.1.100" style="margin-left: 10px; padding: 5px;">
      </div>
      <div style="margin: 5px 0;">
        <label>Port:</label>
        <input type="number" id="proxy-port-${index}" value="6052" placeholder="6052" style="margin-left: 10px; padding: 5px;">
      </div>
      <button onclick="removeProxy(${index})" style="background: #dc3545; color: white; border: none; padding: 5px 10px; border-radius: 3px; margin-top: 5px;">Remove</button>
    `;
    
    proxyList.appendChild(proxyDiv);
  };

  window.removeProxy = function(index) {
    const proxyItem = document.querySelector(`#proxy-host-${index}`).closest('.proxy-item');
    proxyItem.remove();
    // Re-index remaining proxies
    const proxyItems = document.querySelectorAll('.proxy-item');
    proxyItems.forEach((item, newIndex) => {
      item.querySelector('h4').textContent = `Proxy ${newIndex + 1}`;
      const hostInput = item.querySelector('input[type="text"]');
      const portInput = item.querySelector('input[type="number"]');
      const removeBtn = item.querySelector('button');
      
      hostInput.id = `proxy-host-${newIndex}`;
      portInput.id = `proxy-port-${newIndex}`;
      removeBtn.setAttribute('onclick', `removeProxy(${newIndex})`);
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
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ proxies })
      });

      const result = await response.json();
      
      if (response.ok) {
        document.getElementById('config-result').innerHTML = `
          <div class="alert alert-success">
            ✓ Configuration saved successfully! 
            <br><small>Please restart the addon for changes to take effect.</small>
          </div>
        `;
        // Reload the configuration to reflect changes
        setTimeout(() => loadBLEProxyConfig(), 1000);
      } else {
        document.getElementById('config-result').innerHTML = `
          <div class="alert alert-danger">
            ✗ Error: ${result.error}
            ${result.details ? '<br><small>' + result.details + '</small>' : ''}
          </div>
        `;
      }
    } catch (error) {
      console.error('Error saving config:', error);
      document.getElementById('config-result').innerHTML = `
        <div class="alert alert-danger">
          ✗ Error saving configuration: ${error.message}
        </div>
      `;
    }
  };

  console.log('RC2 Bed Control Panel - Initialized successfully');

  // Tab switching functionality
  window.showTab = function(tabName) {
    // Hide all tab contents
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => {
      tab.style.display = 'none';
    });

    // Remove active class from all tab buttons
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
      button.classList.remove('active');
    });

    // Show selected tab and mark button as active
    const selectedTab = document.getElementById(tabName);
    if (selectedTab) {
      selectedTab.style.display = 'block';
    }

    // Find and activate the correct button
    tabButtons.forEach(button => {
      if (button.textContent.toLowerCase().includes(tabName.replace('-', ' '))) {
        button.classList.add('active');
      }
    });

    // Load configuration when configuration tab is selected
    if (tabName === 'configuration') {
      loadBLEProxyConfig();
    }

    console.log('Switched to tab:', tabName);
  };

  // Initialize tabs - show device-scan by default
  document.addEventListener('DOMContentLoaded', function() {
    showTab('device-scan');
  });

  // Add debug function to check which server is running
  async function checkServerVersion() {
    try {
      const response = await fetch('/debug/server-info');
      const serverInfo = await response.json();
      console.log('🔍 Server Version Debug:', serverInfo);
      
      // Show debug info in UI
      const debugElement = document.getElementById('debug-info');
      if (debugElement) {
        debugElement.innerHTML = `
          <strong>Server:</strong> ${serverInfo.serverType}<br>
          <strong>Time:</strong> ${serverInfo.timestamp}<br>
          <strong>Message:</strong> ${serverInfo.message}
        `;
        debugElement.style.display = 'block';
      }
    } catch (error) {
      console.log('🔍 Debug endpoint not available (probably old version running):', error);
      
      // Show old version warning
      const debugElement = document.getElementById('debug-info');
      if (debugElement) {
        debugElement.innerHTML = `
          <strong style="color: red;">WARNING:</strong> Old TypeScript version is running!<br>
          <strong>Issue:</strong> Multiple server instances or build cache problem
        `;
        debugElement.style.display = 'block';
      }
    }
  }

  // Run debug check when page loads
  document.addEventListener('DOMContentLoaded', function() {
    loadConfiguredDevices();
    loadBLEProxies();
    updateScanStatus();
    
    // Check server version
    setTimeout(checkServerVersion, 1000);
  });
}); 