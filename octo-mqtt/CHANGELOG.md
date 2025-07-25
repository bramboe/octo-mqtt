## v2.7.3

**CRITICAL FIX - Home Assistant Ingress Compatibility**
- **FIXED**: Removed incorrect `ingress_entry: "index.html"` - should be empty for web UIs
- **IMPROVED**: Enhanced static file serving and route handling for better Ingress compatibility
- **OPTIMIZED**: Added proper cache headers and ETag support for static assets
- **ENHANCED**: Better logging for root path requests and Ingress debugging
- **UPDATED**: All version references consistently updated to v2.7.3

This version fixes the core issue where the frontend was not properly loading under Home Assistant's Ingress system. The `ingress_entry` should be empty for addon web interfaces, not point to a specific file.

## v2.7.2

**Home Assistant Ingress Compatibility Fix**
- **CRITICAL FIX**: Fixed web UI not communicating with backend under Home Assistant Ingress
- Added proper `ingress_entry` configuration for Home Assistant add-on compliance
- Enhanced frontend URL construction to handle Ingress paths correctly
- Added detection for both old and new Ingress path patterns (`/api/hassio_ingress/` and `/api/ingress/`)
- Added Ingress header logging and CORS headers for better compatibility
- Fixed API calls failing when addon runs through Home Assistant's Ingress system
- Updated all version references to v2.7.2 for consistency

## v2.7.1

**BLE Proxy Status Fix Release**
- **CRITICAL FIX**: Fixed BLE proxy status showing "Disconnected" despite successful connection
- Changed frontend to use `/health` endpoint instead of `/debug/ble-proxy` for BLE proxy status checks
- Fixed Home Assistant Ingress authorization issues with diagnostic endpoints
- BLE proxy status now correctly displays "Connected" when ESPHome proxy is active
- Updated frontend API calls to use working endpoints that pass authorization
- Updated all version references to v2.7.1 for consistency
- This fixes the UI status display while maintaining full backend functionality

## v2.7.0

**Docker & TypeScript Compilation Fix Release**  
- **CRITICAL FIX**: Fixed Home Assistant add-on running old `index.js` instead of new TypeScript code
- Updated Dockerfile to build and run compiled TypeScript from `dist/` directory
- Fixed "BLE Proxy Connection: Disconnected" issue caused by legacy backend
- All BLE/ESPHome/diagnostics functionality now works correctly in production
- Enhanced build process with proper TypeScript compilation and file copying
- Updated all version references to v2.7.0 for consistency

## v2.6.7

**API Routing Fix Release**
- **CRITICAL FIX**: Moved Express static file middleware after API routes to prevent 404 errors
- Fixed 404 "Not Found" errors for `/health`, `/scan/status`, and other API endpoints
- API routes now take precedence over static file serving in Express middleware order
- Frontend can now successfully communicate with backend APIs in Home Assistant Ingress
- Updated catch-all route to only handle unmatched API calls, not static files
- Updated all version references to v2.6.7 for consistency
- This fixes the core issue causing "Backend Error: API call failed: 404" messages

## v2.6.6

**Crash Fix Release**
- Added global error handlers to prevent backend crashes from ESPHome ping timeouts
- Fixed "write after end" errors that were causing Node.js to crash unexpectedly
- Enhanced frontend API call logging with detailed console output for debugging
- Improved error handling in ESPHome connections with graceful degradation
- Added connection error handlers to prevent propagation of ESPHome library errors
- Updated all version references to v2.6.6 for consistency
- Backend now remains stable despite ESPHome connection issues

## v2.6.5

**Diagnostics Release**
- All API calls now use Ingress-compatible paths (fixes frontend/backend disconnect in Home Assistant Ingress)
- Explicit logging for every BLE device discovered, every scan event, and every error
- Frontend logs every API response and shows a diagnostics panel
- Version bump to v2.6.5 for clarity and support
- Ready for RPi and multi-arch Home Assistant deployment

## v2.5.0

**Enhanced UI Action Logging**
- Complete frontend-to-backend action tracking for all button clicks
- Detailed logging with timestamps for Start/Stop/Refresh/Test BLE Proxy actions
- Enhanced error logging with troubleshooting hints and state information
- Frontend logs show user actions with timestamps and backend responses
- Backend logs track request flow, scan timing, and connection diagnostics

