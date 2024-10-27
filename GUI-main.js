// GUI
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { spawn } = require('child_process');

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 1200,
    webPreferences: {
      preload: path.join(__dirname, 'GUI-preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
  });

  win.loadFile('GUI-index.html');
}

// Handle data from the renderer process (GUI)
ipcMain.on('parameters', (event, data) => {
  // Generate .env file content based on the data received
  const envContent = `
experiment=${data.experiment}
group_table_name=${data.group_table_name}
max_turnpoint=${data.max_turnpoint}
trial_per_participant_per_label=${data.trial_per_participant_per_label}
trial_per_participant_per_class=${data.trial_per_participant_per_class}
class_questions=${data.class_questions}
classes=${data.classes}
dim=${data.dim}
n_chain=${data.n_chain}
mode=${data.mode}`;

  // Write to the .env file
  const envPath = path.join(__dirname, '.env');
  fs.writeFileSync(envPath, envContent, { flag: 'w' });
  // Execute additional terminal commands if needed
  // Here we simply print a success message back to the renderer
  event.reply('submit-success', '.env file has been updated successfully!');
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  console.log('quit setting up');
  // if (process.platform !== 'darwin') 
  app.quit();
});

// app.on('activate', () => {
//   if (BrowserWindow.getAllWindows().length === 0) createWindow();
// });

ipcMain.on('docker', (event, data) => {
  // Update .env file code (same as before)

  // Example terminal command after .env update
  if (data==='build') {
    event.reply('docker-success', `Experiment is building, after seeing 'Server running on port 8080' below, you can visit http://localhost:8080`);
    const dockerProcess = spawn('docker', ['compose', 'up', '--build']);
    // Listen for standard output from the Docker process
    dockerProcess.stdout.on('data', (data) => {
      event.reply('docker-output', data.toString());
    });

    // Listen for error output from the Docker process
    dockerProcess.stderr.on('data', (data) => {
      event.reply('docker-output', data.toString());
    });

    // Listen for the close event when the process is finished
    // dockerProcess.on('close', (code) => {
    //   event.reply('docker-success', `Docker build process exited with code ${code}, now you can visit http://localhost:8080`);
    // });

  } else if (data==='finish') {
    app.quit();
  }
  // setTimeout(() => {
  //   app.quit();
  // }, 1000); 
});

// { experiment, group_table_name, max_turnpoint,  
//   trial_per_participant_per_label, trial_per_participant_per_class, classes, class_questions, dim, n_chain, mode}