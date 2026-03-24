#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT_FILE = path.join(__dirname, '.vite-port');

// Simple server to find what port Vite actually started on
function discoverVitePort() {
  return new Promise((resolve) => {
    let foundPort = null;
    let checked = 0;
    const maxPort = 5180;
    
    const checkPort = (port) => {
      if (port > maxPort) {
        resolve(5173); // fallback
        return;
      }
      
      checked++;
      if (checked > 20) {
        resolve(5173);
        return;
      }
      
      const req = http.get(`http://localhost:${port}`, { timeout: 300 }, (res) => {
        foundPort = port;
        resolve(port);
        req destroy && req.destroy();
      });
      
      req.on('error', () => {
        checkPort(port + 1);
      });
      
      req.setTimeout(300, () => {
        req.destroy();
        checkPort(port + 1);
      });
    };
    
    checkPort(5173);
  });
}

async function main() {
  const port = await discoverVitePort();
  fs.writeFileSync(PORT_FILE, String(port));
  console.log(`[PORT] Vite is running on port: ${port}`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
