#!/usr/bin/env node

console.log('Testing Noble initialization...');

try {
  console.log('Importing Noble...');
  const Noble = require('@abandonware/noble');
  
  console.log('Noble import type:', typeof Noble);
  console.log('Is Noble a constructor?', typeof Noble === 'function' ? 'Yes' : 'No');
  
  console.log('Initializing Noble...');
  const noble = Noble; // Correct way (singleton)
  // const noble = new Noble(); // Incorrect way (constructor)
  
  console.log('Noble initialized successfully:', typeof noble);
  
  // Test if setMaxListeners is available
  if (noble && typeof noble.setMaxListeners === 'function') {
    noble.setMaxListeners(30);
    console.log('Set Noble max listeners to 30 - OK');
  } else {
    console.warn('Could not set Noble max listeners');
  }
  
  console.log('Noble initialization test completed successfully');
} catch (error) {
  console.error('Error initializing Noble:', error);
} 