**Dynamic Cache Busting**
- Implemented dynamic JavaScript loading with timestamp + random cache busting
- Created force-reload.html diagnostic tool for cache testing and clearing
- Enhanced cache warning system with automatic detection and user guidance
- Improved browser compatibility with aggressive cache invalidation

**Version Management**
- Updated all version references to v2.5.0 across all components
- Enhanced console logging to identify successful version loading
- Improved user feedback for cache and connectivity issues

**Technical Improvements**
- Enhanced API endpoints to track request sources (refresh-button, test-button)
- Improved error differentiation between frontend and backend issues
- Added client information tracking for better debugging
- Comprehensive scan duration and timing information logging

## v2.3.0

**Major Improvements**
- Real ESPHome BLE proxy integration replacing all simulation code
- Live BLE device scanning and discovery with real hardware
- Enhanced frontend with real-time status updates every 5 seconds
- Comprehensive BLE proxy diagnostics and connection testing
- Fixed "String did not match the expected pattern" error completely
- BLE proxy connection status now displays correctly as "Connected"

**Frontend Enhancements**
- Fixed frontend/backend API integration issues
- Corrected element ID references in JavaScript (devices-list, logs)
- Added updateBLEProxyStatus function for real-time updates
- Improved testBLEProxy function to handle correct API response format
- Enhanced error handling and user feedback

**Backend Improvements**
- Configuration loading works properly in both development and production
- Enhanced logging with file output and timestamps
- Removed all simulation code in favor of real hardware integration
- Improved error messages and troubleshooting information
- Real-time device discovery and display functionality

**Technical**
- Updated all API endpoints to use real ESPHome connections
- Fixed configuration path resolution for different environments
- Enhanced BLE scanner initialization and management
- Improved connection retry logic and error recovery

## v2.2.0

**Improvements**
- BLE proxy connection now retries up to 3 times for reliability
- Detailed error logging for all BLE proxy connection attempts
- Live BLE device discovery: devices are shown in real time as they are found
- New /debug/ble-proxy endpoint to test BLE proxy connectivity and return results
- Version bump and build version update for Home Assistant compatibility

**Technical**
- Confirmed Dockerfile, config.json, and entrypoint follow Home Assistant add-on best practices
- All runtime writes use /data
- Add-on can run independently on a Raspberry Pi Home Assistant installation

## v2.1.1

**Bug Fixes**

- (API) Fixed /health endpoint to return exact format frontend expects
- (API) Fixed /scan/start endpoint to return scanDuration immediately
- (Frontend) Added proper error handling for JSON parsing errors
- (Frontend) Fixed device.address vs device.mac field mapping
- (Frontend) Improved error messages and HTTP status handling
- (BLE) Moved BLE scan execution to background to prevent blocking responses

**Technical Improvements**

- (Code) Resolved "The string did not match the expected pattern" errors
- (Code) Enhanced frontend-backend API compatibility
- (Code) Improved error reporting with specific HTTP status codes

## v2.1.0

**New Features**

- (BLE) Real ESPHome BLE proxy scanning instead of simulation
- (BLE) Direct integration with @2colors/esphome-native-api
- (API) All endpoints now return proper JSON responses
- (API) Improved error handling and logging for BLE operations

**Bug Fixes**

- (BLE) Fixed /scan/start endpoint to use actual ESPHome connections
- (BLE) Fixed /scan/status endpoint to return consistent JSON format
- (API) Fixed "The string did not match the expected pattern" errors in web UI
- (Docker) Removed dependency on TypeScript compilation for runtime
- (HomeAssistant) Improved standalone operation on Raspberry Pi installations

**Technical Improvements**

- (Code) Replaced TypeScript imports with direct JavaScript implementation
- (Code) Enhanced BLE device discovery with proper connection management
- (Code) Added comprehensive error handling for ESPHome proxy connections
- (Code) Improved logging for debugging BLE operations

## v1.1.22

**New Features**

- (Scanner) Add support for partial name matching
- (Scanner) Support scanning for all devices
- (BLE) Log errors on BLE characteristic write failures
- (Keeson) Send stop command after movement commands
- (Common) Correctly handle errors in repeated commands

**Bug Fixes**

- (Keeson) Fix checksum calculation for base-i4 & base-i5 controllers
- (Keeson) Fix support for base-i4 controllers
- (BLE) Fix disconnect logic
- (Common) Fix config issue

