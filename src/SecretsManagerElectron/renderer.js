// Monaco Editor loader
let appSettingsEditor = null;
let secretsEditor = null;
let localSettingsEditor = null;
let currentProject = null;
let currentFolderPath = null;
let isDirty = false;
let isLocalSettingsDirty = false;
let activeTab = 'secrets'; // 'secrets' or 'localSettings'
let platform = 'win32'; // Default, will be updated on init
let isDemoMode = false;
let demoData = null;
let currentValidationError = null;

// Load Monaco Editor
const monacoPath = './node_modules/monaco-editor/min/vs';

// Create script loader for Monaco
function loadMonaco() {
  return new Promise((resolve, reject) => {
    const loaderScript = document.createElement('script');
    loaderScript.src = `${monacoPath}/loader.js`;
    loaderScript.onload = () => {
      require.config({ paths: { vs: monacoPath } });
      require(['vs/editor/editor.main'], () => {
        resolve();
      });
    };
    loaderScript.onerror = reject;
    document.head.appendChild(loaderScript);
  });
}

// Initialize Monaco editors
async function initEditors() {
  await loadMonaco();

  // Define custom dark theme
  monaco.editor.defineTheme('secrets-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#1e1e1e',
      'editor.foreground': '#d4d4d4',
      'editorLineNumber.foreground': '#858585',
      'editor.lineHighlightBackground': '#2d2d2d',
    }
  });

  // Configure JSON language to allow comments
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: true,
    trailingCommas: 'warning'
  });

  // AppSettings editor (read-only)
  appSettingsEditor = monaco.editor.create(document.getElementById('appSettingsEditor'), {
    value: '{}',
    language: 'json',
    theme: 'secrets-dark',
    readOnly: true,
    minimap: { enabled: false },
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    automaticLayout: true,
    fontSize: 13,
    fontFamily: "'SF Mono', Monaco, Consolas, 'Courier New', monospace",
    wordWrap: 'off',
    folding: true,
    renderLineHighlight: 'line',
  });

  // Secrets editor (editable)
  secretsEditor = monaco.editor.create(document.getElementById('secretsEditor'), {
    value: '{\n  \n}',
    language: 'json',
    theme: 'secrets-dark',
    minimap: { enabled: false },
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    automaticLayout: true,
    fontSize: 13,
    fontFamily: "'SF Mono', Monaco, Consolas, 'Courier New', monospace",
    wordWrap: 'off',
    folding: true,
    renderLineHighlight: 'line',
    formatOnPaste: true,
    formatOnType: true,
  });

  // Local settings editor (editable, for Azure Functions)
  localSettingsEditor = monaco.editor.create(document.getElementById('localSettingsEditor'), {
    value: '{}',
    language: 'json',
    theme: 'secrets-dark',
    minimap: { enabled: false },
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    automaticLayout: true,
    fontSize: 13,
    fontFamily: "'SF Mono', Monaco, Consolas, 'Courier New', monospace",
    wordWrap: 'off',
    folding: true,
    renderLineHighlight: 'line',
    formatOnPaste: true,
    formatOnType: true,
  });

  // Track changes
  secretsEditor.onDidChangeModelContent(() => {
    isDirty = true;
    if (activeTab === 'secrets') {
      updateSaveButton();
    }
    updateHeaderValidation();
  });

  // Track local settings changes
  localSettingsEditor.onDidChangeModelContent(() => {
    isLocalSettingsDirty = true;
    if (activeTab === 'localSettings') {
      updateSaveButton();
    }
    updateHeaderValidation();
  });
}

// Switch between tabs
function switchTab(tab) {
  activeTab = tab;
  
  const secretsTab = document.getElementById('secretsTab');
  const localSettingsTab = document.getElementById('localSettingsTab');
  const secretsEditorEl = document.getElementById('secretsEditor');
  const localSettingsEditorEl = document.getElementById('localSettingsEditor');
  
  if (tab === 'secrets') {
    secretsTab.classList.add('active');
    localSettingsTab.classList.remove('active');
    secretsEditorEl.style.display = 'block';
    localSettingsEditorEl.style.display = 'none';
    secretsEditor.layout();
  } else {
    secretsTab.classList.remove('active');
    localSettingsTab.classList.add('active');
    secretsEditorEl.style.display = 'none';
    localSettingsEditorEl.style.display = 'block';
    localSettingsEditor.layout();
  }
  
  updateSaveButton();
  updateHeaderValidation();
}

