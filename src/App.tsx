import { useCallback, useEffect, useRef, useState } from 'react'
import TimerWindow from '@features/timer/TimerWindow'
import StopwatchWindow from '@features/stopwatch/StopwatchWindow'
import {
  NeuralCircle,
  ChatPanel,
  CommandLog,
  TacticalTerminal,
  DynamicWidget,
  HudMetricCallouts,
  AiStatusBox,
  type WidgetData
} from '@features/index'

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

export interface SystemMetrics {
  cpu: number
  ram: number
  disk: number
  network: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'ai' | 'council'
  content: string
  memberName?: string
  modelColor?: string
}

export interface LogEntry {
  id: string
  message: string
  timestamp: Date
}

function App() {
  const [metrics, setMetrics] = useState<SystemMetrics>({ cpu: 0, ram: 0, disk: 0, network: 0 })
  const [aiStatus, setAiStatus] = useState<'idle' | 'thinking' | 'executing'>('idle')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [terminalOutput, setTerminalOutput] = useState<string[]>([])
  const [widgets, setWidgets] = useState<WidgetData[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [llmProvider, setLlmProvider] = useState<'ollama' | 'gemini'>('ollama')
  const [availableProviders, setAvailableProviders] = useState<string[]>(['ollama', 'gemini'])
  const [offlineMode, setOfflineMode] = useState(false)
  const [pendingApproval, setPendingApproval] = useState<{ id: string, type: string, description: string } | null>(null)
  const [timerState, setTimerState] = useState({ visible: false, minimized: false })
  const [stopwatchState, setStopwatchState] = useState({ visible: false, minimized: false })

  const messagesRef = useRef<ChatMessage[]>([])

  const sanitizeAiContent = (text: string) => {
    if (!text) return text

    return text
      .replace(/^\s*\*{0,2}\s*NeoCore HUD[^\n]*\n?/i, '')
      .replace(/^\s*\*{0,2}\s*Status:\s*[^\n]*\n?/i, '')
      .replace(/^\s*\*{0,2}\s*Systems?\s+(online|initialized|active)[^\n]*\n?/i, '')
      .replace(/\[WIDGET:[\s\S]*?\]/gi, '')
      .replace(/\[WIDGET_UPDATE:[\s\S]*?\]/gi, '')
      .replace(/\[MOUSE_MOVE:[\s\S]*?\]/gi, '')
      .replace(/\[CLICK\]/gi, '')
      .replace(/\[TYPE:[\s\S]*?\]/gi, '')
      .trim()
  }

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    let removeMetricsListener: (() => void) | undefined
    let removeBackendListener: (() => void) | undefined

    if (window.electronAPI) {
      removeMetricsListener = window.electronAPI.onSystemMetrics((data: SystemMetrics) => {
        setMetrics(data)
      })

      removeBackendListener = window.electronAPI.onBackendMessage((data: any) => {
        if (data.type === 'ai_response') {
          setMessages(prev => [...prev, { id: Date.now().toString(), role: 'ai', content: sanitizeAiContent(data.content || '') }])
          setAiStatus('idle')
        } else if (data.type === 'ai_council_response') {
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'council',
            content: sanitizeAiContent(data.content || ''),
            memberName: data.member_name || 'AI',
            modelColor: data.model_color || 'default'
          }])
          setAiStatus('idle')
        } else if (data.type === 'streaming_chunk') {
          setAiStatus('executing')
          setMessages(prev => {
            const lastMsg = prev[prev.length - 1]
            if (lastMsg && lastMsg.id === data.id) {
              const updated = [...prev]
              updated[updated.length - 1] = {
                ...lastMsg,
                content: sanitizeAiContent((lastMsg.content || '') + (data.content || ''))
              }
              return updated
            }
            return [...prev, { id: data.id, role: 'ai', content: sanitizeAiContent(data.content || '') }]
          })
        } else if (data.type === 'streaming_end') {
          setAiStatus('idle')
        } else if (data.type === 'terminal_output') {
          setTerminalOutput(prev => [...prev.slice(-49), `> ${data.command}`, data.output])
          setAiStatus('idle')
        } else if (data.type === 'create_widget') {
          const newWidget: WidgetData = {
            id: data.id || Date.now().toString(),
            title: data.title || 'Neo Module',
            type: data.widget_type || 'text',
            content: data.content || '',
            x: data.x || 400,
            y: data.y || 100,
            animated: data.animated,
            theme: data.theme || 'default',
            alwaysOnTop: !!data.always_on_top
          }
          setWidgets(prev => [...prev.filter(w => w.id !== newWidget.id), newWidget])
          setAiStatus('idle')
        } else if (data.type === 'update_widget') {
          setWidgets(prev => prev.map(w => (
            w.id === data.id
              ? {
                  ...w,
                  content: typeof data.content === 'string' ? data.content.slice(0, 1500) : w.content,
                  animated: data.animated ?? w.animated,
                  theme: data.theme ?? w.theme,
                  alwaysOnTop: data.always_on_top ?? w.alwaysOnTop
                }
              : w
          )))
          setAiStatus('idle')
        } else if (data.type === 'log') {
          setLogs(prev => [...prev, { id: Date.now().toString(), message: data.message, timestamp: new Date() }])
        } else if (data.type === 'llm_settings') {
          if (typeof data.provider === 'string' && (data.provider === 'ollama' || data.provider === 'gemini')) {
            setLlmProvider(data.provider)
          }
          if (Array.isArray(data.providers)) {
            setAvailableProviders(data.providers)
          }
          if (typeof data.offline_mode === 'boolean') {
            setOfflineMode(data.offline_mode)
          }
        } else if (data.type === 'action_approval_request') {
          setPendingApproval({ id: data.id, type: data.approval_type, description: data.description })
        }
      })

      window.electronAPI.sendToBackend({ action: 'get_llm_settings' })
    }

    const interval = setInterval(async () => {
      if (!window.electronAPI) return
      try {
        await window.electronAPI.sendToBackend({ action: 'get_metrics' })
      } catch {
        // backend is still booting
      }
    }, 2000)

    return () => {
      clearInterval(interval)
      removeMetricsListener?.()
      removeBackendListener?.()
    }
  }, [])

  const handleSendMessage = useCallback(async (message: string) => {
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: message }])
    setAiStatus('thinking')

    try {
      const result = await window.electronAPI?.sendToBackend({
        action: 'chat',
        message,
        history: messagesRef.current
      })

      if (result?.error) {
        setLogs(prev => [...prev, {
          id: Date.now().toString(),
          message: `Send failed: ${result.error}`,
          timestamp: new Date()
        }])
        setAiStatus('idle')
      }
    } catch (error) {
      console.error('Error sending message:', error)
      setAiStatus('idle')
    }
  }, [])

  const handleExecuteCommand = useCallback(async (command: string) => {
    try {
      await window.electronAPI?.sendToBackend({ action: 'terminal_cmd', command })
    } catch (error) {
      console.error('Error executing command:', error)
    }
  }, [])

  const closeWidget = useCallback((id: string) => {
    setWidgets(prev => prev.filter(widget => widget.id !== id))
  }, [])

  const saveSettings = useCallback(() => {
    window.electronAPI?.sendToBackend({
      action: 'set_llm_settings',
      provider: llmProvider,
      offline_mode: offlineMode
    })
    setShowSettings(false)
  }, [llmProvider, offlineMode])

  const hideHud = useCallback(async () => {
    await window.electronAPI?.hideWindow()
  }, [])

  const handleApprove = useCallback(() => {
    if (!pendingApproval) return
    window.electronAPI?.sendToBackend({ action: 'action_approval_response', id: pendingApproval.id, approved: true })
    setPendingApproval(null)
  }, [pendingApproval])

  const handleReject = useCallback(() => {
    if (!pendingApproval) return
    window.electronAPI?.sendToBackend({ action: 'action_approval_response', id: pendingApproval.id, approved: false })
    setPendingApproval(null)
  }, [pendingApproval])

  return (
    <>
      <div className="hud-container">
        <div className="left-panel">
          <div className="neural-circle-container">
            <NeuralCircle metrics={metrics} />
            <HudMetricCallouts metrics={metrics} />
          </div>
          <AiStatusBox aiStatus={aiStatus} />
        </div>

        <div className="right-panel">
          <ChatPanel
            messages={messages}
            onSendMessage={handleSendMessage}
            aiStatus={aiStatus}
            ttsEnabled={false}
            onToggleTts={() => {}}
          />
          <CommandLog logs={logs} />
        </div>

        {showSettings && (
          <div className="settings-overlay glass-panel">
            <div className="settings-header">
              <h3>SYSTEM_CONFIG</h3>
              <button className="close-btn" onClick={() => setShowSettings(false)}>x</button>
            </div>
            <div className="settings-body">
              <div className="setting-row">
                <label>LLM_PROVIDER</label>
                <select
                  value={llmProvider}
                  onChange={(e) => setLlmProvider(e.target.value as 'ollama' | 'gemini')}
                  className="hud-select"
                >
                  {availableProviders.map(provider => (
                    <option key={provider} value={provider}>{provider.toUpperCase()}</option>
                  ))}
                </select>
              </div>
              <div className="setting-row">
                <label>OFFLINE MODE ({offlineMode ? 'ON' : 'OFF'})</label>
                <button
                  className={`control-btn ${offlineMode ? 'active' : ''}`}
                  onClick={() => setOfflineMode(value => !value)}
                  style={{ width: '80px', textShadow: 'none' }}
                >
                  {offlineMode ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>
            <div className="settings-footer">
              <button className="control-btn" onClick={saveSettings}>Apply Config</button>
            </div>
          </div>
        )}
      </div>

      <TacticalTerminal onExecute={handleExecuteCommand} terminalOutput={terminalOutput} />

      {widgets.map(widget => (
        <DynamicWidget key={widget.id} widget={widget} onClose={closeWidget} />
      ))}

      {timerState.visible && (
        <TimerWindow
          visible={timerState.visible}
          minimized={timerState.minimized}
          onClose={() => setTimerState({ visible: false, minimized: false })}
          onMinimize={() => setTimerState(prev => ({ ...prev, minimized: true }))}
          onAction={(action, payload = {}) => {
            window.electronAPI?.sendToBackend({ action, ...payload })
          }}
        />
      )}

      {stopwatchState.visible && (
        <StopwatchWindow
          visible={stopwatchState.visible}
          minimized={stopwatchState.minimized}
          onClose={() => setStopwatchState({ visible: false, minimized: false })}
          onMinimize={() => setStopwatchState(prev => ({ ...prev, minimized: true }))}
        />
      )}

      <div className="neo-dock">
        <div className="neo-dock-inner">
          <button
            className={`dock-icon ${timerState.minimized ? 'dock-icon-active' : ''}`}
            onClick={() => {
              if (timerState.minimized) setTimerState(prev => ({ ...prev, minimized: false }))
              else setTimerState({ visible: true, minimized: false })
            }}
            title="Timer"
          >
            <div className="dock-icon-bg">
              <svg viewBox="0 0 28 28" fill="none">
                <circle cx="14" cy="14" r="11" stroke="currentColor" strokeWidth="1.5" />
                <line x1="14" y1="14" x2="14" y2="6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <line x1="14" y1="14" x2="20" y2="17" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <circle cx="14" cy="14" r="1.5" fill="currentColor" />
              </svg>
            </div>
            <span className="dock-label">Timer</span>
            {timerState.minimized && <div className="dock-dot" />}
          </button>

          <button
            className={`dock-icon ${stopwatchState.minimized ? 'dock-icon-active' : ''}`}
            onClick={() => {
              if (stopwatchState.minimized) setStopwatchState(prev => ({ ...prev, minimized: false }))
              else setStopwatchState({ visible: true, minimized: false })
            }}
            title="Stopwatch"
          >
            <div className="dock-icon-bg">
              <svg viewBox="0 0 28 28" fill="none">
                <circle cx="14" cy="16" r="10" stroke="currentColor" strokeWidth="1.5" />
                <line x1="14" y1="16" x2="14" y2="9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <line x1="11" y1="3" x2="17" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="14" y1="3" x2="14" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <span className="dock-label">Stopwatch</span>
            {stopwatchState.minimized && <div className="dock-dot" />}
          </button>

          <div className="dock-separator" />

          <button
            className="dock-icon dock-icon-action"
            onClick={() => setShowSettings(true)}
            title="Settings"
          >
            <div className="dock-icon-bg">
              <svg viewBox="0 0 28 28" fill="none">
                <path
                  d="M14 3.5 L15.6 5.8 L18.4 5.2 L19.4 7.8 L22 8.6 L21.6 11.4 L23.8 13 L22.4 15.6 L23.8 18 L21.2 19 L20.8 21.8 L18 21.6 L16.4 23.8 L14 22.6 L11.6 23.8 L10 21.6 L7.2 21.8 L6.8 19 L4.2 18 L5.6 15.6 L4.2 13 L6.4 11.4 L6 8.6 L8.6 7.8 L9.6 5.2 L12.4 5.8 Z"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
                <circle cx="14" cy="14" r="3.5" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </div>
            <span className="dock-label">Settings</span>
          </button>

          <button
            className="dock-icon dock-icon-action"
            onClick={hideHud}
            title="Hide HUD"
          >
            <div className="dock-icon-bg">
              <svg viewBox="0 0 28 28" fill="none">
                <path d="M5 14C5 14 8.5 8 14 8C19.5 8 23 14 23 14C23 14 19.5 20 14 20C8.5 20 5 14 5 14Z" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="14" cy="14" r="3" stroke="currentColor" strokeWidth="1.5" />
                <line x1="5" y1="5" x2="23" y2="23" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <span className="dock-label">Hide HUD</span>
          </button>
        </div>
      </div>

      {pendingApproval && (
        <div className="approval-overlay">
          <div className="approval-modal glass-panel">
            <div className="approval-header">
              <h3>MANDATORY_ACTION_APPROVAL</h3>
            </div>
            <div className="approval-body">
              <div className="approval-type">TYPE: {pendingApproval.type.toUpperCase()}</div>
              <div className="approval-desc">{pendingApproval.description}</div>
            </div>
            <div className="approval-footer">
              <button className="control-btn reject-btn" onClick={handleReject}>REJECT</button>
              <button className="control-btn approve-btn" onClick={handleApprove}>APPROVE</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default App