## v1.1.21

**New Features**

- (Common) Treat names as case insensitive
- (Scanner) Add BLE scanner helper

**_Motor Controls_**

- (ErgoMotion) Support extending motor control commands
- (ErgoWifi) Support extending motor control commands
- (Keeson) Support extending motor control commands
- (LeggettPlatt) Support extending motor control commands
- (Linak) Support extending motor control commands
- (Logicdata) Support extending motor control commands
- (MotoSleep) Support extending motor control commands
- (Octo) Support extending motor control commands
- (Okimat) Support extending motor control commands
- (Richmat) Support extending motor control commands
- (Solace) Support extending motor control commands

**Bug Fixes**

- (Octo) Correctly handle multiple commands
- (Octo) Fix PIN command

## v1.1.20

**New Features**

- (Keeson) Add support for base-i4 controllers
- (Keeson) Remove need for base-i5 names to match and have expect services

**Bug Fixes**

- (Octo) Fix motor buttons not working
- (Sleeptracker) Filter out in-active devices
- (Octo) Allow octo in the config file

## v1.1.19

**New Features**

- (HomeAssistant) Add new cover entity type
- (Common) Improve the delays in commands
- (Keeson) Add support for base-i5 controllers
- (MotoSleep) Added antisnore, ZeroG, and TV features to new beds
- (MotoSleep) Expand massage support for 3-motor beds
- (Octo) Add support for Octo controlled beds
- (Okimat) Add support for programming memory positions
- (Okimat) Add support for 82417 remote code
- (Okimat) Add support for 91244 remote code
- (Richmat) Add support for AZRN remote code
- (Richmat) Add support for BVRM remote code
- (Richmat) Error if unsupported remote code used

**_Motor Controls_**

- (ErgoMotion) Add prototype motor control entities
- (ErgoWifi) Add prototype motor control entities
- (Keeson) Add prototype motor control entities
- (LeggettPlatt) Add prototype motor control entities
- (Linak) Add prototype motor control entities
- (Logicdata) Add prototype motor control entities
- (MotoSleep) Add prototype motor control entities
- (Okimat) Add prototype motor control entities
- (Reverie) Add prototype motor control entities
- (Richmat) Add prototype motor control entities
- (Sleeptracker) Add prototype motor control entities
- (Solace) Add prototype motor control entities

## v1.1.18

**Bug Fixes**

- (Reverie) Fix missing checksum on commands
- (Okimat) Test repeated command for Flat preset

## v1.1.17

**Breaking Changes**

- (Okimat) Rename FurniMove to Okimat since it's a more logical name

**New Features**

- (Keeson) Add initial support for Keeson beds

**Bug Fixes**

- (Okimat) Fix sending commands
- (Okimat) Pair on connection

## v1.1.16

**New Features**

- (Richmat) Add support for additional memory presets
- (Richmat) Add W6RM remote code
- (Richmat) Add X1RM remote code for Lucid L300 beds
- (FurniMove) Add initial support for FurniMove beds

**Bug Fixes**

- (Solace) Handle mapping of certain characters in bed names
- (Richmat) Fix default remote code

## v1.1.15

**Bug Fixes**

- (HomeAssistant) Stop resending state & online messages if state didn't change
- (ESPHome) Ignore nameless advertisements

## v1.1.14

**Bug Fixes**

- (ESPHome) Fix address based BLE discovery

## v1.1.13

**Breaking Changes**

- (ErgoWifi) Remove old config options

**New Features**

- (ESPHome) Support finding beds using mac address instead of name

**Bug Fixes**

- (HomeAssistant) Don't allow invalid device topics (fixes ErgoMotion issue)
- (ErgoMotion) Use connection for one command only
- (HomeAssistant) Remove deprecated discovery property for light entities

## v1.1.12

**Breaking Changes**

- (ErgoWifi) Previous Ergomotion support has been renamed to ErgoWifi

**New Features**

- (ErgoMotion) Initial support for local TCP beds
- (ESPHome) Support pairing with BLE Devices

**Bug Fixes**

- (Leggett & Platt) Fix Gen2 support
- (Leggett & Platt) Reinstate not supported message

## v1.1.11

**New Features**

- (Leggett & Platt) Initial support for Okin variants
- (ESPHome) Detect if the ESPHome BT Proxy has proxy configured

**Bug Fixes**

