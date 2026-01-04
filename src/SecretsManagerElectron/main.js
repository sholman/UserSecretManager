const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const os = require('os');

let mainWindow;

// Configure auto-updater
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
let isDemoMode = process.argv.includes('--demo');

function createMenu() {
  const isMac = process.platform === 'darwin';
  
  const template = [
    // App menu (macOS only)
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    // File menu
    {
      label: 'File',
      submenu: [
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    // Edit menu (minimal - just for copy/paste in editor)
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    // View menu
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    // Window menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front' }
        ] : [
          { role: 'close' }
        ])
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

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

// Auto-updater setup
function setupAutoUpdater() {
  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `A new version (${info.version}) is available. Would you like to download it now?`,
      buttons: ['Download', 'Later'],
      defaultId: 0
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
  });

  autoUpdater.on('update-not-available', () => {
    console.log('No updates available');
  });

  autoUpdater.on('download-progress', (progress) => {
    console.log(`Download progress: ${Math.round(progress.percent)}%`);
    mainWindow.webContents.send('update-progress', progress.percent);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded');
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: `Version ${info.version} has been downloaded. Restart now to install?`,
      buttons: ['Restart', 'Later'],
      defaultId: 0
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err);
  });
}

app.whenReady().then(() => {
  createMenu();
  createWindow();
  
  // Check for updates after a short delay (only in production)
  if (!isDemoMode && app.isPackaged) {
    setTimeout(() => {
      setupAutoUpdater();
      autoUpdater.checkForUpdates();
    }, 3000);
  }
});

// IPC handler for manual update check
ipcMain.handle('check-for-updates', async () => {
  if (!app.isPackaged) {
    return { available: false, message: 'Updates are only available in the packaged app' };
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    return { available: result !== null, version: result?.updateInfo?.version };
  } catch (error) {
    return { available: false, error: error.message };
  }
});

// IPC handler for getting app version
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

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

ipcMain.handle('open-in-explorer', async (event, folderPath) => {
  shell.showItemInFolder(folderPath);
});

ipcMain.handle('get-platform', () => {
  return process.platform;
});

ipcMain.handle('is-demo-mode', () => {
  return isDemoMode;
});

