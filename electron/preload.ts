import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  sendToBackend: (data: any) => ipcRenderer.invoke('send-to-backend', data),
  onBackendMessage: (callback: (data: any) => void) => {
    const listener = (_: Electron.IpcRendererEvent, data: any) => callback(data)
    ipcRenderer.on('backend-message', listener)
    return () => ipcRenderer.removeListener('backend-message', listener)
  },
  onSystemMetrics: (callback: (data: any) => void) => {
    const listener = (_: Electron.IpcRendererEvent, data: any) => callback(data)
    ipcRenderer.on('system-metrics', listener)
    return () => ipcRenderer.removeListener('system-metrics', listener)
  }
})
