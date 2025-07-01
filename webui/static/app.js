document.addEventListener('DOMContentLoaded', () => {
  // Tab switching functionality
  const tabs = document.querySelectorAll('.tab-button');
  const sections = document.querySelectorAll('.tab-section');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active class from all tabs and sections
      tabs.forEach(t => t.classList.remove('active'));
      sections.forEach(s => s.classList.remove('active'));
      
      // Add active class to clicked tab and corresponding section
      tab.classList.add('active');
      const sectionId = tab.id.replace('tab-', 'section-');
      document.getElementById(sectionId).classList.add('active');
    });
  });
  
  // Initialize the WebSocket connection to the backend
  let socket = null;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000;
  
  function connectWebSocket() {
    console.log('Attempting to connect WebSocket...');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws`;
    console.log('WebSocket URL:', wsUrl);
    
    try {
      socket = new WebSocket(wsUrl);
      
      socket.onopen = () => {
        console.log('WebSocket connected successfully');
        updateConnectionStatus('connected');
        reconnectAttempts = 0;
        
        // Request initial status
        sendMessage('getStatus');
      };
      
      socket.onmessage = (event) => {
        console.log('Received WebSocket message:', event.data);
        try {
          const data = JSON.parse(event.data);
          console.log('Parsed message:', data);
          handleMessage(data);
        } catch (error) {
          console.error('Error processing message:', error);
        }
      };
      
      socket.onclose = () => {
        console.log('WebSocket connection closed');
        updateConnectionStatus('disconnected');
        
        // Try to reconnect with progressive backoff
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          const delay = reconnectDelay * reconnectAttempts;
          console.log(`Reconnecting in ${delay}ms... (Attempt ${reconnectAttempts}/${maxReconnectAttempts})`);
          setTimeout(connectWebSocket, delay);
        } else {
          console.log('Max reconnect attempts reached. Please refresh the page.');
        }
      };
      
      socket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      updateConnectionStatus('disconnected');
    }
  }
  
  function sendMessage(type, payload = {}) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      const message = { type, ...payload };
      socket.send(JSON.stringify(message));
    } else {
      console.warn('Cannot send message - WebSocket is not connected');
    }
  }
  
  function handleMessage(data) {
    switch (data.type) {
      case 'status':
        updateStatus(data.payload);
        break;
      case 'deviceInfo':
        updateDeviceInfo(data.payload);
        break;
      case 'addonInfo':
        updateAddonInfo(data.payload);
        break;
      case 'positionUpdate':
        updatePositions(data.payload);
        break;
      case 'lightState':
        updateLightState(data.payload.state);
        break;
      case 'calibrationValues':
        updateCalibrationValues(data.payload);
        break;
      case 'error':
        handleError(data.payload.message);
        break;
      case 'scanStatus':
        handleScanStatus(data.payload);
        break;
      case 'deviceDiscovered':
        handleDeviceDiscovered(data.payload);
        break;
      case 'addDeviceStatus':
        handleAddDeviceStatus(data.payload);
        break;
      case 'removeDeviceStatus':
        handleRemoveDeviceStatus(data.payload);
        break;
      case 'configuredDevices':
        handleConfiguredDevices(data.payload);
        break;
      default:
        console.log('Unknown message type:', data.type);
    }
  }
  
  function updateStatus(status) {
    updateConnectionStatus(status.connected ? 'connected' : 'disconnected');
    updatePositions(status.positions);
    updateLightState(status.lightState);
    updateCalibrationValues(status.calibration);
  }
  
  function updateConnectionStatus(status) {
    const connectionStatus = document.getElementById('connection-status');
    connectionStatus.textContent = status === 'connected' ? 'Connected' : 'Disconnected';
    connectionStatus.className = `status-value ${status}`;
  }
  
  function updatePositions(positions) {
    if (positions.head !== undefined) {
      document.getElementById('head-position-status').textContent = `${positions.head}%`;
      document.getElementById('head-position-value').textContent = `${positions.head}%`;
      document.getElementById('head-position').value = positions.head;
    }
    
    if (positions.feet !== undefined) {
      document.getElementById('feet-position-status').textContent = `${positions.feet}%`;
      document.getElementById('feet-position-value').textContent = `${positions.feet}%`;
      document.getElementById('feet-position').value = positions.feet;
    }
  }
  
  function updateLightState(state) {
    document.getElementById('light-toggle').checked = state;
    document.getElementById('light-status').textContent = state ? 'ON' : 'OFF';
  }
  
  function updateCalibrationValues(calibration) {
    document.getElementById('head-calibration-status').textContent = `${calibration.head.toFixed(1)}s`;
    document.getElementById('feet-calibration-status').textContent = `${calibration.feet.toFixed(1)}s`;
    document.getElementById('head-travel-time').textContent = `${calibration.head.toFixed(1)}s`;
    document.getElementById('feet-travel-time').textContent = `${calibration.feet.toFixed(1)}s`;
  }
  
  function updateDeviceInfo(info) {
    document.getElementById('device-name').textContent = info.name;
    document.getElementById('device-address').textContent = info.address;
    document.getElementById('firmware-version').textContent = info.firmwareVersion || 'Unknown';
    document.getElementById('proxy-info').textContent = info.proxy;
    
    // If there are multiple devices configured, show that information
    if (info.totalConfiguredDevices && info.totalConfiguredDevices > 1) {
      const deviceNameElement = document.getElementById('device-name');
      deviceNameElement.textContent = `${info.name} (1 of ${info.totalConfiguredDevices})`;
      deviceNameElement.title = `${info.totalConfiguredDevices} devices configured. Showing primary device.`;
    }
  }
  
  function updateAddonInfo(info) {
    document.getElementById('addon-version').textContent = info.version;
    document.getElementById('addon-status').textContent = info.status;
  }
  
  function handleError(message) {
    console.error('Error from server:', message);
    // Here you could add a toast notification or alert to inform the user
  }
  
  // Set up control button event listeners
  document.getElementById('preset-flat').addEventListener('click', () => {
    sendMessage('preset', { preset: 'flat' });
  });
  
  document.getElementById('preset-zerog').addEventListener('click', () => {
    sendMessage('preset', { preset: 'zerog' });
  });
  
  document.getElementById('preset-tv').addEventListener('click', () => {
    sendMessage('preset', { preset: 'tv' });
  });
  
  document.getElementById('preset-reading').addEventListener('click', () => {
    sendMessage('preset', { preset: 'reading' });
  });
  
  document.getElementById('head-up').addEventListener('click', () => {
    sendMessage('motorControl', { motor: 'head', direction: 'up' });
  });
  
  document.getElementById('head-stop').addEventListener('click', () => {
    sendMessage('motorControl', { motor: 'head', direction: 'stop' });
  });
  
  document.getElementById('head-down').addEventListener('click', () => {
    sendMessage('motorControl', { motor: 'head', direction: 'down' });
  });
  
  document.getElementById('feet-up').addEventListener('click', () => {
    sendMessage('motorControl', { motor: 'feet', direction: 'up' });
  });
  
  document.getElementById('feet-stop').addEventListener('click', () => {
    sendMessage('motorControl', { motor: 'feet', direction: 'stop' });
  });
  
  document.getElementById('feet-down').addEventListener('click', () => {
    sendMessage('motorControl', { motor: 'feet', direction: 'down' });
  });
  
  document.getElementById('both-up').addEventListener('click', () => {
    sendMessage('motorControl', { motor: 'both', direction: 'up' });
  });
  
  document.getElementById('both-stop').addEventListener('click', () => {
    sendMessage('motorControl', { motor: 'both', direction: 'stop' });
  });
  
  document.getElementById('both-down').addEventListener('click', () => {
    sendMessage('motorControl', { motor: 'both', direction: 'down' });
  });
  
  // Calibration buttons
  document.getElementById('calibrate-head').addEventListener('click', () => {
    sendMessage('calibrate', { motor: 'head' });
  });
  
  document.getElementById('calibrate-feet').addEventListener('click', () => {
    sendMessage('calibrate', { motor: 'feet' });
  });
  
  // Position sliders
  const headPosition = document.getElementById('head-position');
  headPosition.addEventListener('input', () => {
    document.getElementById('head-position-value').textContent = `${headPosition.value}%`;
  });
  
  headPosition.addEventListener('change', () => {
    sendMessage('setPosition', { motor: 'head', position: parseInt(headPosition.value) });
  });
  
  const feetPosition = document.getElementById('feet-position');
  feetPosition.addEventListener('input', () => {
    document.getElementById('feet-position-value').textContent = `${feetPosition.value}%`;
  });
  
  feetPosition.addEventListener('change', () => {
    sendMessage('setPosition', { motor: 'feet', position: parseInt(feetPosition.value) });
  });
  
  // Light toggle
  document.getElementById('light-toggle').addEventListener('change', (event) => {
    sendMessage('light', { state: event.target.checked });
  });
  
  // Scan button and status elements
  const scanButton = document.getElementById('scan-beds');
  const scanStatus = document.getElementById('discovery-status');
  const deviceList = document.getElementById('devices-container');
  let scanCheckInterval = null;

  // Function to update scan status
  async function checkScanStatus() {
    try {
      console.log('Checking scan status...');
      const baseUrl = window.location.pathname.endsWith('/') 
        ? window.location.pathname.slice(0, -1) 
        : window.location.pathname;

      const response = await fetch(`${baseUrl}/scan/status`);
      console.log('Status response:', response.status);
      const data = await response.json();
      console.log('Status data:', data);
      
      if (data.isScanning) {
        const timeRemaining = Math.round(data.scanTimeRemaining / 1000);
        console.log('Scan in progress, time remaining:', timeRemaining);
        scanStatus.textContent = `Scanning... ${timeRemaining}s remaining. Found ${data.discoveredDevices} device(s).`;
        
        // Update device list if we have devices
        if (data.devices && data.devices.length > 0) {
          const discoveredDevices = document.getElementById('discovered-devices');
          discoveredDevices.style.display = 'block';
          
          deviceList.innerHTML = ''; // Clear current list
          data.devices.forEach(device => {
            const deviceElement = document.createElement('div');
            deviceElement.className = 'device-item';
            
            // Improve device name display - if it's "Unknown Device" and MAC suggests RC2, show RC2
            const displayName = device.name === 'Unknown Device' && 
                              (device.address?.toLowerCase().startsWith('c3:e7:63') || 
                               device.address?.toLowerCase().startsWith('f6:21:dd')) 
                              ? 'RC2' : (device.name || 'Unknown Device');
            
            // Determine the status and button text based on configuration
            const isConfigured = device.isConfigured;
            const statusText = isConfigured ? 'Already Added' : 'Available';
            const statusClass = isConfigured ? 'configured' : 'available';
            const buttonText = isConfigured ? 'Configured' : 'Add';
            const buttonClass = isConfigured ? 'configured-button' : 'action-button';
            const buttonDisabled = isConfigured ? 'disabled' : '';
            const configuredNameText = isConfigured && device.configuredName ? `<div class="device-configured-name">Configured as: ${device.configuredName}</div>` : '';
            
            deviceElement.innerHTML = `
              <div class="device-info">
                <div class="device-name">${displayName}</div>
                <div class="device-mac">MAC: ${device.address}</div>
                <div class="device-rssi">Signal: ${device.rssi || 'N/A'} dBm</div>
                <div class="device-status ${statusClass}">Status: ${statusText}</div>
                ${configuredNameText}
              </div>
              <button class="${buttonClass}" ${buttonDisabled} onclick="${isConfigured ? '' : `addDevice('${device.address}')`}">
                <i class="material-icons">${isConfigured ? 'check' : 'add'}</i> ${buttonText}
              </button>
            `;
            deviceList.appendChild(deviceElement);
          });
        }
      } else {
        console.log('Scan completed or stopped');
        if (data.discoveredDevices > 0) {
          scanStatus.textContent = `Scan completed. Found ${data.discoveredDevices} device(s).`;
          
          // Make sure device list is visible and populated with final results
          if (data.devices && data.devices.length > 0) {
            const discoveredDevices = document.getElementById('discovered-devices');
            discoveredDevices.style.display = 'block';
            
            deviceList.innerHTML = ''; // Clear current list
            data.devices.forEach(device => {
              const deviceElement = document.createElement('div');
              deviceElement.className = 'device-item';
              
              // Improve device name display - if it's "Unknown Device" and MAC suggests RC2, show RC2
              const displayName = device.name === 'Unknown Device' && 
                                (device.address?.toLowerCase().startsWith('c3:e7:63') || 
                                 device.address?.toLowerCase().startsWith('f6:21:dd')) 
                                ? 'RC2' : (device.name || 'Unknown Device');
              
              // Determine the status and button text based on configuration
              const isConfigured = device.isConfigured;
              const statusText = isConfigured ? 'Already Added' : 'Available';
              const statusClass = isConfigured ? 'configured' : 'available';
              const buttonText = isConfigured ? 'Configured' : 'Add';
              const buttonClass = isConfigured ? 'configured-button' : 'action-button';
              const buttonDisabled = isConfigured ? 'disabled' : '';
              const configuredNameText = isConfigured && device.configuredName ? `<div class="device-configured-name">Configured as: ${device.configuredName}</div>` : '';
              
              deviceElement.innerHTML = `
                <div class="device-info">
                  <div class="device-name">${displayName}</div>
                  <div class="device-mac">MAC: ${device.address}</div>
                  <div class="device-rssi">Signal: ${device.rssi || 'N/A'} dBm</div>
                  <div class="device-status ${statusClass}">Status: ${statusText}</div>
                  ${configuredNameText}
                </div>
                <button class="${buttonClass}" ${buttonDisabled} onclick="${isConfigured ? '' : `addDevice('${device.address}')`}">
                  <i class="material-icons">${isConfigured ? 'check' : 'add'}</i> ${buttonText}
                </button>
              `;
              deviceList.appendChild(deviceElement);
            });
          }
        } else {
          scanStatus.textContent = 'Scan completed. No devices found.';
        }
        scanButton.disabled = false;
        if (scanCheckInterval) {
          clearInterval(scanCheckInterval);
          scanCheckInterval = null;
        }
      }
    } catch (error) {
      console.error('Error checking scan status:', error);
      scanStatus.textContent = `Error: ${error.message || 'Failed to check scan status'}`;
      scanButton.disabled = false;
      if (scanCheckInterval) {
        clearInterval(scanCheckInterval);
        scanCheckInterval = null;
      }
    }
  }

  // Function to add a device
  window.addDevice = async function(address) {
    try {
      // Show the PIN dialog
      const pinDialog = document.getElementById('pin-dialog');
      const pinInput = document.getElementById('pin-input');
      const pinSubmit = document.getElementById('pin-submit');
      const pinCancel = document.getElementById('pin-cancel');

      // Clear previous input
      pinInput.value = '';
      
      // Show the dialog
      pinDialog.style.display = 'flex';

      // Return a promise that resolves when the user submits or cancels
      return new Promise((resolve, reject) => {
        const handleSubmit = async () => {
          const pin = pinInput.value;
          
          if (!/^\d{4}$/.test(pin)) {
            alert('Please enter a valid 4-digit PIN');
            return;
          }

          pinDialog.style.display = 'none';
          pinSubmit.removeEventListener('click', handleSubmit);
          pinCancel.removeEventListener('click', handleCancel);

          try {
            const baseUrl = window.location.pathname.endsWith('/') 
              ? window.location.pathname.slice(0, -1) 
              : window.location.pathname;

            const response = await fetch(`${baseUrl}/device/add`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                address,
                pin
              })
            });

            const data = await response.json();
            
            if (response.ok) {
              alert('Device added successfully!');
              
              // Refresh the configured devices list to show the new device
              await loadConfiguredDevices();
              
              // Instead of clearing scan results, refresh the scan status to update device states
              // This allows users to add multiple devices from the same scan
              await checkScanStatus();
              
              scanStatus.textContent = 'Device added! You can continue adding more devices from this scan.';
              
              resolve();
            } else {
              alert(`Failed to add device: ${data.error}`);
              reject(new Error(data.error));
            }
          } catch (error) {
            console.error('Error adding device:', error);
            alert(`Error adding device: ${error.message}`);
            reject(error);
          }
        };

        const handleCancel = () => {
          pinDialog.style.display = 'none';
          pinSubmit.removeEventListener('click', handleSubmit);
          pinCancel.removeEventListener('click', handleCancel);
          resolve();
        };

        pinSubmit.addEventListener('click', handleSubmit);
        pinCancel.addEventListener('click', handleCancel);
      });
    } catch (error) {
      console.error('Error in addDevice:', error);
      alert(`Error: ${error.message}`);
    }
  };

  // Function to start scanning
  function startScan() {
    console.log('Starting scan...');
    scanButton.disabled = true;
    deviceList.innerHTML = ''; // Clear previous results
    scanStatus.textContent = 'Starting scan...';

    // Send WebSocket message to start scan
    sendMessage('scanBeds');
  }

  // Function to stop scanning
  function stopScan() {
    console.log('Stopping scan...');
    sendMessage('stopScan');
  }

  // Add click handler to scan button
  if (scanButton) {
    scanButton.addEventListener('click', startScan);
  } else {
    console.error('Scan button not found');
  }

  // Add keyboard shortcut to stop scan (Escape key)
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && scanCheckInterval) {
      stopScan();
    }
  });
  
  // BLE Device Discovery Functionality
  const discoveryStatus = document.getElementById('discovery-status');
  const discoveredDevices = document.getElementById('discovered-devices');
  const devicesContainer = document.getElementById('devices-container');
  const pinDialog = document.getElementById('pin-dialog');
  const pinInput = document.getElementById('pin-input');
  const pinSubmit = document.getElementById('pin-submit');
  const pinCancel = document.getElementById('pin-cancel');
  
  let selectedDevice = null;
  
  // Handle server messages for device discovery
  function handleScanStatus(data) {
    const { scanning, message, deviceCount } = data;
    
    discoveryStatus.textContent = message;
    
    if (!scanning) {
      // Enable scan button
      scanButton.disabled = false;
      scanButton.classList.remove('scanning');
      
      // If devices were found, show the list
      if (deviceCount > 0) {
        discoveredDevices.style.display = 'block';
      }
    } else {
      // Disable scan button during scanning
      scanButton.disabled = true;
      scanButton.classList.add('scanning');
    }
  }
  
  function handleDeviceDiscovered(device) {
    const { name, address, rssi, service_uuids } = device;
    
    // Create device element
    const deviceEl = document.createElement('div');
    deviceEl.className = 'device-item';
    
    const deviceInfo = document.createElement('div');
    deviceInfo.className = 'device-info';
    
    const deviceName = document.createElement('div');
    deviceName.className = 'device-name';
    deviceName.textContent = name || 'Unknown Device';
    
    const deviceMac = document.createElement('div');
    deviceMac.className = 'device-mac';
    deviceMac.textContent = `MAC: ${address}`;
    
    const deviceDetails = document.createElement('div');
    deviceDetails.className = 'device-details';
    deviceDetails.textContent = `RSSI: ${rssi}dBm`;
    
    deviceInfo.appendChild(deviceName);
    deviceInfo.appendChild(deviceMac);
    deviceInfo.appendChild(deviceDetails);
    
    const addButton = document.createElement('button');
    addButton.className = 'action-button';
    addButton.innerHTML = '<i class="material-icons">add</i> Add';
    addButton.addEventListener('click', () => {
      // Store selected device and show PIN dialog
      selectedDevice = { name: name || 'Unknown Device', mac: address };
      pinDialog.style.display = 'flex';
    });
    
    deviceEl.appendChild(deviceInfo);
    deviceEl.appendChild(addButton);
    
    devicesContainer.appendChild(deviceEl);
  }
  
  function handleAddDeviceStatus(data) {
    if (data.success) {
      alert(data.message);
      // Refresh the configured devices list
      loadConfiguredDevices();
    } else {
      alert(`Failed to add device: ${data.message}`);
    }
  }
  
  function handleRemoveDeviceStatus(data) {
    if (data.success) {
      alert(data.message);
      // Refresh the configured devices list
      loadConfiguredDevices();
    } else {
      alert(`Failed to remove device: ${data.message}`);
    }
  }
  
  function handleConfiguredDevices(data) {
    const loadingElement = document.getElementById('configured-devices-loading');
    const listElement = document.getElementById('configured-devices-list');
    const emptyElement = document.getElementById('configured-devices-empty');
    const itemsContainer = document.getElementById('configured-devices-items');

    // Hide loading indicator
    loadingElement.style.display = 'none';

    if (data.devices && data.devices.length > 0) {
      // Show the list and populate it
      listElement.style.display = 'block';
      emptyElement.style.display = 'none';

      itemsContainer.innerHTML = ''; // Clear existing items

      data.devices.forEach(device => {
        const deviceElement = document.createElement('div');
        deviceElement.className = 'configured-device-item';

        deviceElement.innerHTML = `
          <div class="configured-device-info">
            <div class="configured-device-name">${device.friendlyName || device.name}</div>
            <div class="configured-device-details">
              Name: ${device.name}${device.pin ? ' • PIN: ****' : ''}
            </div>
          </div>
          <div class="configured-device-actions">
            <div class="configured-status">Configured</div>
            <button class="remove-button" onclick="removeDevice('${device.mac || device.name}', '${device.friendlyName || device.name}')">
              <i class="material-icons">delete</i> Remove
            </button>
          </div>
        `;

        itemsContainer.appendChild(deviceElement);
      });
    } else {
      // Show empty state
      listElement.style.display = 'none';
      emptyElement.style.display = 'block';
    }

    console.log(`Loaded ${data.devices ? data.devices.length : 0} configured device(s)`);
  }
  
  // PIN dialog functionality
  pinCancel.addEventListener('click', () => {
    pinDialog.style.display = 'none';
    pinInput.value = '';
    selectedDevice = null;
  });
  
  pinSubmit.addEventListener('click', () => {
    const pin = pinInput.value;
    
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      alert('Please enter a valid 4-digit PIN');
      return;
    }
    
    if (selectedDevice) {
      sendMessage('addDevice', { 
        address: selectedDevice.mac,
        name: selectedDevice.name,
        pin: pin
      });
      
      pinDialog.style.display = 'none';
      pinInput.value = '';
      selectedDevice = null;
    }
  });
  
  // Initialize the connection
  connectWebSocket();

  // Load configured devices when page loads
  loadConfiguredDevices();

  // Function to load and display configured devices
  function loadConfiguredDevices() {
    sendMessage('getConfiguredDevices');
  }

  // Function to remove a device
  function removeDevice(deviceAddress, deviceName) {
    console.log(`[DEBUG] removeDevice called for ${deviceName} (${deviceAddress})`);
    
    const confirmed = confirm(`Are you sure you want to remove "${deviceName}"?`);
    if (!confirmed) {
      console.log(`[DEBUG] User cancelled removal`);
      return;
    }

    console.log(`[DEBUG] Sending removeDevice message for: ${deviceAddress}`);
    sendMessage('removeDevice', { address: deviceAddress });
  }

  // Make removeDevice available globally
  window.removeDevice = removeDevice;
}); 