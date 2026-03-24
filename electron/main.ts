import { app, BrowserWindow, globalShortcut, ipcMain, shell, screen } from 'electron'
import path from 'path'
import { spawn, ChildProcess } from 'child_process'
import fs from 'fs'
import WebSocket from 'ws'

// Enable GPU-accelerated compositing for transparent windows.
// If you see clipping on multi-monitor setups, uncomment the line below:
app.disableHardwareAcceleration()

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

let mainWindow: BrowserWindow | null = null
let pythonProcess: ChildProcess | null = null

function startPythonBackend() {
  const appPath = app.getAppPath()
  const launchers =
    process.platform === 'win32'
      ? [
          ...(fs.existsSync(path.join(appPath, 'python', 'venv', 'Scripts', 'python.exe'))
            ? [{ cmd: path.join(appPath, 'python', 'venv', 'Scripts', 'python.exe'), args: ['python/main.py'] }]
            : []),
          { cmd: 'python', args: ['python/main.py'] },
          { cmd: 'py', args: ['-3', 'python/main.py'] }
        ]
      : [
          ...(fs.existsSync(path.join(appPath, 'python', 'venv', 'bin', 'python'))
            ? [{ cmd: path.join(appPath, 'python', 'venv', 'bin', 'python'), args: ['python/main.py'] }]
            : []),
          { cmd: 'python3', args: ['python/main.py'] },
          { cmd: 'python', args: ['python/main.py'] }
        ]

  const tryLaunch = (index: number) => {
    if (index >= launchers.length) {
      console.error('Failed to start Python backend with all launchers.')
      return
    }

    const launcher = launchers[index]
    const launchedAt = Date.now()
    console.log(`Starting Python backend via: ${launcher.cmd} ${launcher.args.join(' ')}`)
    pythonProcess = spawn(launcher.cmd, launcher.args, {
      cwd: appPath,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false
    })

    pythonProcess.stdout?.on('data', (data) => {
      console.log(`Python: ${data}`)
    })

    pythonProcess.stderr?.on('data', (data) => {
      console.error(`Python Error: ${data}`)
    })

    pythonProcess.on('error', (err) => {
      console.error(`Python spawn error (${launcher.cmd}): ${err.message}`)
    })

    pythonProcess.on('close', (code) => {
      console.log(`Python process exited with code ${code} (${launcher.cmd})`)
      if (code !== 0 && code !== null) {
        const runtimeMs = Date.now() - launchedAt
        const quickFailure = runtimeMs < 10_000

        // Only switch launchers on quick startup failures (missing deps/interpreter issues).
        if (quickFailure && index < launchers.length - 1) {
          tryLaunch(index + 1)
          return
        }

        // If a launcher ran for a while and then crashed, restart the same one.
        setTimeout(() => tryLaunch(index), 3000)
      }
    })
  }

  tryLaunch(0)
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height, x, y } = primaryDisplay.bounds

  console.log('--- DISPLAY DEBUG ---')
  console.log(`Primary Display:`, primaryDisplay.bounds)
  console.log(`Window | x: ${x}, y: ${y}, width: ${width}, height: ${height}`)
  console.log('---------------------')

  mainWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: false
    },
    paintWhenInitiallyHidden: false
  })
  mainWindow.setAlwaysOnTop(true, 'screen-saver')
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  mainWindow.moveTop()
  // DevTools: open only via Ctrl+Shift+I in dev mode (removed auto-open for performance)

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  startPythonBackend()
  createWindow()

  // Kill command
  globalShortcut.register('CommandOrControl+Q', () => {
    shell.beep()
    app.quit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  if (pythonProcess && pythonProcess.pid && pythonProcess.exitCode === null) {
    console.log('Terminating Python backend...')
    if (process.platform === 'win32') {
      // Use taskkill /f /t /pid to kill the process tree
      const killer = spawn('taskkill', ['/pid', pythonProcess.pid.toString(), '/f', '/t'], {
        stdio: 'ignore',
        windowsHide: true
      })
      killer.on('error', () => {
        // Ignore cleanup errors during shutdown/relaunch.
      })
    } else {
      pythonProcess.kill('SIGTERM')
    }
  }
})


ipcMain.handle('hide-window', () => {
  mainWindow?.hide()
})


let ws: WebSocket | null = null
let wsReconnectTimer: NodeJS.Timeout | null = null
let wsRetryMs = 1000
let wsHasConnectedOnce = false

function scheduleWsReconnect() {
  if (wsReconnectTimer) return
  wsReconnectTimer = setTimeout(() => {
    wsReconnectTimer = null
    connectWebSocket()
  }, wsRetryMs)
  wsRetryMs = Math.min(8000, wsRetryMs * 2)
}

function connectWebSocket() {
  try {
    ws = new WebSocket('ws://127.0.0.1:8000/ws')

    ws.on('open', () => {
      console.log('Connected to Python backend')
      wsHasConnectedOnce = true
      wsRetryMs = 1000
      if (wsReconnectTimer) clearTimeout(wsReconnectTimer)
      wsReconnectTimer = null
    })

    ws.on('message', (data: any) => {
      if (mainWindow) {
        try {
          const message = JSON.parse(data.toString())
          if (message.type === 'metrics') {
            mainWindow.webContents.send('system-metrics', message)
          } else {
            mainWindow.webContents.send('backend-message', message)
          }
        } catch (e) {
          console.log('Received non-JSON:', data)
        }
      }
    })

    ws.on('close', () => {
      if (wsHasConnectedOnce) {
        console.log('Disconnected from Python backend')
      }
      scheduleWsReconnect()
    })

    ws.on('error', (err: Error) => {
      if (wsHasConnectedOnce) {
        console.log('WebSocket error:', err.message)
      }
    })
  } catch (e) {
    scheduleWsReconnect()
  }
}

setTimeout(connectWebSocket, 500)

ipcMain.handle('send-to-backend', async (_, data: any) => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(data))
      return { ok: true }
    } catch (e: any) {
      return { error: e?.message || 'send failed' }
    }
  }

  return { error: 'not connected' }
})