// Validate JSON for current active editor
function validateCurrentEditor() {
  if (activeTab === 'secrets') {
    return validateSecretsJson();
  } else {
    return validateLocalSettingsJson();
  }
}

// Strip comments from JSONC content for parsing
function stripJsonComments(content) {
  // Remove single-line comments (// ...)
  // Remove multi-line comments (/* ... */)
  let result = '';
  let i = 0;
  let inString = false;
  let stringChar = '';
  
  while (i < content.length) {
    // Handle strings (don't strip comments inside strings)
    if (!inString && (content[i] === '"' || content[i] === "'")) {
      inString = true;
      stringChar = content[i];
      result += content[i];
      i++;
      continue;
    }
    
    if (inString) {
      if (content[i] === '\\' && i + 1 < content.length) {
        result += content[i] + content[i + 1];
        i += 2;
        continue;
      }
      if (content[i] === stringChar) {
        inString = false;
      }
      result += content[i];
      i++;
      continue;
    }
    
    // Handle single-line comments
    if (content[i] === '/' && i + 1 < content.length && content[i + 1] === '/') {
      // Skip until end of line
      while (i < content.length && content[i] !== '\n') {
        i++;
      }
      continue;
    }
    
    // Handle multi-line comments
    if (content[i] === '/' && i + 1 < content.length && content[i + 1] === '*') {
      i += 2;
      while (i < content.length && !(content[i] === '*' && i + 1 < content.length && content[i + 1] === '/')) {
        i++;
      }
      i += 2; // Skip */
      continue;
    }
    
    result += content[i];
    i++;
  }
  
  return result;
}

// Parse JSONC and return result with error details
function parseJsonc(content) {
  const stripped = stripJsonComments(content);
  try {
    JSON.parse(stripped);
    return { valid: true, error: null };
  } catch (e) {
    // Extract line and column from error message if possible
    const match = e.message.match(/at position (\d+)/);
    let errorMsg = e.message;
    
    if (match) {
      const pos = parseInt(match[1]);
      // Find line and column in original content (not stripped)
      let line = 1;
      let col = 1;
      for (let i = 0; i < pos && i < content.length; i++) {
        if (content[i] === '\n') {
          line++;
          col = 1;
        } else {
          col++;
        }
      }
      
      // Get context around the error position
      const lines = content.split('\n');
      const errorLine = lines[line - 1] || '';
      const prevLine = line > 1 ? lines[line - 2] : '';
      
      // Analyze the error and provide helpful message
      errorMsg = getHelpfulErrorMessage(e.message, line, errorLine, prevLine);
    }
    
    return { valid: false, error: errorMsg };
  }
}

