import { useState, useRef, useEffect, memo } from 'react'

interface TacticalTerminalProps {
  onExecute: (command: string) => void
  terminalOutput: string[]
}

const TacticalTerminal = memo(function TacticalTerminal({ onExecute, terminalOutput }: TacticalTerminalProps) {
  const [input, setInput] = useState('')
  const outputEndRef = useRef<HTMLDivElement>(null)

  // Window State
  const [pos, setPos] = useState({ x: 20, y: 20 })
  const [size, setSize] = useState({ w: 320, h: 220 })
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null)

  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [terminalOutput])

  const onDragMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      setPos({ x: dragRef.current.origX + ev.clientX - dragRef.current.startX, y: dragRef.current.origY + ev.clientY - dragRef.current.startY })
    }
    const onUp = () => { setIsDragging(false); dragRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const onResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(true)
    resizeRef.current = { startX: e.clientX, startY: e.clientY, origW: size.w, origH: size.h }
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return
      const newW = Math.max(260, resizeRef.current.origW + ev.clientX - resizeRef.current.startX)
      const newH = Math.max(160, resizeRef.current.origH + ev.clientY - resizeRef.current.startY)
      setSize({ w: newW, h: newH })
    }
    const onUp = () => { setIsResizing(false); resizeRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (input.trim()) {
      onExecute(input.trim())
      setInput('')
    }
  }

  return (
    <div 
      className={`tactical-terminal glass-panel ${isDragging ? 'is-dragging' : ''} ${isResizing ? 'is-resizing' : ''}`}
      style={{
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: size.h,
        position: 'absolute',
        zIndex: 10
      }}
    >
      <div className="terminal-header" onMouseDown={onDragMouseDown}>
        <span className="terminal-title">◈ TACTICAL_COMMAND_INTERFACE</span>
        <div className="terminal-status-wrap">
          <span className="terminal-status">SYS_READY</span>
        </div>
      </div>

      <div className="terminal-output">
        {terminalOutput.map((line, i) => (
          <div key={i} className="terminal-line">
            {line.startsWith('>') ? (
              <span className="terminal-prompt-prefix">{line}</span>
            ) : (
              <span className="terminal-output-text">{line}</span>
            )}
          </div>
        ))}
        <div ref={outputEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="terminal-input-form">
        <span className="terminal-cursor">NEO&gt;</span>
        <input
          type="text"
          className="terminal-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          autoFocus
        />
      </form>

      <div className="terminal-overlay">
        <div className="scanline" />
      </div>
      <div className="window-resize-handle" onMouseDown={onResizeMouseDown} />
    </div>
  )
})

export default TacticalTerminal
