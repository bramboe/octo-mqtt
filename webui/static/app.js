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
    const wsUrl = `${protocol}//${window.location.host}`;
    console.log('WebSocket URL:', wsUrl);
    
    try {
      socket = new WebSocket(wsUrl);
      
      socket.onopen = () => {
        console.log('=== WEBSOCKET CONNECTION OPENED ===');
        console.log('WebSocket connected successfully');
        console.log('Socket readyState:', socket.readyState);
        console.log('Socket URL:', socket.url);
        updateConnectionStatus('connected');
        reconnectAttempts = 0;
        
        // Request initial status
        console.log('Requesting initial status...');
        sendMessage('getStatus');
      };
      
      socket.onmessage = (event) => {
        console.log('=== WEBSOCKET MESSAGE RECEIVED ===');
        console.log('Raw message data:', event.data);
        console.log('Message type:', typeof event.data);
        
        try {
          const data = JSON.parse(event.data);
          console.log('Parsed message:', data);
          console.log('Message type:', data.type);
          console.log('Message payload:', data.payload);
          handleMessage(data);
        } catch (error) {
          console.error('ERROR parsing WebSocket message:', error);
          console.error('Raw message that failed to parse:', event.data);
        }
      };
      
      socket.onclose = (event) => {
        console.log('=== WEBSOCKET CONNECTION CLOSED ===');
        console.log('WebSocket connection closed');
        console.log('Close event code:', event.code);
        console.log('Close event reason:', event.reason);
        console.log('Close event wasClean:', event.wasClean);
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
        console.error('=== WEBSOCKET ERROR ===');
        console.error('WebSocket error:', error);
        console.error('Error type:', typeof error);
        console.error('Error details:', error);
      };
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      updateConnectionStatus('disconnected');
    }
  }
  
  function checkWebSocketStatus() {
    console.log('=== WEBSOCKET STATUS CHECK ===');
    console.log('Socket exists:', !!socket);
    if (socket) {
      console.log('Socket readyState:', socket.readyState);
      console.log('Socket URL:', socket.url);
      console.log('Socket protocol:', socket.protocol);
      console.log('Socket extensions:', socket.extensions);
      console.log('Socket bufferedAmount:', socket.bufferedAmount);
    }
    return socket && socket.readyState === WebSocket.OPEN;
  }

  function sendMessage(type, payload = {}) {
    console.log('=== SEND MESSAGE CALLED ===');
    console.log('Message type:', type);
    console.log('Message payload:', payload);
    console.log('Socket exists:', !!socket);
    console.log('Socket readyState:', socket ? socket.readyState : 'null');
    
    if (socket && socket.readyState === WebSocket.OPEN) {
      const message = { type, ...payload };
      console.log('Sending WebSocket message:', message);
      console.log('Message JSON:', JSON.stringify(message));
      
      try {
        socket.send(JSON.stringify(message));
        console.log('Message sent successfully!');
      } catch (error) {
        console.error('ERROR sending message:', error);
      }
    } else {
      console.error('ERROR: Cannot send message - WebSocket is not connected');
      console.error('Socket state:', socket ? socket.readyState : 'null');
      console.error('WebSocket states: CONNECTING=0, OPEN=1, CLOSING=2, CLOSED=3');
    }
  }
  
  function handleMessage(data) {
    console.log('=== HANDLING MESSAGE ===');
    console.log('Message type:', data.type);
    console.log('Message payload:', data.payload);
    
    switch (data.type) {
      case 'status':
        console.log('Handling status message');
        updateStatus(data.payload);
        break;
      case 'deviceInfo':
        console.log('Handling deviceInfo message');
        updateDeviceInfo(data.payload);
        break;
      case 'addonInfo':
        console.log('Handling addonInfo message');
        updateAddonInfo(data.payload);
        break;
      case 'positionUpdate':
        console.log('Handling positionUpdate message');
        updatePositions(data.payload);
        break;
      case 'lightState':
        console.log('Handling lightState message');
        updateLightState(data.payload.state);
        break;
      case 'calibrationValues':
        console.log('Handling calibrationValues message');
        updateCalibrationValues(data.payload);
        break;
      case 'error':
        console.log('Handling error message:', data.payload.message);
        handleError(data.payload.message);
        break;
      case 'scanStatus':
        console.log('Handling scanStatus message:', data.payload);
        handleScanStatus(data.payload);
        break;
      case 'deviceDiscovered':
        console.log('Handling deviceDiscovered message:', data.payload);
        handleDeviceDiscovered(data.payload);
        break;
      case 'addDeviceStatus':
        console.log('Handling addDeviceStatus message:', data.payload);
        handleAddDeviceStatus(data.payload);
        break;
      case 'removeDeviceStatus':
        console.log('Handling removeDeviceStatus message:', data.payload);
        handleRemoveDeviceStatus(data.payload);
        break;
      case 'configuredDevices':
        console.log('Handling configuredDevices message:', data.payload);
        handleConfiguredDevices(data.payload);
        break;
      default:
        console.warn('Unknown message type:', data.type);
        console.warn('Full message:', data);
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
    console.log('=== SCAN BUTTON CLICKED ===');
    console.log('Scan button clicked, WebSocket state:', socket ? socket.readyState : 'null');
    console.log('Socket object:', socket);
    console.log('Scan button element:', scanButton);
    console.log('Device list element:', deviceList);
    console.log('Scan status element:', scanStatus);
    
    if (!socket) {
      console.error('ERROR: No WebSocket connection available!');
      alert('No WebSocket connection. Please refresh the page and try again.');
      return;
    }
    
    if (socket.readyState !== WebSocket.OPEN) {
      console.error('ERROR: WebSocket is not open. State:', socket.readyState);
      console.log('WebSocket states: CONNECTING=0, OPEN=1, CLOSING=2, CLOSED=3');
      alert('WebSocket connection is not ready. Please wait and try again.');
      return;
    }
    
    console.log('Disabling scan button...');
    scanButton.disabled = true;
    
    console.log('Clearing device list...');
    deviceList.innerHTML = ''; // Clear previous results
    
    console.log('Updating scan status...');
    scanStatus.textContent = 'Starting scan...';

    console.log('Sending scanBeds message via WebSocket...');
    // Send WebSocket message to start scan
    sendMessage('scanBeds');
    console.log('=== SCAN REQUEST SENT ===');
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
    console.log('=== HANDLING SCAN STATUS ===');
    console.log('Scan status data:', data);
    
    const { scanning, message, deviceCount } = data;
    console.log('Scanning:', scanning);
    console.log('Message:', message);
    console.log('Device count:', deviceCount);
    
    console.log('Updating discovery status text...');
    discoveryStatus.textContent = message;
    
    if (!scanning) {
      console.log('Scan completed, enabling scan button...');
      // Enable scan button
      scanButton.disabled = false;
      scanButton.classList.remove('scanning');
      
      // If devices were found, show the list
      if (deviceCount > 0) {
        console.log('Devices found, showing discovered devices list...');
        discoveredDevices.style.display = 'block';
      } else {
        console.log('No devices found');
      }
    } else {
      console.log('Scan in progress, disabling scan button...');
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
  console.log('=== INITIALIZING APPLICATION ===');
  console.log('Current location:', window.location.href);
  console.log('Protocol:', window.location.protocol);
  console.log('Host:', window.location.host);
  
  // Wait a moment for the page to fully load before connecting
  setTimeout(() => {
    console.log('Starting WebSocket connection...');
    connectWebSocket();
    loadConfiguredDevices();
  }, 1000);

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

  // Debug button handlers
  document.getElementById('test-connection').addEventListener('click', () => {
    console.log('=== TESTING WEBSOCKET CONNECTION ===');
    const debugOutput = document.getElementById('debug-output');
    debugOutput.innerHTML = '<p>Testing WebSocket connection...</p>';
    
    // First test if the server is responding
    fetch('/test')
      .then(response => response.json())
      .then(data => {
        console.log('Server test response:', data);
        debugOutput.innerHTML += `<p>✅ Server is running: ${data.message}</p>`;
        debugOutput.innerHTML += `<p>WebSocket clients: ${data.websocketClients}</p>`;
        
        // Now test WebSocket connection
        if (checkWebSocketStatus()) {
          debugOutput.innerHTML += '<p style="color: green;">✅ WebSocket is connected and ready!</p>';
          sendMessage('getStatus');
        } else {
          debugOutput.innerHTML += '<p style="color: red;">❌ WebSocket is not connected. Attempting to reconnect...</p>';
          console.log('Attempting to reconnect...');
          connectWebSocket();
        }
      })
      .catch(error => {
        console.error('Server test failed:', error);
        debugOutput.innerHTML += `<p style="color: red;">❌ Server test failed: ${error.message}</p>`;
      });
  });
  
  document.getElementById('check-status').addEventListener('click', () => {
    console.log('=== CHECKING CONNECTION STATUS ===');
    const debugOutput = document.getElementById('debug-output');
    const status = checkWebSocketStatus();
    
    let statusHtml = '<h4>Connection Status:</h4>';
    statusHtml += `<p>WebSocket Connected: ${status ? '✅ Yes' : '❌ No'}</p>`;
    statusHtml += `<p>Socket Exists: ${socket ? '✅ Yes' : '❌ No'}</p>`;
    
    if (socket) {
      statusHtml += `<p>Ready State: ${socket.readyState} (${getReadyStateName(socket.readyState)})</p>`;
      statusHtml += `<p>URL: ${socket.url}</p>`;
    }
    
    debugOutput.innerHTML = statusHtml;
  });
  
  document.getElementById('test-urls').addEventListener('click', async () => {
    console.log('=== TESTING DIFFERENT WEBSOCKET URLS ===');
    const debugOutput = document.getElementById('debug-output');
    debugOutput.innerHTML = '<p>Testing different WebSocket URLs...</p>';
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    
    const urlsToTest = [
      `${protocol}//${host}/ws`,
      `${protocol}//${host}`,
      `${protocol}//${host}/api/ws`,
      `ws://${host}/ws`,
      `wss://${host}/ws`
    ];
    
    for (const url of urlsToTest) {
      try {
        debugOutput.innerHTML += `<p>Testing: ${url}</p>`;
        const result = await testWebSocketConnection(url);
        debugOutput.innerHTML += `<p style="color: green;">✅ Success: ${url}</p>`;
      } catch (error) {
        debugOutput.innerHTML += `<p style="color: red;">❌ Failed: ${url} - ${error.error}</p>`;
      }
    }
    
    debugOutput.innerHTML += '<p><strong>URL testing complete!</strong></p>';
  });
  
  function getReadyStateName(state) {
    switch (state) {
      case 0: return 'CONNECTING';
      case 1: return 'OPEN';
      case 2: return 'CLOSING';
      case 3: return 'CLOSED';
      default: return 'UNKNOWN';
    }
  }
  
  function testWebSocketConnection(url) {
    return new Promise((resolve, reject) => {
      console.log(`Testing WebSocket connection to: ${url}`);
      const testSocket = new WebSocket(url);
      
      testSocket.onopen = () => {
        console.log(`✅ WebSocket connection successful to: ${url}`);
        testSocket.close();
        resolve({ success: true, url });
      };
      
      testSocket.onerror = (error) => {
        console.log(`❌ WebSocket connection failed to: ${url}`, error);
        reject({ success: false, url, error });
      };
      
      // Timeout after 5 seconds
      setTimeout(() => {
        if (testSocket.readyState === WebSocket.CONNECTING) {
          testSocket.close();
          reject({ success: false, url, error: 'Connection timeout' });
        }
      }, 5000);
    });
  }

  // Make removeDevice available globally
  window.removeDevice = removeDevice;
}); 