// Provide more helpful JSON error messages
function getHelpfulErrorMessage(originalError, line, errorLine, prevLine) {
  const lowerError = originalError.toLowerCase();
  const trimmedErrorLine = errorLine.trim();
  const trimmedPrevLine = prevLine.trim();
  
  // Check for trailing comma on previous line
  if (trimmedPrevLine.endsWith(',') && (trimmedErrorLine.startsWith('}') || trimmedErrorLine.startsWith(']'))) {
    return `Line ${line - 1}: Trailing comma before closing bracket. Remove the comma at the end of line ${line - 1}.`;
  }
  
  // Check for missing comma on previous line
  if (trimmedPrevLine && !trimmedPrevLine.endsWith(',') && !trimmedPrevLine.endsWith('{') && 
      !trimmedPrevLine.endsWith('[') && !trimmedPrevLine.endsWith(':') &&
      trimmedErrorLine && !trimmedErrorLine.startsWith('}') && !trimmedErrorLine.startsWith(']')) {
    if (lowerError.includes('expected') || lowerError.includes('unexpected')) {
      return `Line ${line - 1}: Missing comma. Add a comma at the end of line ${line - 1}.`;
    }
  }
  
  // Trailing comma before end of object/array
  if (lowerError.includes('unexpected token') && (trimmedErrorLine.startsWith('}') || trimmedErrorLine.startsWith(']'))) {
    return `Line ${line}: Unexpected closing bracket. Check for a trailing comma on the previous line.`;
  }
  
  // Missing colon
  if (lowerError.includes('expected \':\'') || (lowerError.includes('unexpected') && errorLine.includes('"') && !errorLine.includes(':'))) {
    return `Line ${line}: Missing colon after property name.`;
  }
  
  // Unterminated string
  if (lowerError.includes('unterminated string') || lowerError.includes('bad string')) {
    return `Line ${line}: Unterminated string. Check for missing closing quote.`;
  }
  
  // Unexpected end
  if (lowerError.includes('unexpected end') || lowerError.includes('end of json')) {
    return `Missing closing bracket or brace. Check that all { } and [ ] are properly matched.`;
  }
  
  // Single quotes instead of double quotes
  if (errorLine.includes("'")) {
    return `Line ${line}: JSON requires double quotes ("), not single quotes (').`;
  }
  
  // Generic unexpected token
  if (lowerError.includes('unexpected token')) {
    return `Line ${line}: Syntax error. Common causes: missing comma on previous line, trailing comma, or unquoted string.`;
  }
  
  // Fallback to cleaned up original message
  const cleanError = originalError
    .replace(/at position \d+/gi, '')
    .replace(/in JSON/gi, '')
    .replace(/Unexpected token/gi, 'Syntax error')
    .trim();
  
  return `Line ${line}: ${cleanError}`;
}

// Validate JSON in secrets editor
function validateSecretsJson() {
  const content = secretsEditor.getValue();
  return parseJsonc(content).valid;
}

// Validate JSON in local settings editor  
function validateLocalSettingsJson() {
  const content = localSettingsEditor.getValue();
  return parseJsonc(content).valid;
}

// Update header validation status (shows status for active tab)
function updateHeaderValidation() {
  const statusEl = document.getElementById('validationStatus');
  const editor = activeTab === 'secrets' ? secretsEditor : localSettingsEditor;
  const content = editor.getValue();
  const result = parseJsonc(content);
  
  if (result.valid) {
    statusEl.textContent = '✓ Valid JSON';
    statusEl.className = 'validation-status valid';
    statusEl.style.cursor = 'default';
    currentValidationError = null;
  } else {
    statusEl.textContent = '✗ Invalid JSON';
    statusEl.className = 'validation-status invalid';
    statusEl.style.cursor = 'pointer';
    currentValidationError = result.error;
  }
}

// Show validation error popup
function showValidationErrorPopup() {
  if (!currentValidationError) return;
  
  // Remove any existing popup
  const existingPopup = document.querySelector('.error-popup');
  if (existingPopup) existingPopup.remove();
  
  const popup = document.createElement('div');
  popup.className = 'error-popup';
  popup.innerHTML = `
    <div class="error-popup-header">
      <span class="error-popup-title">⚠️ JSON Validation Error</span>
      <button class="error-popup-close">✕</button>
    </div>
    <div class="error-popup-content">${currentValidationError}</div>
  `;
  
  document.body.appendChild(popup);
  
  // Position near the validation status
  const statusEl = document.getElementById('validationStatus');
  const statusRect = statusEl.getBoundingClientRect();
  popup.style.top = `${statusRect.bottom + 8}px`;
  popup.style.right = `${window.innerWidth - statusRect.right}px`;
  
  // Close button handler
  popup.querySelector('.error-popup-close').addEventListener('click', () => {
    popup.remove();
  });
  
  // Close on click outside
  const closePopup = (event) => {
    if (!popup.contains(event.target) && event.target !== statusEl) {
      popup.remove();
      document.removeEventListener('click', closePopup);
    }
  };
  
  setTimeout(() => {
    document.addEventListener('click', closePopup);
  }, 0);
}

// Update save button state
function updateSaveButton() {
  const saveBtn = document.getElementById('saveBtn');
  if (activeTab === 'secrets') {
    saveBtn.disabled = !isDirty;
  } else {
    saveBtn.disabled = !isLocalSettingsDirty;
  }
}

