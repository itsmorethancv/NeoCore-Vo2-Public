#!/usr/bin/env node
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

// Wait for Vite to be ready on any port from 5173-5180
async function waitForVite() {
  return new Promise((resolve) => {
    const maxAttempts = 60; // 60 seconds
    let attempt = 0;
    
    const check = () => {
      attempt++;
      if (attempt > maxAttempts) {
        console.log('[WAIT] Vite startup timeout, launching Electron anyway...');
        resolve();
        return;
      }
      
      // Try ports 5173-5180
      let portsToCheck = [];
      for (let p = 5173; p <= 5180; p++) {
        portsToCheck.push(p);
      }
      
      let responding = 0;
      portsToCheck.forEach(port => {
        const req = http.get(`http://localhost:${port}/`, { timeout: 300 }, (res) => {
          res.on('data', () => {});
          responding++;
          if (responding === 1) {
            console.log(`[WAIT] Vite is ready on port ${port}`);
            resolve();
          }
        });
        req.on('error', () => {});
        req.on('timeout', () => req.destroy());
      });
      
      if (responding === 0) {
        setTimeout(check, 1000);
      }
    };
    
    check();
  });
}

async function main() {
  console.log('[WAIT] Waiting for Vite to start...');
  await waitForVite();
  
  console.log('[WAIT] Launching Electron...');
  const electronPath = path.join(__dirname, 'node_modules', '.bin', 'electron.cmd');
  const electron = spawn(electronPath, ['.'], { stdio: 'inherit', shell: true });
  electron.on('close', (code) => process.exit(code || 0));
}

main();
