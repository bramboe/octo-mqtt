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
    // Get the location of the WebSocket based on the current URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws`;
    
    try {
      socket = new WebSocket(wsUrl);
      
      socket.onopen = () => {
        console.log('WebSocket connection established');
        updateConnectionStatus('connected');
        reconnectAttempts = 0;
        
        // Request initial status
        sendMessage('getStatus');
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
  
  // Initialize the connection
  connectWebSocket();
}); 