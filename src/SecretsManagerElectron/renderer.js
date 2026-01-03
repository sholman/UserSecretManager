// Monaco Editor loader
let appSettingsEditor = null;
let secretsEditor = null;
let localSettingsEditor = null;
let currentProject = null;
let isDirty = false;
let isLocalSettingsDirty = false;
let activeTab = 'secrets'; // 'secrets' or 'localSettings'

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
      updateValidationBadge();
    }
    updateHeaderValidation();
  });

  // Track local settings changes
  localSettingsEditor.onDidChangeModelContent(() => {
    isLocalSettingsDirty = true;
    if (activeTab === 'localSettings') {
      updateSaveButton();
      updateValidationBadge();
    }
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
  updateValidationBadge();
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
      // Find line and column
      let line = 1;
      let col = 1;
      for (let i = 0; i < pos && i < stripped.length; i++) {
        if (stripped[i] === '\n') {
          line++;
          col = 1;
        } else {
          col++;
        }
      }
      errorMsg = `Line ${line}, Col ${col}: ${e.message.replace(/at position \d+/, '').trim()}`;
    }
    
    return { valid: false, error: errorMsg };
  }
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

// Update header validation status (always shows secrets status)
function updateHeaderValidation() {
  const statusEl = document.getElementById('validationStatus');
  const content = secretsEditor.getValue();
  const result = parseJsonc(content);
  
  if (result.valid) {
    statusEl.textContent = '✓ Valid JSON';
    statusEl.className = 'validation-status valid';
    statusEl.title = '';
  } else {
    statusEl.textContent = '✗ Invalid JSON';
    statusEl.className = 'validation-status invalid';
    statusEl.title = result.error;
  }
}

// Update validation badge in panel header
function updateValidationBadge() {
  const badgeEl = document.getElementById('validationBadge');
  const errorEl = document.getElementById('validationError');
  const editor = activeTab === 'secrets' ? secretsEditor : localSettingsEditor;
  const content = editor.getValue();
  const result = parseJsonc(content);
  
  if (result.valid) {
    badgeEl.textContent = '✓';
    badgeEl.className = 'validation-badge valid';
    errorEl.style.display = 'none';
  } else {
    badgeEl.textContent = '✗';
    badgeEl.className = 'validation-badge invalid';
    errorEl.textContent = result.error;
    errorEl.style.display = 'inline';
  }
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
    
    // Load local.settings.json
    const localSettingsContent = await window.electronAPI.loadAppSettings(project.localSettingsPath);
    localSettingsEditor.setValue(localSettingsContent);
    isLocalSettingsDirty = false;
  } else {
    localSettingsTab.style.display = 'none';
    // Switch to secrets tab if local settings was active
    if (activeTab === 'localSettings') {
      switchTab('secrets');
    }
  }
  
  // Load secrets
  const secretsContent = await window.electronAPI.loadSecrets(project.secretsFilePath);
  secretsEditor.setValue(secretsContent);
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
      option.textContent = file.split('/').pop();
      select.appendChild(option);
    }
    // Load first appsettings file (should be appsettings.json due to sorting)
    await loadAppSettings(project.appSettingsFiles[0]);
  }
  
  // Update active state in list
  document.querySelectorAll('.project-list li').forEach(li => li.classList.remove('active'));
  const activeItem = document.querySelector(`.project-list li[data-path="${project.projectPath}"]`);
  if (activeItem) activeItem.classList.add('active');
}

// Load appsettings file
async function loadAppSettings(filePath) {
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
async function openFolder() {
  const folderPath = await window.electronAPI.openFolder();
  if (!folderPath) return;
  
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
    li.innerHTML = `
      <div class="project-name">${project.name}</div>
      <div class="project-path">${project.projectPath}</div>
    `;
    li.addEventListener('click', () => loadProject(project));
    projectList.appendChild(li);
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
  
  // Event listeners
  document.getElementById('openFolderBtn').addEventListener('click', openFolder);
  document.getElementById('welcomeOpenBtn').addEventListener('click', openFolder);
  document.getElementById('saveBtn').addEventListener('click', saveCurrentEditor);
  document.getElementById('formatBtn').addEventListener('click', formatJson);
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