ipcMain.handle('get-demo-data', () => {
  const isMac = process.platform === 'darwin';
  const basePath = isMac 
    ? '/Users/developer/Projects/Contoso'
    : 'C:\\Development\\Contoso';
  const sep = isMac ? '/' : '\\';
  const secretsBase = isMac
    ? '/Users/developer/.microsoft/usersecrets'
    : 'C:\\Users\\Developer\\AppData\\Roaming\\Microsoft\\UserSecrets';

  return {
    folderPath: basePath,
    projects: [
      {
        name: 'Contoso.WebApp',
        projectPath: `${basePath}${sep}src${sep}Contoso.WebApp${sep}Contoso.WebApp.csproj`,
        projectDir: `${basePath}${sep}src${sep}Contoso.WebApp`,
        userSecretsId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        secretsFilePath: `${secretsBase}${sep}a1b2c3d4-e5f6-7890-abcd-ef1234567890${sep}secrets.json`,
        secretsFileExists: true,
        appSettingsFiles: [
          `${basePath}${sep}src${sep}Contoso.WebApp${sep}appsettings.json`,
          `${basePath}${sep}src${sep}Contoso.WebApp${sep}appsettings.Development.json`,
          `${basePath}${sep}src${sep}Contoso.WebApp${sep}appsettings.Production.json`
        ],
        isAzureFunctions: false,
        localSettingsPath: null
      },
      {
        name: 'Contoso.Api',
        projectPath: `${basePath}${sep}src${sep}Contoso.Api${sep}Contoso.Api.csproj`,
        projectDir: `${basePath}${sep}src${sep}Contoso.Api`,
        userSecretsId: 'b2c3d4e5-f6a7-8901-bcde-f23456789012',
        secretsFilePath: `${secretsBase}${sep}b2c3d4e5-f6a7-8901-bcde-f23456789012${sep}secrets.json`,
        secretsFileExists: true,
        appSettingsFiles: [
          `${basePath}${sep}src${sep}Contoso.Api${sep}appsettings.json`,
          `${basePath}${sep}src${sep}Contoso.Api${sep}appsettings.Development.json`
        ],
        isAzureFunctions: false,
        localSettingsPath: null
      },
      {
        name: 'Contoso.Functions',
        projectPath: `${basePath}${sep}src${sep}Contoso.Functions${sep}Contoso.Functions.csproj`,
        projectDir: `${basePath}${sep}src${sep}Contoso.Functions`,
        userSecretsId: 'c3d4e5f6-a7b8-9012-cdef-345678901234',
        secretsFilePath: `${secretsBase}${sep}c3d4e5f6-a7b8-9012-cdef-345678901234${sep}secrets.json`,
        secretsFileExists: true,
        appSettingsFiles: [
          `${basePath}${sep}src${sep}Contoso.Functions${sep}appsettings.json`
        ],
        isAzureFunctions: true,
        localSettingsPath: `${basePath}${sep}src${sep}Contoso.Functions${sep}local.settings.json`
      },
      {
        name: 'Contoso.WorkerService',
        projectPath: `${basePath}${sep}src${sep}Contoso.WorkerService${sep}Contoso.WorkerService.csproj`,
        projectDir: `${basePath}${sep}src${sep}Contoso.WorkerService`,
        userSecretsId: 'd4e5f6a7-b8c9-0123-defa-456789012345',
        secretsFilePath: `${secretsBase}${sep}d4e5f6a7-b8c9-0123-defa-456789012345${sep}secrets.json`,
        secretsFileExists: false,
        appSettingsFiles: [
          `${basePath}${sep}src${sep}Contoso.WorkerService${sep}appsettings.json`,
          `${basePath}${sep}src${sep}Contoso.WorkerService${sep}appsettings.Development.json`
        ],
        isAzureFunctions: false,
        localSettingsPath: null
      },
      {
        name: 'Contoso.IdentityServer',
        projectPath: `${basePath}${sep}src${sep}Contoso.IdentityServer${sep}Contoso.IdentityServer.csproj`,
        projectDir: `${basePath}${sep}src${sep}Contoso.IdentityServer`,
        userSecretsId: 'e5f6a7b8-c9d0-1234-efab-567890123456',
        secretsFilePath: `${secretsBase}${sep}e5f6a7b8-c9d0-1234-efab-567890123456${sep}secrets.json`,
        secretsFileExists: true,
        appSettingsFiles: [
          `${basePath}${sep}src${sep}Contoso.IdentityServer${sep}appsettings.json`,
          `${basePath}${sep}src${sep}Contoso.IdentityServer${sep}appsettings.Development.json`,
          `${basePath}${sep}src${sep}Contoso.IdentityServer${sep}appsettings.Production.json`,
          `${basePath}${sep}src${sep}Contoso.IdentityServer${sep}appsettings.Staging.json`
        ],
        isAzureFunctions: false,
        localSettingsPath: null
      },
      {
        name: 'Contoso.BackgroundJobs',
        projectPath: `${basePath}${sep}src${sep}Contoso.BackgroundJobs${sep}Contoso.BackgroundJobs.csproj`,
        projectDir: `${basePath}${sep}src${sep}Contoso.BackgroundJobs`,
        userSecretsId: 'f6a7b8c9-d0e1-2345-fabc-678901234567',
        secretsFilePath: `${secretsBase}${sep}f6a7b8c9-d0e1-2345-fabc-678901234567${sep}secrets.json`,
        secretsFileExists: true,
        appSettingsFiles: [
          `${basePath}${sep}src${sep}Contoso.BackgroundJobs${sep}appsettings.json`
        ],
        isAzureFunctions: false,
        localSettingsPath: null,
        hasInvalidJson: true
      }
    ],
    demoSecrets: JSON.stringify({
      "ConnectionStrings": {
        "DefaultConnection": "Server=localhost;Database=ContosoDb;User Id=sa;Password=**********;",
        "Redis": "localhost:6379,password=**********"
      },
      "Authentication": {
        "Google": {
          "ClientId": "123456789-abcdefghijklmnop.apps.googleusercontent.com",
          "ClientSecret": "GOCSPX-**********"
        },
        "Microsoft": {
          "ClientId": "12345678-1234-1234-1234-123456789012",
          "ClientSecret": "abc123~**********"
        }
      },
      "Smtp": {
        "Host": "smtp.sendgrid.net",
        "Port": 587,
        "Username": "apikey",
        "Password": "SG.**********"
      },
      "Azure": {
        "StorageConnectionString": "DefaultEndpointsProtocol=https;AccountName=contosostorage;AccountKey=**********;EndpointSuffix=core.windows.net",
        "ServiceBusConnectionString": "Endpoint=sb://contoso.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=**********"
      },
      "Stripe": {
        "SecretKey": "sk_test_**********",
        "WebhookSecret": "whsec_**********"
      }
    }, null, 2),
    demoAppSettings: JSON.stringify({
      "Logging": {
        "LogLevel": {
          "Default": "Information",
          "Microsoft.AspNetCore": "Warning"
        }
      },
      "AllowedHosts": "*",
      "ConnectionStrings": {
        "DefaultConnection": "",
        "Redis": ""
      },
      "Authentication": {
        "Google": {
          "ClientId": "",
          "ClientSecret": ""
        },
        "Microsoft": {
          "ClientId": "",
          "ClientSecret": ""
        }
      },
      "Features": {
        "EnableNewDashboard": true,
        "EnableBetaFeatures": false
      }
    }, null, 2),
    demoLocalSettings: JSON.stringify({
      "IsEncrypted": false,
      "Values": {
        "AzureWebJobsStorage": "UseDevelopmentStorage=true",
        "FUNCTIONS_WORKER_RUNTIME": "dotnet-isolated",
        "ServiceBus:Connection": "Endpoint=sb://contoso-dev.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=**********",
        "CosmosDb:Connection": "AccountEndpoint=https://contoso-dev.documents.azure.com:443/;AccountKey=**********;",
        "CosmosDb:DatabaseName": "contoso-db",
        "CosmosDb:ContainerName": "items",
        "Authentication:Google:ClientId": "123456789-abcdefghijklmnop.apps.googleusercontent.com",
        "Authentication:Google:ClientSecret": "GOCSPX-**********",
        "Smtp:Host": "smtp.sendgrid.net",
        "Smtp:Port": "587",
        "Smtp:ApiKey": "SG.**********",
        "FeatureFlags:EnableNewFeature": "true",
        "FeatureFlags:MaxRetryCount": "3"
      }
    }, null, 2),
    demoInvalidSecrets: `{
  "ConnectionStrings": {
    "DefaultConnection": "Server=localhost;Database=JobsDb;Password=**********"
    "Redis": "localhost:6379"
  },
  "ApiKeys": {
    "SendGrid": "SG.**********",
  }
}`
  };
});
