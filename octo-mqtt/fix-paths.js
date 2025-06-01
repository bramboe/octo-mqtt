const fs = require('fs');
const path = require('path');

// Directory to search for JS files
const searchDir = './dist';

// Function to recursively find all JS files
function findJsFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      findJsFiles(filePath, fileList);
    } else if (file.endsWith('.js')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

// Function to determine the relative path to the root directory
function getRelativePathToRoot(filePath) {
  // Count the number of directory levels to navigate up to the root
  const dirDepth = filePath.split(path.sep).length - 2; // -2 because ./dist is already 2 levels
  return dirDepth <= 0 ? './' : '../'.repeat(dirDepth);
}

// Function to fix import paths in a file
function fixImportPaths(filePath) {
  console.log(`Processing ${filePath}...`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  const relativeToRoot = getRelativePathToRoot(filePath);
  
  // Create a map of module names to their paths
  const moduleMap = {
    '@mqtt/': `${relativeToRoot}MQTT/`,
    '@utils/': `${relativeToRoot}Utils/`,
    '@ha/': `${relativeToRoot}HomeAssistant/`,
    './MQTT/': `${relativeToRoot}MQTT/`,
    './Utils/': `${relativeToRoot}Utils/`,
    './HomeAssistant/': `${relativeToRoot}HomeAssistant/`,
    './ESPHome/': `${relativeToRoot}ESPHome/`,
    './BLE/': `${relativeToRoot}BLE/`,
    './Octo/': `${relativeToRoot}Octo/`,
    './Scanner/': `${relativeToRoot}Scanner/`,
    './Common/': `${relativeToRoot}Common/`,
    './Strings/': `${relativeToRoot}Strings/`,
    './webui/': `${relativeToRoot}webui/`,
    'HomeAssistant/': `${relativeToRoot}HomeAssistant/`,
    'ESPHome/': `${relativeToRoot}ESPHome/`,
    'BLE/': `${relativeToRoot}BLE/`,
    'Octo/': `${relativeToRoot}Octo/`,
    'Scanner/': `${relativeToRoot}Scanner/`,
    'Common/': `${relativeToRoot}Common/`,
    'Strings/': `${relativeToRoot}Strings/`,
    'webui/': `${relativeToRoot}webui/`,
    'MQTT/': `${relativeToRoot}MQTT/`,
    'Utils/': `${relativeToRoot}Utils/`,
  };
  
  // Replace all module paths
  for (const [oldPath, newPath] of Object.entries(moduleMap)) {
    const regex = new RegExp(`require\\("${oldPath.replace(/\//g, '\\/')}`, 'g');
    content = content.replace(regex, `require("${newPath}`);
  }
  
  fs.writeFileSync(filePath, content, 'utf8');
}

// Find all JS files and fix import paths
const jsFiles = findJsFiles(searchDir);
jsFiles.forEach(fixImportPaths);

console.log(`Fixed import paths in ${jsFiles.length} files.`); 