// Format JSON in current editor (preserves comments at end)
function formatJson() {
  const editor = activeTab === 'secrets' ? secretsEditor : localSettingsEditor;
  const content = editor.getValue();
  const stripped = stripJsonComments(content);
  
  try {
    const parsed = JSON.parse(stripped);
    const formatted = JSON.stringify(parsed, null, 2);
    
    // Try to preserve trailing comments
    const trailingComments = content.match(/\n*(\/\/[^\n]*\n*|\/\*[\s\S]*?\*\/\s*)*$/);
    if (trailingComments && trailingComments[0].trim()) {
      editor.setValue(formatted + '\n' + trailingComments[0].trim());
    } else {
      editor.setValue(formatted);
    }
  } catch (e) {
    // Invalid JSON, can't format
  }
}

// Load project
async function loadProject(project) {
  currentProject = project;
  
  // Update UI
  document.getElementById('welcomeScreen').style.display = 'none';
  document.getElementById('editorScreen').style.display = 'flex';
  document.getElementById('projectName').textContent = project.name;
  document.getElementById('userSecretsId').textContent = project.userSecretsId;
  
  // Show/hide local settings tab for Azure Functions
  const localSettingsTab = document.getElementById('localSettingsTab');
  
  if (project.isAzureFunctions && project.localSettingsPath) {
    localSettingsTab.style.display = 'inline-flex';
    
    // Load local.settings.json (use demo data if in demo mode)
    if (isDemoMode && demoData) {
      localSettingsEditor.setValue(demoData.demoLocalSettings);
    } else {
      const localSettingsContent = await window.electronAPI.loadAppSettings(project.localSettingsPath);
      localSettingsEditor.setValue(localSettingsContent);
    }
    isLocalSettingsDirty = false;
  } else {
    localSettingsTab.style.display = 'none';
    // Switch to secrets tab if local settings was active
    if (activeTab === 'localSettings') {
      switchTab('secrets');
    }
  }
  
  // Load secrets (use demo data if in demo mode)
  if (isDemoMode && demoData) {
    // Use invalid JSON for the project marked with hasInvalidJson
    if (project.hasInvalidJson) {
      secretsEditor.setValue(demoData.demoInvalidSecrets);
    } else {
      secretsEditor.setValue(demoData.demoSecrets);
    }
  } else {
    const secretsContent = await window.electronAPI.loadSecrets(project.secretsFilePath);
    secretsEditor.setValue(secretsContent);
  }
  isDirty = false;
  
  // Reset to secrets tab and update UI
  switchTab('secrets');
  updateHeaderValidation();
  
  // Load appsettings dropdown
  const select = document.getElementById('appSettingsSelect');
  select.innerHTML = '';
  
  if (project.appSettingsFiles.length === 0) {
    select.innerHTML = '<option value="">No appsettings files</option>';
    appSettingsEditor.setValue('{}');
  } else {
    for (const file of project.appSettingsFiles) {
      const option = document.createElement('option');
      option.value = file;
      // Show just the filename
      const fileName = file.split(/[\\/]/).pop();
      option.textContent = fileName;
      select.appendChild(option);
    }
    // Load first appsettings file
    await loadAppSettings(project.appSettingsFiles[0]);
  }
  
  // Update active state in list
  document.querySelectorAll('.project-list li').forEach(li => li.classList.remove('active'));
  const activeItem = document.querySelector(`.project-list li[data-path="${project.projectPath}"]`);
  if (activeItem) activeItem.classList.add('active');
}

// Load appsettings file
async function loadAppSettings(filePath) {
  // Use demo data if in demo mode
  if (isDemoMode && demoData) {
    appSettingsEditor.setValue(demoData.demoAppSettings);
    return;
  }
  const content = await window.electronAPI.loadAppSettings(filePath);
  appSettingsEditor.setValue(content);
}

// Save secrets
async function saveSecrets() {
  if (!currentProject || !isDirty) return;
  
  if (!validateSecretsJson()) {
    alert('Cannot save invalid JSON. Please fix the errors first.');
    return;
  }
  
  const content = secretsEditor.getValue();
  const result = await window.electronAPI.saveSecrets(currentProject.secretsFilePath, content);
  
  if (result.success) {
    isDirty = false;
    updateSaveButton();
  } else {
    alert(`Error saving secrets: ${result.error}`);
  }
}