- (Reverie) Fix bad messages in the logs that said Richmat
- (ESPHome) Update native api to fix some uuid issues

## v1.1.10

**New Features**

- (Leggett & Platt) Initial support for Leggett & Platt beds
- (Logicdata) Initial support for Logicdata beds

**Bug Fixes**

- (Sleeptracker) Fix entity categories
- (HomeAssistant) Stop handlers from crashing add-on

## v1.1.9

**New Features**

- (Reverie) Initial support for some Reverie beds
- (Linak) Add massage buttons

**Bug Fixes**

- (Linak) Fix commands for presets
- (Linak) Don't disconnect
- (HomeAssistant) Remove device name prefix from entity names
- (HomeAssistant) Delay sending available message a little

## v1.1.8

**New Features**

- (Solace) Finalize preset buttons
- (MotoSleep) Support for MotoSleep beds
- (Linak) Add preset buttons and light entities

**Bugs Fixed**

- (Linak) Fix command for light toggle
- (Linak) Fix bed sensor data extraction
- (Linak) Remove device type configuration
- (Linak/Solace/Richmat) Disconnect from BLE devices if main service/characteristics not found

## v1.1.7

**New Features**

- (Richmat) Allow bluetooth to stay connected
- (ESPHome) Attempt to reconnect when bluetooth disconnected unexpectedly

**Bugs Fixed**

- (Solace) Fixes to initial prototype
- (Linak) Ensure entities are properly initialized and set to online
- (ESPHome) Remove device name prefixes due to bugs
- (ESPHome) Fix BLE support for new ESPHome devices

## v1.1.6

**Bugs Fixed**

- (ESPHome) Build error caused by changes in discovery

## v1.1.5

**Bugs Fixed**

- (ESPHome) Support device name prefixes

## v1.1.4

**New Features**

- (Solace) Very early support for Solace beds

**Bugs Fixed**

- (ESPHome) Better handling of ESPHome encryption key config
- (ESPHome) Better support for Bluetooth devices
- (Linak) Tweaks to Linak bed prototype
- (Sleeptracker) Fixed VOC sensor class

## v1.1.3

**New Features**

- (Richmat) Support for ZR10 & ZR60 remote codes
- (Linak) Very early support for Linak beds

## v1.1.2

**New Features**

- (Sleeptracker) Support for STS-60 devices

## v1.1.1

**Bugs Fixed**

- (HomeAssistant) Cannot save config with default config
- (Richmat) Strings not used properly

## v1.1.0

**Bugs Fixed**

- (Richmat) Strings module not found

## v1.0.9

**Bugs Fixed**

- (Richmat) Casing of import breaks docker build

## v1.0.8

**New Features**

- (Richmat) Experimental support for Richmat beds that use BLE controllers, e.g. Sven & Son

**Bugs Fixed**

- (ErgoMotion) Some buttons shouldn't be visible for all beds
- (ErgoMotion) Some buttons have wrong names

## v1.0.7

**New Features**

- (Sleeptracker) Support for Beautyrest SmartMotion & Serta Perfect smart bases
- (ErgoMotion) Experimental support for ErgoMotion beds that use the ErgoWifi app and Keeson WF02D & WF03D controller.

**Breaking Changes**

- (Sleeptracker) Changed the MQTT topic to handle split base beds; You will need to delete the current device and let the add-on re-create it, although entity ids should stay the same.

**Bugs Fixed**

- (Sleeptracker) Split base beds showing as two devices

## v1.0.6

**Bugs Fixed**

- State updates stop after HomeAssistant reboot

## v1.0.5

**Bugs Fixed**

- (Sleeptracker) Fix naming for split base bed entities

## v1.0.4

**Bugs Fixed**

- (Sleeptracker) Stop logging expected errors on status request

## v1.0.3

**Bugs Fixed**

- (Sleeptracker) Massage Head & Foot Step weren't working

## v1.0.2

**New Features**

- (Sleeptracker) Add buttons to use and set the TV preset

## v1.0.1

**Bugs Fixed**

- Sleeptracker API not returning manufacturer details, which caused HA to fail to add the devices

## [2.6.1] - Universal BLE scan
- All BLE devices are now discovered during scan, not just RC2 beds or specific MACs.
- Fixes main issue where no devices appeared in scan results for most users.

