import { useState, useEffect, useRef } from 'react'
import { useCloseFade } from '@/hooks/useDustClose'

interface TimerState {
  duration_seconds: number
  remaining: number
  running: boolean
  finished: boolean
  display: string
}

interface TimerWindowProps {
  visible: boolean
  minimized: boolean
  onClose: () => void
  onMinimize?: () => void
  onAction: (action: string, payload?: any) => void
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function formatDisplay(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`
  return `${pad(m)}:${pad(s)}`
}

export default function TimerWindow({ visible, minimized, onClose, onMinimize, onAction }: TimerWindowProps) {
  const [timerState, setTimerState] = useState<TimerState>({
    duration_seconds: 0,
    remaining: 0,
    running: false,
    finished: false,
    display: '00:00',
  })
  const [minuteInput, setMinuteInput] = useState('5')
  const [secondInput, setSecondInput] = useState('0')

  // Drag state
  const [pos, setPos] = useState({ x: 80, y: 80 })
  const [size, setSize] = useState({ w: 320, h: 480 })
  const [isActive, setIsActive] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)
  const [prevLayout, setPrevLayout] = useState({ pos: { x: 80, y: 80 }, size: { w: 320, h: 480 } })
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null)
  const windowRef = useRef<HTMLDivElement>(null)
  const { isClosing, triggerClose } = useCloseFade(onClose)

  // Track click outside
  useEffect(() => {
    if (!visible) return
    const handleGlobalMouseDown = (e: MouseEvent) => {
      if (windowRef.current && !windowRef.current.contains(e.target as Node)) {
        setIsActive(false)
      }
    }
    window.addEventListener('mousedown', handleGlobalMouseDown)
    return () => window.removeEventListener('mousedown', handleGlobalMouseDown)
  }, [visible])

  const localIntervalRef = useRef<number | null>(null)

  // Listen for backend timer updates
  useEffect(() => {
    if (!window.electronAPI) return
    const remove = window.electronAPI.onBackendMessage((data: any) => {
      if (data.type === 'timer_tick' || data.type === 'timer_update' || data.type === 'timer_finished') {
        setTimerState({
          duration_seconds: data.duration_seconds ?? 0,
          remaining: data.remaining ?? 0,
          running: data.running ?? false,
          finished: data.finished ?? false,
          display: data.display ?? formatDisplay(data.remaining ?? 0),
        })
      }
    })
    return remove
  }, [])

  // Local fallback countdown — ticks every second when running
  useEffect(() => {
    if (timerState.running && !timerState.finished) {
      localIntervalRef.current = window.setInterval(() => {
        setTimerState(prev => {
          if (!prev.running || prev.finished) return prev
          const newRemaining = Math.max(0, prev.remaining - 1)
          const finished = newRemaining <= 0
          return {
            ...prev,
            remaining: newRemaining,
            display: formatDisplay(newRemaining),
            running: !finished,
            finished,
          }
        })
      }, 1000)
    } else {
      if (localIntervalRef.current !== null) {
        clearInterval(localIntervalRef.current)
        localIntervalRef.current = null
      }
    }
    return () => {
      if (localIntervalRef.current !== null) {
        clearInterval(localIntervalRef.current)
        localIntervalRef.current = null
      }
    }
  }, [timerState.running, timerState.finished])

  // Sync state from backend on open
  useEffect(() => {
    if (visible && window.electronAPI) {
      window.electronAPI.sendToBackend({ action: 'timer_get' })
    }
  }, [visible])

  const onDragMouseDown = (e: React.MouseEvent) => {
    if (isMaximized) return
    e.preventDefault()
    setIsDragging(true)
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y }
    
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      setPos({ 
        x: dragRef.current.origX + ev.clientX - dragRef.current.startX, 
        y: dragRef.current.origY + ev.clientY - dragRef.current.startY 
      })
    }
    
    const onUp = () => { 
      dragRef.current = null
      setIsDragging(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const onResizeMouseDown = (e: React.MouseEvent) => {
    if (isMaximized) return
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(true)
    resizeRef.current = { startX: e.clientX, startY: e.clientY, origW: size.w, origH: size.h }
    
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return
      setSize({ 
        w: Math.max(280, resizeRef.current.origW + ev.clientX - resizeRef.current.startX), 
        h: Math.max(300, resizeRef.current.origH + ev.clientY - resizeRef.current.startY) 
      })
    }

    const onUp = () => { 
      resizeRef.current = null
      setIsResizing(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const handleSet = () => {
    const mins = Math.max(0, parseInt(minuteInput) || 0)
    const secs = Math.max(0, parseInt(secondInput) || 0)
    const total = mins * 60 + secs
    if (total > 0) {
      setTimerState(prev => ({ ...prev, duration_seconds: total, remaining: total, display: formatDisplay(total), finished: false, running: false }))
      onAction('timer_set', { seconds: total })
    }
  }

  const handleStart = () => {
    setTimerState(prev => ({ ...prev, running: true, finished: false }))
    onAction('timer_start')
  }

  const handlePause = () => {
    setTimerState(prev => ({ ...prev, running: false }))
    onAction('timer_pause')
  }

  const handleReset = () => {
    setTimerState(prev => ({ ...prev, remaining: prev.duration_seconds, display: formatDisplay(prev.duration_seconds), running: false, finished: false }))
    onAction('timer_reset')
  }

  const toggleMaximize = () => {
    if (isMaximized) {
      setPos(prevLayout.pos)
      setSize(prevLayout.size)
      setIsMaximized(false)
    } else {
      setPrevLayout({ pos, size })
      setPos({ x: 0, y: 0 })
      setSize({ w: window.innerWidth, h: window.innerHeight })
      setIsMaximized(true)
    }
  }

  if (!visible) return null

  const progress = timerState.duration_seconds > 0 ? (timerState.remaining / timerState.duration_seconds) : 0
  const R = 80, cx = 100, cy = 100
  const circumference = 2 * Math.PI * R
  const dashOffset = circumference * (1 - progress)

  return (
    <div
      ref={windowRef}
      className={`timer-window ${isActive ? 'timer-active' : ''} ${isMaximized ? 'is-maximized' : ''} ${minimized ? 'is-minimized' : ''} ${isDragging ? 'is-dragging' : ''} ${isResizing ? 'is-resizing' : ''} ${isClosing ? 'is-closing-fade' : ''}`}
      style={{ 
        left: isMaximized ? 0 : pos.x, 
        top: isMaximized ? 0 : pos.y, 
        width: isMaximized ? '100vw' : size.w, 
        height: isMaximized ? '100vh' : size.h 
      }}
      onMouseDown={() => setIsActive(true)}
    >
      <div className="timer-titlebar" onMouseDown={!isMaximized ? onDragMouseDown : undefined}>
        <div className="macos-traffic-lights" onMouseDown={e => e.stopPropagation()}>
          <div className="macos-traffic-light close" onClick={triggerClose} title="Close" />
          <div className="macos-traffic-light minimize" onClick={onMinimize} title="Minimize" />
          <div className="macos-traffic-light maximize" onClick={toggleMaximize} title="Maximize" />
        </div>
        <span className="timer-title-text">◈ Miss Minutes</span>
      </div>

      <div className="timer-ring-wrap">
        <svg viewBox="0 0 200 200" className="timer-svg">
          <circle cx={cx} cy={cy} r={R} className="timer-ring-track" />
          <circle
            cx={cx} cy={cy} r={R}
            className={`timer-ring-progress ${timerState.finished ? 'timer-ring-done' : ''}`}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        </svg>
        <div className={`timer-display-text ${timerState.finished ? 'timer-done-pulse' : ''} ${timerState.running ? 'timer-running-glow' : ''}`}>
          {timerState.finished ? 'DONE' : timerState.display}
        </div>
      </div>

      {/* State badge — below the ring, not inside it */}
      <div className="timer-state-badge">
        {timerState.finished && <span className="timer-done-label">TIME ELAPSED</span>}
        {timerState.running && !timerState.finished && <span className="timer-state-label">RUNNING</span>}
        {!timerState.running && !timerState.finished && timerState.duration_seconds > 0 && (
          <span className="timer-state-label">PAUSED</span>
        )}
        {!timerState.running && !timerState.finished && timerState.duration_seconds === 0 && (
          <span className="timer-state-label timer-state-idle">SET A TIME ABOVE</span>
        )}
      </div>

      <div className="timer-set-area">
        <div className="timer-input-row">
          <div className="timer-input-group">
            <input
              id="timer-min-input"
              type="number"
              min={0}
              className="timer-num-input"
              value={minuteInput}
              onChange={e => setMinuteInput(e.target.value)}
            />
            <label htmlFor="timer-min-input" className="timer-input-label">MIN</label>
          </div>
          <span className="timer-colon">:</span>
          <div className="timer-input-group">
            <input
              id="timer-sec-input"
              type="number"
              min={0}
              max={59}
              className="timer-num-input"
              value={secondInput}
              onChange={e => setSecondInput(e.target.value)}
            />
            <label htmlFor="timer-sec-input" className="timer-input-label">SEC</label>
          </div>
        </div>
        <button id="timer-set-btn" className="timer-btn timer-btn-set" onClick={handleSet}>SET</button>
      </div>

      <div className="timer-controls">
        {!timerState.running ? (
          <button
            id="timer-start-btn"
            className="timer-btn timer-btn-start"
            onClick={handleStart}
            disabled={timerState.duration_seconds === 0}
          >
            ▶ START
          </button>
        ) : (
          <button id="timer-pause-btn" className="timer-btn timer-btn-pause" onClick={handlePause}>
            ❙❙ PAUSE
          </button>
        )}
        <button id="timer-reset-btn" className="timer-btn timer-btn-reset" onClick={handleReset}>
          ↺ RESET
        </button>
      </div>

      <div className="window-resize-handle" onMouseDown={onResizeMouseDown} />
    </div>
  )
}