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
  
  // Store devices and active device
  let devices = [];
  let activeDevice = 'all';
  let deviceLinks = [];
  let availableProxies = [];
  
  function connectWebSocket() {
    // Get the location of the WebSocket based on the current URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws`;
    
    try {
      socket = new WebSocket(wsUrl);
      
      socket.onopen = () => {
        console.log('WebSocket connection established');
        updateConnectionStatus('connected');
        reconnectAttempts = 0;
        
        // Request initial data
        sendMessage('getStatus');
        sendMessage('getDevices');
        sendMessage('getDeviceLinks');
        sendMessage('getProxies');
      };
      
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleMessage(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
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
      case 'devices':
        updateDevicesList(data.payload);
        break;
      case 'deviceLinks':
        updateDeviceLinks(data.payload);
        break;
      case 'proxies':
        updateProxiesList(data.payload);
        break;
      case 'scanResults':
        displayScanResults(data.payload);
        break;
      case 'deviceAdded':
        handleDeviceAdded(data.payload);
        break;
      case 'deviceRemoved':
        handleDeviceRemoved(data.payload);
        break;
      case 'linkCreated':
        handleLinkCreated(data.payload);
        break;
      case 'linkRemoved':
        handleLinkRemoved(data.payload);
        break;
      case 'error':
        handleError(data.payload.message);
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
  }
  
  function updateAddonInfo(info) {
    document.getElementById('addon-version').textContent = info.version;
    document.getElementById('addon-status').textContent = info.status;
  }
  
  function updateDevicesList(devicesList) {
    devices = devicesList;
    
    // Update device selector in controls tab
    const deviceSelector = document.getElementById('active-device');
    deviceSelector.innerHTML = '<option value="all">All Devices</option>';
    
    // Populate device list in devices tab
    const deviceListContainer = document.getElementById('device-list');
    // Clear existing content except for the no-devices message
    const noDevicesMessage = document.querySelector('.no-devices-message');
    deviceListContainer.innerHTML = '';
    if (noDevicesMessage) {
      deviceListContainer.appendChild(noDevicesMessage);
    }
    
    // Populate device options for link creation
    const linkDeviceOptions = document.getElementById('link-device-options');
    linkDeviceOptions.innerHTML = '';
    
    if (devices.length === 0) {
      if (noDevicesMessage) noDevicesMessage.style.display = 'block';
      return;
    }
    
    if (noDevicesMessage) noDevicesMessage.style.display = 'none';
    
    devices.forEach(device => {
      // Add to device selector
      const option = document.createElement('option');
      option.value = device.id;
      option.textContent = device.friendlyName;
      deviceSelector.appendChild(option);
      
      // Add to device list
      const deviceCard = document.createElement('div');
      deviceCard.className = 'device-card';
      deviceCard.id = `device-${device.id}`;
      
      deviceCard.innerHTML = `
        <div class="device-info">
          <div class="device-name">${device.friendlyName}</div>
          <div class="device-details">${device.id} - ${device.connectionType === 'proxy' ? 'ESPHome Proxy' : 'Direct Bluetooth'}</div>
        </div>
        <div class="device-actions">
          <button class="device-action-button edit-device" data-id="${device.id}" title="Edit">
            <i class="material-icons">edit</i>
          </button>
          <button class="device-action-button remove-device" data-id="${device.id}" title="Remove">
            <i class="material-icons">delete</i>
          </button>
        </div>
      `;
      
      deviceListContainer.appendChild(deviceCard);
      
      // Add event listeners for device actions
      deviceCard.querySelector('.edit-device').addEventListener('click', () => {
        editDevice(device);
      });
      
      deviceCard.querySelector('.remove-device').addEventListener('click', () => {
        removeDevice(device.id);
      });
      
      // Add to link device options
      const deviceOption = document.createElement('div');
      deviceOption.className = 'device-option';
      deviceOption.innerHTML = `
        <input type="checkbox" id="link-device-${device.id}" value="${device.id}">
        <label for="link-device-${device.id}">${device.friendlyName}</label>
      `;
      linkDeviceOptions.appendChild(deviceOption);
    });
  }
  
  function updateDeviceLinks(links) {
    deviceLinks = links;
    
    // Populate linked groups section
    const linkedGroups = document.querySelector('.linked-groups');
    // Clear existing content except for the no-links message
    const noLinksMessage = document.querySelector('.no-links-message');
    linkedGroups.innerHTML = '';
    if (noLinksMessage) {
      linkedGroups.appendChild(noLinksMessage);
    }
    
    if (deviceLinks.length === 0) {
      if (noLinksMessage) noLinksMessage.style.display = 'block';
      return;
    }
    
    if (noLinksMessage) noLinksMessage.style.display = 'none';
    
    deviceLinks.forEach(link => {
      const linkGroup = document.createElement('div');
      linkGroup.className = 'link-group';
      linkGroup.id = `link-${link.id}`;
      
      let linkedDevicesHtml = '';
      link.deviceIds.forEach(deviceId => {
        const device = devices.find(d => d.id === deviceId);
        if (device) {
          linkedDevicesHtml += `<span class="linked-device">${device.friendlyName}</span>`;
        }
      });
      
      linkGroup.innerHTML = `
        <div class="link-header">
          <span class="link-name">${link.name}</span>
          <button class="device-action-button remove-link" data-id="${link.id}" title="Remove Link">
            <i class="material-icons">link_off</i>
          </button>
        </div>
        <div class="linked-devices">
          ${linkedDevicesHtml}
        </div>
      `;
      
      linkedGroups.appendChild(linkGroup);
      
      // Add event listener for remove link button
      linkGroup.querySelector('.remove-link').addEventListener('click', () => {
        removeLink(link.id);
      });
    });
  }
  
  function updateProxiesList(proxies) {
    availableProxies = proxies;
    
    // Update proxies dropdown in setup modal
    const proxySelect = document.getElementById('proxy-select');
    proxySelect.innerHTML = '';
    
    if (proxies.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No proxies available';
      option.disabled = true;
      option.selected = true;
      proxySelect.appendChild(option);
      return;
    }
    
    proxies.forEach(proxy => {
      const option = document.createElement('option');
      option.value = proxy.id;
      option.textContent = `${proxy.host}:${proxy.port}`;
      proxySelect.appendChild(option);
    });
  }
  
  function displayScanResults(results) {
    const scanResults = document.getElementById('scan-results');
    scanResults.innerHTML = '';
    scanResults.style.display = 'block';
    
    if (results.length === 0) {
      scanResults.innerHTML = '<div class="scan-result">No devices found</div>';
      return;
    }
    
    results.forEach(result => {
      const resultElem = document.createElement('div');
      resultElem.className = 'scan-result';
      resultElem.innerHTML = `
        <div>${result.name || 'Unknown Device'}</div>
        <div>${result.address}</div>
      `;
      
      resultElem.addEventListener('click', () => {
        document.getElementById('device-mac').value = result.address;
        scanResults.style.display = 'none';
      });
      
      scanResults.appendChild(resultElem);
    });
  }
  
  function handleDeviceAdded(device) {
    // Refresh device list
    sendMessage('getDevices');
    
    // Close setup modal
    closeModal();
    
    // Show success message
    alert(`Device "${device.friendlyName}" added successfully!`);
  }
  
  function handleDeviceRemoved(deviceId) {
    // Refresh device list
    sendMessage('getDevices');
    
    // Refresh device links
    sendMessage('getDeviceLinks');
  }
  
  function handleLinkCreated(link) {
    // Refresh device links
    sendMessage('getDeviceLinks');
    
    // Clear link form
    document.getElementById('link-name').value = '';
    document.querySelectorAll('#link-device-options input[type="checkbox"]').forEach(input => {
      input.checked = false;
    });
  }
  
  function handleLinkRemoved(linkId) {
    // Refresh device links
    sendMessage('getDeviceLinks');
  }
  
  function handleError(message) {
    console.error('Error from server:', message);
    alert(`Error: ${message}`);
  }
  
  // Modal and wizard functionality
  const modal = document.getElementById('setup-modal');
  const closeBtn = document.querySelector('.close-modal');
  const addDeviceBtn = document.getElementById('add-device-btn');
  
  function openModal() {
    modal.style.display = 'block';
    resetWizard();
  }
  
  function closeModal() {
    modal.style.display = 'none';
  }
  
  function resetWizard() {
    // Reset form fields
    document.getElementById('device-friendly-name').value = '';
    document.getElementById('device-id').value = '';
    document.getElementById('device-pin').value = '';
    document.getElementById('device-mac').value = '';
    
    // Reset radio buttons
    document.querySelector('input[name="connection-type"][value="proxy"]').checked = true;
    toggleConnectionFields();
    
    // Reset wizard steps
    document.querySelectorAll('.wizard-step').forEach(step => {
      step.classList.remove('active');
    });
    document.querySelector('.wizard-step[data-step="1"]').classList.add('active');
  }
  
  function toggleConnectionFields() {
    const connectionType = document.querySelector('input[name="connection-type"]:checked').value;
    
    if (connectionType === 'proxy') {
      document.getElementById('proxy-fields').style.display = 'block';
      document.getElementById('bluetooth-fields').style.display = 'none';
    } else {
      document.getElementById('proxy-fields').style.display = 'none';
      document.getElementById('bluetooth-fields').style.display = 'block';
    }
  }
  
  function updateSummary() {
    const friendlyName = document.getElementById('device-friendly-name').value;
    const deviceId = document.getElementById('device-id').value;
    const pin = document.getElementById('device-pin').value;
    const connectionType = document.querySelector('input[name="connection-type"]:checked').value;
    
    let connectionDetails = '';
    if (connectionType === 'proxy') {
      const proxySelect = document.getElementById('proxy-select');
      const selectedProxy = proxySelect.options[proxySelect.selectedIndex];
      connectionDetails = `ESPHome Proxy (${selectedProxy.textContent})`;
    } else {
      connectionDetails = `Direct Bluetooth (${document.getElementById('device-mac').value})`;
    }
    
    document.getElementById('summary-name').textContent = friendlyName;
    document.getElementById('summary-id').textContent = deviceId;
    document.getElementById('summary-pin').textContent = pin || 'Not set';
    document.getElementById('summary-connection').textContent = connectionDetails;
  }
  
  function saveDevice() {
    const friendlyName = document.getElementById('device-friendly-name').value;
    const deviceId = document.getElementById('device-id').value;
    const pin = document.getElementById('device-pin').value;
    const connectionType = document.querySelector('input[name="connection-type"]:checked').value;
    
    if (!friendlyName || !deviceId) {
      alert('Device name and ID are required');
      return;
    }
    
    let deviceData = {
      friendlyName,
      id: deviceId,
      pin: pin || null,
      connectionType
    };
    
    if (connectionType === 'proxy') {
      const proxySelect = document.getElementById('proxy-select');
      deviceData.proxyId = proxySelect.value;
    } else {
      const mac = document.getElementById('device-mac').value;
      if (!mac) {
        alert('MAC address is required for direct Bluetooth connection');
        return;
      }
      deviceData.address = mac;
    }
    
    sendMessage('addDevice', { device: deviceData });
  }
  
  function editDevice(device) {
    // Open modal with device details pre-filled
    openModal();
    
    document.getElementById('device-friendly-name').value = device.friendlyName;
    document.getElementById('device-id').value = device.id;
    if (device.pin) {
      document.getElementById('device-pin').value = device.pin;
    }
    
    if (device.connectionType === 'proxy') {
      document.querySelector('input[name="connection-type"][value="proxy"]').checked = true;
      
      // Select the right proxy
      if (device.proxyId) {
        document.getElementById('proxy-select').value = device.proxyId;
      }
    } else {
      document.querySelector('input[name="connection-type"][value="direct"]').checked = true;
      document.getElementById('device-mac').value = device.address;
    }
    
    toggleConnectionFields();
  }
  
  function removeDevice(deviceId) {
    if (confirm(`Are you sure you want to remove this device? This action cannot be undone.`)) {
      sendMessage('removeDevice', { deviceId });
    }
  }
  
  function createLink() {
    const linkName = document.getElementById('link-name').value;
    if (!linkName) {
      alert('Please enter a name for the link');
      return;
    }
    
    const selectedDevices = [];
    document.querySelectorAll('#link-device-options input[type="checkbox"]:checked').forEach(input => {
      selectedDevices.push(input.value);
    });
    
    if (selectedDevices.length < 2) {
      alert('Please select at least two devices to link');
      return;
    }
    
    sendMessage('createLink', { name: linkName, deviceIds: selectedDevices });
  }
  
  function removeLink(linkId) {
    if (confirm(`Are you sure you want to remove this link? This action cannot be undone.`)) {
      sendMessage('removeLink', { linkId });
    }
  }
  
  function scanForDevices() {
    const scanResults = document.getElementById('scan-results');
    scanResults.innerHTML = '<div class="scan-result">Scanning...</div>';
    scanResults.style.display = 'block';
    
    sendMessage('scanDevices');
  }
  
  // Event listeners for wizard buttons
  document.getElementById('next-step-1').addEventListener('click', () => {
    // Validate first step
    const friendlyName = document.getElementById('device-friendly-name').value;
    const deviceId = document.getElementById('device-id').value;
    
    if (!friendlyName || !deviceId) {
      alert('Please enter a device name and ID');
      return;
    }
    
    // Move to next step
    document.querySelector('.wizard-step[data-step="1"]').classList.remove('active');
    document.querySelector('.wizard-step[data-step="2"]').classList.add('active');
  });
  
  document.getElementById('prev-step-2').addEventListener('click', () => {
    document.querySelector('.wizard-step[data-step="2"]').classList.remove('active');
    document.querySelector('.wizard-step[data-step="1"]').classList.add('active');
  });
  
  document.getElementById('next-step-2').addEventListener('click', () => {
    // Validate second step
    const connectionType = document.querySelector('input[name="connection-type"]:checked').value;
    
    if (connectionType === 'proxy') {
      const proxySelect = document.getElementById('proxy-select');
      if (!proxySelect.value) {
        alert('Please select a proxy');
        return;
      }
    } else {
      const mac = document.getElementById('device-mac').value;
      if (!mac) {
        alert('Please enter a MAC address');
        return;
      }
    }
    
    // Update summary
    updateSummary();
    
    // Move to next step
    document.querySelector('.wizard-step[data-step="2"]').classList.remove('active');
    document.querySelector('.wizard-step[data-step="3"]').classList.add('active');
  });
  
  document.getElementById('prev-step-3').addEventListener('click', () => {
    document.querySelector('.wizard-step[data-step="3"]').classList.remove('active');
    document.querySelector('.wizard-step[data-step="2"]').classList.add('active');
  });
  
  document.getElementById('save-device').addEventListener('click', saveDevice);
  
  // Connection type toggle
  document.querySelectorAll('input[name="connection-type"]').forEach(input => {
    input.addEventListener('change', toggleConnectionFields);
  });
  
  // Bluetooth scanning
  document.getElementById('scan-devices').addEventListener('click', scanForDevices);
  
  // Modal event listeners
  addDeviceBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  window.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });
  
  // Create link button
  document.getElementById('create-link-btn').addEventListener('click', createLink);
  
  // Device selector change
  document.getElementById('active-device').addEventListener('change', (event) => {
    activeDevice = event.target.value;
    sendMessage('setActiveDevice', { deviceId: activeDevice });
  });
  
  // Set up control button event listeners
  document.getElementById('preset-flat').addEventListener('click', () => {
    sendMessage('preset', { preset: 'flat', deviceId: activeDevice });
  });
  
  document.getElementById('preset-zerog').addEventListener('click', () => {
    sendMessage('preset', { preset: 'zerog', deviceId: activeDevice });
  });
  
  document.getElementById('preset-tv').addEventListener('click', () => {
    sendMessage('preset', { preset: 'tv', deviceId: activeDevice });
  });
  
  document.getElementById('preset-reading').addEventListener('click', () => {
    sendMessage('preset', { preset: 'reading', deviceId: activeDevice });
  });
  
  document.getElementById('head-up').addEventListener('click', () => {
    sendMessage('motorControl', { motor: 'head', direction: 'up', deviceId: activeDevice });
  });
  
  document.getElementById('head-stop').addEventListener('click', () => {
    sendMessage('motorControl', { motor: 'head', direction: 'stop', deviceId: activeDevice });
  });
  
  document.getElementById('head-down').addEventListener('click', () => {
    sendMessage('motorControl', { motor: 'head', direction: 'down', deviceId: activeDevice });
  });
  
  document.getElementById('feet-up').addEventListener('click', () => {
    sendMessage('motorControl', { motor: 'feet', direction: 'up', deviceId: activeDevice });
  });
  
  document.getElementById('feet-stop').addEventListener('click', () => {
    sendMessage('motorControl', { motor: 'feet', direction: 'stop', deviceId: activeDevice });
  });
  
  document.getElementById('feet-down').addEventListener('click', () => {
    sendMessage('motorControl', { motor: 'feet', direction: 'down', deviceId: activeDevice });
  });
  
  document.getElementById('both-up').addEventListener('click', () => {
    sendMessage('motorControl', { motor: 'both', direction: 'up', deviceId: activeDevice });
  });
  
  document.getElementById('both-stop').addEventListener('click', () => {
    sendMessage('motorControl', { motor: 'both', direction: 'stop', deviceId: activeDevice });
  });
  
  document.getElementById('both-down').addEventListener('click', () => {
    sendMessage('motorControl', { motor: 'both', direction: 'down', deviceId: activeDevice });
  });
  
  // Calibration buttons
  document.getElementById('calibrate-head').addEventListener('click', () => {
    sendMessage('calibrate', { motor: 'head', deviceId: activeDevice });
  });
  
  document.getElementById('calibrate-feet').addEventListener('click', () => {
    sendMessage('calibrate', { motor: 'feet', deviceId: activeDevice });
  });
  
  // Position sliders
  const headPosition = document.getElementById('head-position');
  headPosition.addEventListener('input', () => {
    document.getElementById('head-position-value').textContent = `${headPosition.value}%`;
  });
  
  headPosition.addEventListener('change', () => {
    sendMessage('setPosition', { motor: 'head', position: parseInt(headPosition.value), deviceId: activeDevice });
  });
  
  const feetPosition = document.getElementById('feet-position');
  feetPosition.addEventListener('input', () => {
    document.getElementById('feet-position-value').textContent = `${feetPosition.value}%`;
  });
  
  feetPosition.addEventListener('change', () => {
    sendMessage('setPosition', { motor: 'feet', position: parseInt(feetPosition.value), deviceId: activeDevice });
  });
  
  // Light toggle
  document.getElementById('light-toggle').addEventListener('change', (event) => {
    sendMessage('light', { state: event.target.checked, deviceId: activeDevice });
  });
  
  // Initialize the connection
  connectWebSocket();
}); 