// Save local settings
async function saveLocalSettings() {
  if (!currentProject || !isLocalSettingsDirty || !currentProject.localSettingsPath) return;
  
  if (!validateLocalSettingsJson()) {
    alert('Cannot save invalid JSON. Please fix the errors first.');
    return;
  }
  
  const content = localSettingsEditor.getValue();
  const result = await window.electronAPI.saveLocalSettings(currentProject.localSettingsPath, content);
  
  if (result.success) {
    isLocalSettingsDirty = false;
    updateSaveButton();
  } else {
    alert(`Error saving local.settings.json: ${result.error}`);
  }
}

// Save current editor (based on active tab)
async function saveCurrentEditor() {
  if (activeTab === 'secrets') {
    await saveSecrets();
  } else {
    await saveLocalSettings();
  }
}

// Open folder and scan for projects
// Get relative path from base folder
function getRelativePath(fullPath, basePath) {
  // Normalize path separators
  const normalizedFull = fullPath.replace(/\\/g, '/');
  const normalizedBase = basePath.replace(/\\/g, '/');
  
  if (normalizedFull.startsWith(normalizedBase)) {
    let relative = normalizedFull.substring(normalizedBase.length);
    if (relative.startsWith('/')) relative = relative.substring(1);
    return relative || '.';
  }
  return fullPath;
}

async function openFolder() {
  const folderPath = await window.electronAPI.openFolder();
  if (!folderPath) return;
  
  currentFolderPath = folderPath;
  
  // Display folder path
  const folderPathEl = document.getElementById('folderPath');
  folderPathEl.textContent = folderPath;
  folderPathEl.title = folderPath;
  folderPathEl.style.display = 'block';
  
  const projectList = document.getElementById('projectList');
  projectList.innerHTML = '<li class="empty-state">Scanning...</li>';
  
  const projects = await window.electronAPI.scanDirectory(folderPath);
  
  if (projects.length === 0) {
    projectList.innerHTML = '<li class="empty-state">No projects with User Secrets found</li>';
    return;
  }
  
  projectList.innerHTML = '';
  for (const project of projects) {
    const li = document.createElement('li');
    li.dataset.path = project.projectPath;
    li.dataset.projectDir = project.projectDir;
    const relativePath = getRelativePath(project.projectPath, folderPath);
    li.innerHTML = `
      <div class="project-name">${project.name}</div>
      <div class="project-path" title="${project.projectPath}">${relativePath}</div>
    `;
    li.addEventListener('click', () => loadProject(project));
    li.addEventListener('contextmenu', (e) => showProjectContextMenu(e, project));
    projectList.appendChild(li);
  }
}

// Show context menu for project
function showProjectContextMenu(e, project) {
  e.preventDefault();
  
  // Remove any existing context menu
  const existingMenu = document.querySelector('.context-menu');
  if (existingMenu) existingMenu.remove();
  
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  
  const openInExplorerLabel = platform === 'darwin' ? 'Open in Finder' : 'Open in Explorer';
  
  menu.innerHTML = `
    <div class="context-menu-item" data-action="open-explorer">
      <span class="icon">📂</span> ${openInExplorerLabel}
    </div>
  `;
  
  menu.style.left = `${e.clientX}px`;
  menu.style.top = `${e.clientY}px`;
  
  document.body.appendChild(menu);
  
  // Handle menu item click
  menu.querySelector('[data-action="open-explorer"]').addEventListener('click', () => {
    window.electronAPI.openInExplorer(project.projectPath);
    menu.remove();
  });
  
  // Close menu on click outside
  const closeMenu = (event) => {
    if (!menu.contains(event.target)) {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    }
  };
  
  // Delay adding click listener to prevent immediate close
  setTimeout(() => {
    document.addEventListener('click', closeMenu);
  }, 0);
}