## [2.6.2] - Diagnostics & Logging
- Add explicit backend logging for every API call, BLE proxy connection, and scanner lifecycle.
- Diagnose backend/frontend and BLE proxy connection issues.

## [2.6.3] - Build Fix
- Dockerfile uses --legacy-peer-deps for npm ci to work around devDependency conflicts during build.
- Ensures successful add-on build in Home Assistant.

## [2.6.5] - 2025-07-06
### Fixed
- Web UI now loads and stays loaded: octo-ble-scanner.js is loaded as a module in index.html.
- Removed cache warning logic from index.html.
- Fixes 'Importing a module script failed' and blank UI issues.
- Updated all version references in index.html to 2.6.5 (title, header, cache-busting).

## [2.6.4] - 2025-07-06
(This version is superseded by 2.6.5. Please use 2.6.5 for all deployments.)

## [2.6.8] - 2025-01-07
### Added
- Enhanced URL debugging for frontend API calls
- Comprehensive logging of window.location and URL construction
- Additional diagnostics for troubleshooting API routing issues

### Fixed
- Improved debugging tools for identifying API call routing problems

## [2.6.7] - 2025-01-07
### Fixed
- Critical API routing issue: moved Express static file middleware AFTER API routes
- Fixed Express route order to ensure API endpoints take precedence over static files
- Backend API calls now properly route to handlers instead of static file server

### Changed
- Improved error handling and logging for API route debugging
- Enhanced frontend error reporting for failed API calls

## [2.6.6] - 2025-01-07
### Added
- Global error handlers to prevent backend crashes from ESPHome connection issues
- Enhanced error handling for "write after end" errors from ESPHome ping timeouts
- Improved frontend API call logging with detailed console output

### Fixed
- Backend crash prevention for ESPHome connection errors
- Better handling of connection timeouts and network issues

## [2.6.5] - 2025-01-07
### Fixed
- Frontend loading issues: Fixed script loading to use module type
- Improved dynamic script loader in index.html
- Enhanced error handling and diagnostics in frontend
- Better cache-busting mechanisms

### Changed
- Updated all version references across configuration files
- Improved frontend-backend communication error reporting

## [2.6.4] - 2025-01-07
### Fixed
- Frontend script loading issues resolved
- Better error handling for missing DOM elements
- Improved cache management and version consistency

## [2.6.3] - 2025-01-07
### Fixed
- Docker build process: Updated to multi-stage build with proper TypeScript compilation
- Fixed npm dependency issues using --legacy-peer-deps and --ignore-scripts  
- Moved tslib from devDependencies to dependencies to fix runtime errors
- Updated run.sh to execute built backend from dist/tsc/index.js instead of legacy index.js

### Changed
- Completely rebuilt Docker containerization workflow
- Improved build process for production deployment
- Enhanced logging and error handling in backend

## [2.6.2] - 2025-01-07
### Added
- Real ESPHome BLE proxy connection implementation
- Comprehensive backend diagnostics and logging
- Frontend cache-busting and API call logging
- BLE device discovery and scan functionality

### Fixed
- Replaced simulation code with actual ESPHome BLE proxy integration
- Improved frontend-backend communication
- Enhanced error handling and debugging tools

## [2.6.1] - 2025-01-07
### Added
- Enhanced logging and diagnostics
- Better error handling for BLE connections
- Improved frontend status updates

## [2.6.0] - 2025-01-07
### Added
- Complete rewrite for Home Assistant add-on architecture
- ESPHome BLE proxy integration  
- MQTT-based device control
- Web-based configuration interface
- Real-time BLE device scanning
- Home Assistant entity auto-discovery

### Changed
- Migrated from standalone application to Home Assistant add-on
- Updated architecture for container deployment
- Enhanced security and integration features

## v2.8.0

**Feature – Live UI Updates**
- Added Server-Sent Events `/events` endpoint in the backend.
- Frontend now opens a persistent SSE connection and updates scan state, device list, and BLE-proxy status instantly – no manual refresh needed.
- Keeps a 5-second polling fallback for reliability.

**Version bump**: All files updated to 2.8.0.

## v2.8.1

**Fix – Reliable Live Updates in Home Assistant**
- SSE endpoint now disables Nginx buffering (`X-Accel-Buffering: no`) and flushes headers, ensuring events reach the browser in real-time through Ingress.
- Added heartbeat broadcast log and improved diagnostics.
- Version bump across addon.
