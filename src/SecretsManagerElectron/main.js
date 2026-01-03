const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: 'hiddenInset',
    title: '.NET User Secrets Manager'
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Get the user secrets base path based on OS
function getUserSecretsBasePath() {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA, 'Microsoft', 'UserSecrets');
  } else {
    return path.join(os.homedir(), '.microsoft', 'usersecrets');
  }
}

// Scan directory for .csproj files with UserSecretsId
async function scanDirectory(dirPath) {
  const projects = [];
  const seenUserSecretsIds = new Set();

  async function scan(dir) {
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          // Skip common non-project directories
          if (['node_modules', 'bin', 'obj', '.git', '.vs', '.idea', 'packages'].includes(entry.name)) {
            continue;
          }
          await scan(fullPath);
        } else if (entry.name.endsWith('.csproj')) {
          const project = await parseProject(fullPath);
          if (project && !seenUserSecretsIds.has(project.userSecretsId)) {
            seenUserSecretsIds.add(project.userSecretsId);
            projects.push(project);
          }
        }
      }
    } catch (err) {
      console.error(`Error scanning ${dir}:`, err);
    }
  }

  await scan(dirPath);
  return projects.sort((a, b) => a.name.localeCompare(b.name));
}

// Parse a .csproj file to extract UserSecretsId and find appsettings files
async function parseProject(projectPath) {
  try {
    const content = await fs.promises.readFile(projectPath, 'utf-8');
    const match = content.match(/<UserSecretsId>([^<]+)<\/UserSecretsId>/);
    
    if (!match) return null;

    const userSecretsId = match[1];
    const projectDir = path.dirname(projectPath);
    const projectName = path.basename(projectPath, '.csproj');
    
    // Check if this is an Azure Functions project
    const isAzureFunctions = await checkIfAzureFunctions(projectDir, content);
    
    // Find appsettings files and sort them (appsettings.json first)
    const appSettingsFiles = [];
    let localSettingsPath = null;
    
    try {
      const files = await fs.promises.readdir(projectDir);
      for (const file of files) {
        if (file.startsWith('appsettings') && file.endsWith('.json')) {
          appSettingsFiles.push(path.join(projectDir, file));
        }
        // Check for local.settings.json (Azure Functions)
        if (file === 'local.settings.json') {
          localSettingsPath = path.join(projectDir, file);
        }
      }
      
      // Sort appsettings files: appsettings.json first, then alphabetically
      appSettingsFiles.sort((a, b) => {
        const aName = path.basename(a);
        const bName = path.basename(b);
        if (aName === 'appsettings.json') return -1;
        if (bName === 'appsettings.json') return 1;
        return aName.localeCompare(bName);
      });
    } catch (err) {
      // Ignore errors reading directory
    }

    // Get secrets file path
    const secretsFilePath = path.join(getUserSecretsBasePath(), userSecretsId, 'secrets.json');
    const secretsFileExists = fs.existsSync(secretsFilePath);

    return {
      name: projectName,
      projectPath,
      projectDir,
      userSecretsId,
      secretsFilePath,
      secretsFileExists,
      appSettingsFiles,
      isAzureFunctions,
      localSettingsPath
    };
  } catch (err) {
    console.error(`Error parsing ${projectPath}:`, err);
    return null;
  }
}

// Check if project is an Azure Functions app
async function checkIfAzureFunctions(projectDir, csprojContent) {
  // Check for Azure Functions SDK reference in csproj
  if (csprojContent.includes('Microsoft.NET.Sdk.Functions') || 
      csprojContent.includes('Microsoft.Azure.Functions') ||
      csprojContent.includes('Azure.Functions')) {
    return true;
  }
  
  // Check for host.json file (Azure Functions indicator)
  try {
    const hostJsonPath = path.join(projectDir, 'host.json');
    await fs.promises.access(hostJsonPath);
    return true;
  } catch {
    return false;
  }
}

// Load secrets content
async function loadSecrets(secretsFilePath) {
  try {
    if (fs.existsSync(secretsFilePath)) {
      const content = await fs.promises.readFile(secretsFilePath, 'utf-8');
      return content;
    }
    return '{\n  \n}';
  } catch (err) {
    console.error('Error loading secrets:', err);
    return '{\n  \n}';
  }
}

// Save secrets content
async function saveSecrets(secretsFilePath, content) {
  try {
    const dir = path.dirname(secretsFilePath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(secretsFilePath, content, 'utf-8');
    return { success: true };
  } catch (err) {
    console.error('Error saving secrets:', err);
    return { success: false, error: err.message };
  }
}

// Save local.settings.json content
async function saveLocalSettings(filePath, content) {
  try {
    await fs.promises.writeFile(filePath, content, 'utf-8');
    return { success: true };
  } catch (err) {
    console.error('Error saving local.settings.json:', err);
    return { success: false, error: err.message };
  }
}

// Load appsettings file content
async function loadAppSettings(filePath) {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return content;
  } catch (err) {
    console.error('Error loading appsettings:', err);
    return '{}';
  }
}

// IPC Handlers
ipcMain.handle('open-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select folder to scan for .NET projects'
  });
  
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  
  return result.filePaths[0];
});

ipcMain.handle('scan-directory', async (event, dirPath) => {
  return await scanDirectory(dirPath);
});

ipcMain.handle('load-secrets', async (event, secretsFilePath) => {
  return await loadSecrets(secretsFilePath);
});

ipcMain.handle('save-secrets', async (event, secretsFilePath, content) => {
  return await saveSecrets(secretsFilePath, content);
});

ipcMain.handle('save-local-settings', async (event, filePath, content) => {
  return await saveLocalSettings(filePath, content);
});

ipcMain.handle('load-appsettings', async (event, filePath) => {
  return await loadAppSettings(filePath);
});
