#!/usr/bin/env node

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Check if Ollama is installed
function checkOllamaInstalled() {
  const possiblePaths = [
    'C:\\Users\\' + process.env.USERNAME + '\\AppData\\Local\\Programs\\Ollama\\ollama.exe',
    'C:\\Program Files\\Ollama\\ollama.exe',
  ];
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

// Check if Ollama service is running
function isOllamaRunning() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:11434/api/tags', { timeout: 2000 }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000);
  });
}

// Start Ollama
function startOllama(ollamaPath) {
  return new Promise((resolve) => {
    console.log('🚀 Starting Ollama...');
    const ollama = spawn('cmd', ['/c', 'start', '/min', ollamaPath], {
      detached: true,
      stdio: 'ignore'
    });
    
    ollama.unref();
    
    // Wait for Ollama to be ready
    let attempts = 0;
    const checkInterval = setInterval(async () => {
      attempts++;
      if (await isOllamaRunning()) {
        clearInterval(checkInterval);
        console.log('✅ Ollama is running');
        resolve();
      } else if (attempts > 30) {
        clearInterval(checkInterval);
        console.warn('⚠️  Ollama startup timeout, continuing anyway...');
        resolve();
      }
    }, 1000);
  });
}

// Pull model if needed
async function ensureModel() {
  const model = process.env.OLLAMA_MODEL || 'gpt-oss:120b-cloud';
  
  try {
    const req = http.get('http://127.0.0.1:11434/api/tags', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const models = JSON.parse(data);
          const hasModel = models.models?.some(m => m.name?.includes(model.split(':')[0]));
          if (!hasModel) {
            console.log(`📦 Pulling model: ${model}`);
            const pull = spawn('ollama', ['pull', model]);
            pull.on('close', () => console.log('✅ Model ready'));
          }
        } catch (e) {
          console.log('ℹ️  Model check skipped');
        }
      });
    });
    req.on('error', () => {});
  } catch (e) {
    console.log('ℹ️  Model check skipped');
  }
}

// Main
async function main() {
  const isRunning = await isOllamaRunning();
  
  if (!isRunning) {
    const ollamaPath = checkOllamaInstalled();
    if (!ollamaPath) {
      console.error('❌ Ollama is not installed. Please install from https://ollama.ai');
      process.exit(1);
    }
    await startOllama(ollamaPath);
    await new Promise(r => setTimeout(r, 2000)); // Extra wait for startup
  } else {
    console.log('✅ Ollama is already running');
  }
  
  // Ensure model is available
  await ensureModel();
  
  // Start Electron development mode
  console.log('\n🎨 Starting NeoCore HUD in Electron...\n');
  const electron = spawn('npm', ['run', 'dev:electron'], { stdio: 'inherit', shell: true });
  electron.on('close', (code) => process.exit(code));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
