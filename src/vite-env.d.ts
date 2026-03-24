export {}

declare global {
  interface Window {
    electronAPI: {
      hideWindow: () => Promise<void>
      sendToBackend: (data: any) => Promise<any>
      onBackendMessage: (callback: (data: any) => void) => () => void
      onSystemMetrics: (callback: (data: any) => void) => () => void
    }
  }
}
