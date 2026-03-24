import { useState, useEffect, useRef, useCallback } from 'react'
import { useCloseFade } from '@/hooks/useDustClose'

interface StopwatchState {
  seconds: number
  running: boolean
  laps: number[]
}

interface StopwatchWindowProps {
  visible: boolean
  minimized: boolean
  onClose: () => void
  onMinimize?: () => void
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function formatDisplay(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = Math.floor(totalSeconds % 60)
  const ms = Math.floor((totalSeconds % 1) * 100)
  
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms)}`
  return `${pad(m)}:${pad(s)}.${pad(ms)}`
}

export default function StopwatchWindow({ visible, minimized, onClose, onMinimize }: StopwatchWindowProps) {
  const [state, setState] = useState<StopwatchState>({
    seconds: 0,
    running: false,
    laps: []
  })

  // Drag state
  const [pos, setPos] = useState({ x: window.innerWidth / 2 + 20, y: 80 })
  const [size, setSize] = useState({ w: 320, h: 360 })
  const [isActive, setIsActive] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)
  const [prevLayout, setPrevLayout] = useState({ pos: { x: window.innerWidth / 2 + 20, y: 80 }, size: { w: 320, h: 360 } })
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null)
  const windowRef = useRef<HTMLDivElement>(null)
  const requestRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number | null>(null)
  const { isClosing, triggerClose } = useCloseFade(onClose)

  // Stopwatch ticking
  const animate = useCallback((time: number) => {
    if (lastTimeRef.current !== null) {
      const deltaTime = (time - lastTimeRef.current) / 1000
      setState(prev => ({ ...prev, seconds: prev.seconds + deltaTime }))
    }
    lastTimeRef.current = time
    requestRef.current = requestAnimationFrame(animate)
  }, [])

  useEffect(() => {
    if (state.running) {
      lastTimeRef.current = performance.now()
      requestRef.current = requestAnimationFrame(animate)
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current)
      lastTimeRef.current = null
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current)
    }
  }, [state.running, animate])

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

  // Dragging
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

  // Resizing
  const onResizeMouseDown = (e: React.MouseEvent) => {
    if (isMaximized) return
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(true)
    resizeRef.current = { startX: e.clientX, startY: e.clientY, origW: size.w, origH: size.h }
    
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return
      setSize({ 
        w: Math.max(300, resizeRef.current.origW + ev.clientX - resizeRef.current.startX), 
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

  const handleStart = () => setState(prev => ({ ...prev, running: true }))
  const handlePause = () => setState(prev => ({ ...prev, running: false }))
  const handleReset = () => setState(prev => ({ ...prev, seconds: 0, running: false, laps: [] }))
  const handleLap = () => setState(prev => ({ ...prev, laps: [prev.seconds, ...prev.laps].slice(0, 10) }))

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

  const progress = (state.seconds % 60) / 60
  const R = 80, cx = 100, cy = 100
  const circumference = 2 * Math.PI * R
  const dashOffset = circumference * (1 - progress)

  return (
    <div
      ref={windowRef}
      className={`stopwatch-window ${isActive ? 'stopwatch-active' : ''} ${isMaximized ? 'is-maximized' : ''} ${minimized ? 'is-minimized' : ''} ${isDragging ? 'is-dragging' : ''} ${isResizing ? 'is-resizing' : ''} ${isClosing ? 'is-closing-fade' : ''}`}
      style={{ 
        left: isMaximized ? 0 : pos.x, 
        top: isMaximized ? 0 : pos.y, 
        width: isMaximized ? '100vw' : size.w, 
        height: isMaximized ? '100vh' : size.h 
      }}
      onMouseDown={() => setIsActive(true)}
    >
      <div className="stopwatch-titlebar" onMouseDown={!isMaximized ? onDragMouseDown : undefined}>
        <div className="macos-traffic-lights" onMouseDown={e => e.stopPropagation()}>
          <div className="macos-traffic-light close" onClick={triggerClose} title="Close" />
          <div className="macos-traffic-light minimize" onClick={onMinimize} title="Minimize" />
          <div className="macos-traffic-light maximize" onClick={toggleMaximize} title="Maximize" />
        </div>
        <span className="stopwatch-title-text">◈ Stopwatch</span>
      </div>

      <div className="stopwatch-ring-wrap">
        <svg viewBox="0 0 200 200" className="stopwatch-svg">
          <circle cx={cx} cy={cy} r={R} className="stopwatch-ring-track" />
          <circle
            cx={cx} cy={cy} r={R}
            className="stopwatch-ring-progress"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        </svg>
        <div className={`stopwatch-display-text ${state.running ? 'stopwatch-running-glow' : ''}`}>
          {formatDisplay(state.seconds)}
        </div>
        {state.running && <div className="stopwatch-state-label">RECORDING</div>}
        {!state.running && state.seconds > 0 && <div className="stopwatch-state-label">PAUSED</div>}
      </div>

      {state.laps.length > 0 && (
        <div className="stopwatch-laps-container">
          <div className="stopwatch-laps-header">LAPS</div>
          <div className="stopwatch-laps-list">
            {state.laps.map((lap, idx) => (
              <div key={idx} className="stopwatch-lap-row">
                <span className="lap-num">LAP {state.laps.length - idx}</span>
                <span className="lap-time">{formatDisplay(lap)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="stopwatch-controls">
        {!state.running ? (
          <button className="stopwatch-btn stopwatch-btn-start" onClick={handleStart}>
            ▶ START
          </button>
        ) : (
          <button className="stopwatch-btn stopwatch-btn-pause" onClick={handlePause}>
            ❙❙ PAUSE
          </button>
        )}
        <button className="stopwatch-btn stopwatch-btn-lap" onClick={handleLap} disabled={!state.running}>
          LAP
        </button>
        <button className="stopwatch-btn stopwatch-btn-reset" onClick={handleReset}>
          ↺ RESET
        </button>
      </div>

      <div className="timer-voice-hint">
        🎙 Quick voice (local): say "start", "pause/stop", "reset", or "reset and start"
      </div>

      <div className="window-resize-handle" onMouseDown={onResizeMouseDown} />
    </div>
  )
}