// Load demo data for screenshots
async function loadDemoData() {
  if (!demoData) return;
  
  currentFolderPath = demoData.folderPath;
  
  // Display folder path
  const folderPathEl = document.getElementById('folderPath');
  folderPathEl.textContent = demoData.folderPath;
  folderPathEl.title = demoData.folderPath;
  folderPathEl.style.display = 'block';
  
  const projectList = document.getElementById('projectList');
  projectList.innerHTML = '';
  
  for (const project of demoData.projects) {
    const li = document.createElement('li');
    li.dataset.path = project.projectPath;
    li.dataset.projectDir = project.projectDir;
    const relativePath = getRelativePath(project.projectPath, demoData.folderPath);
    li.innerHTML = `
      <div class="project-name">${project.name}</div>
      <div class="project-path" title="${project.projectPath}">${relativePath}</div>
    `;
    li.addEventListener('click', () => loadProject(project));
    li.addEventListener('contextmenu', (e) => showProjectContextMenu(e, project));
    projectList.appendChild(li);
  }
  
  // Auto-select the first project
  if (demoData.projects.length > 0) {
    await loadProject(demoData.projects[0]);
  }
}

// Filter projects
function filterProjects(searchTerm) {
  const items = document.querySelectorAll('.project-list li:not(.empty-state)');
  const term = searchTerm.toLowerCase();
  
  items.forEach(item => {
    const name = item.querySelector('.project-name')?.textContent.toLowerCase() || '';
    const path = item.querySelector('.project-path')?.textContent.toLowerCase() || '';
    item.style.display = (name.includes(term) || path.includes(term)) ? '' : 'none';
  });
}

// Initialize app
async function init() {
  await initEditors();
  
  // Get platform for context menu labels
  platform = await window.electronAPI.getPlatform();
  
  // Check for demo mode
  isDemoMode = await window.electronAPI.isDemoMode();
  if (isDemoMode) {
    demoData = await window.electronAPI.getDemoData();
    await loadDemoData();
  }
  
  // Event listeners
  document.getElementById('openFolderBtn').addEventListener('click', openFolder);
  document.getElementById('welcomeOpenBtn').addEventListener('click', openFolder);
  document.getElementById('saveBtn').addEventListener('click', saveCurrentEditor);
  document.getElementById('formatBtn').addEventListener('click', formatJson);
  document.getElementById('validationStatus').addEventListener('click', showValidationErrorPopup);
  document.getElementById('searchInput').addEventListener('input', (e) => filterProjects(e.target.value));
  
  // Tab switching
  document.getElementById('secretsTab').addEventListener('click', () => switchTab('secrets'));
  document.getElementById('localSettingsTab').addEventListener('click', () => switchTab('localSettings'));
  
  document.getElementById('appSettingsSelect').addEventListener('change', async (e) => {
    if (e.target.value) {
      await loadAppSettings(e.target.value);
    }
  });
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      saveCurrentEditor();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
      e.preventDefault();
      openFolder();
    }
  });
  
  // Panel resizer (between AppSettings and Secrets)
  const resizer = document.querySelector('.panel-resizer');
  const appSettingsPanel = document.querySelector('.appsettings-panel');
  let isResizing = false;
  
  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  // Sidebar resizer
  const sidebarResizer = document.getElementById('sidebarResizer');
  const sidebar = document.getElementById('sidebar');
  let isSidebarResizing = false;
  
  sidebarResizer.addEventListener('mousedown', (e) => {
    isSidebarResizing = true;
    sidebarResizer.classList.add('resizing');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });
  
  document.addEventListener('mousemove', (e) => {
    if (isSidebarResizing) {
      const newWidth = e.clientX;
      if (newWidth >= 180 && newWidth <= 500) {
        sidebar.style.width = `${newWidth}px`;
      }
    }
    if (isResizing) {
      const containerRect = document.querySelector('.editor-panels').getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;
      if (newWidth >= 200 && newWidth <= containerRect.width - 300) {
        appSettingsPanel.style.flex = 'none';
        appSettingsPanel.style.width = `${newWidth}px`;
      }
    }
  });
  
  document.addEventListener('mouseup', () => {
    if (isSidebarResizing) {
      isSidebarResizing = false;
      sidebarResizer.classList.remove('resizing');
    }
    isResizing = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}

// Start app
init().catch(console.error);
