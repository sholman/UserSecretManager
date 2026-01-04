const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');

async function takeScreenshots() {
  console.log('Launching app in demo mode...');
  
  const appPath = path.join(__dirname, '..');
  
  const electronApp = await electron.launch({
    args: [appPath, '--demo']
  });

  const window = await electronApp.firstWindow();
  
  // Maximize the window for full screen screenshot
  await electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.maximize();
  });
  
  // Wait for app to fully load
  await window.waitForLoadState('domcontentloaded');
  await window.waitForTimeout(2000);

  // Ensure docs directory exists
  const docsDir = path.join(__dirname, '..', '..', '..', 'docs');
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  // Take main screenshot
  console.log('Taking main screenshot...');
  await window.screenshot({ 
    path: path.join(docsDir, 'screenshot.png'),
    animations: 'disabled'
  });
  console.log('Saved: docs/screenshot.png');

  // Click on a project to show the editor (if projects are loaded)
  try {
    const projectItem = await window.$('.project-item');
    if (projectItem) {
      await projectItem.click();
      await window.waitForTimeout(1000);
      
      console.log('Taking editor screenshot...');
      await window.screenshot({ 
        path: path.join(docsDir, 'screenshot-editor.png'),
        animations: 'disabled'
      });
      console.log('Saved: docs/screenshot-editor.png');
    }
  } catch (e) {
    console.log('Could not capture editor view:', e.message);
  }

  // Close app
  await electronApp.close();
  console.log('Done!');
}

takeScreenshots().catch(console.error);
