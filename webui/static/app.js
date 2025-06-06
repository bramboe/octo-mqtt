function connectWebSocket() {
  console.log('Attempting to connect WebSocket...');
  
  // Get the base URL from the current location, handling both direct and ingress access
  const baseUrl = window.location.pathname.endsWith('/') 
    ? window.location.pathname.slice(0, -1) 
    : window.location.pathname;
  
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}${baseUrl}/api/ws`;
  
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
    
    // ... rest of the WebSocket handlers ...
  } catch (error) {
    console.error('Error creating WebSocket:', error);
    updateConnectionStatus('disconnected');
  }
} 