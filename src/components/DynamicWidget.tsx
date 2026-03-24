import { useState, useRef, useEffect, useMemo, memo } from 'react'
import Draggable from 'react-draggable'
// New flowchart widget for project planning
import FlowchartWidget from './FlowchartWidget'

export interface WidgetData {
    id: string
    title: string
    type: 'graph' | 'gauge' | 'text'
    content: string
    x: number
    y: number
    animated?: boolean
    theme?: 'default' | 'sublet_red'
    alwaysOnTop?: boolean
}

interface DynamicWidgetProps {
    widget: WidgetData
    onClose: (id: string) => void
}

const DynamicWidget = memo(function DynamicWidget({ widget, onClose }: DynamicWidgetProps) {
    const [frame, setFrame] = useState(0)
    const [dataPoints, setDataPoints] = useState<number[]>([])
    const requestRef = useRef<number>()
    const lastFrameTimeRef = useRef(0)

    // Throttled animation loop — ~15fps instead of 60fps for procedural waves
    const animate = (time: number) => {
        if (time - lastFrameTimeRef.current >= 66) { // ~15fps
            setFrame(time / 100)
            lastFrameTimeRef.current = time
        }
        requestRef.current = requestAnimationFrame(animate)
    }

    useEffect(() => {
        // Animate only graphs; text/status widgets should stay static for performance.
        if (widget.type === 'graph' && widget.animated !== false) {
            requestRef.current = requestAnimationFrame(animate)
        }
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current)
        }
    }, [widget.animated, widget.type])

    useEffect(() => {
        if (widget.type === 'graph' && widget.content.includes(',')) {
            const points = widget.content.split(',').map(n => parseFloat(n.trim())).filter(n => !isNaN(n))
            setDataPoints(points)
        }
    }, [widget.content])

    const graphPath = useMemo(() => {
        if (dataPoints.length > 0) {
            // Map dataPoints to SVG space (200x100)
            const max = Math.max(...dataPoints, 1)
            const step = 200 / (dataPoints.length - 1)
            return dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * step},${100 - (p / max) * 100}`).join(' ')
        } else {
            // Procedural "pitch graph" wave if no data
            const points = []
            for (let i = 0; i <= 200; i += 5) {
                const y = 50 + Math.sin(i * 0.1 + frame) * 20 + (Math.random() - 0.5) * 5
                points.push(`${i === 0 ? 'M' : 'L'} ${i},${y}`)
            }
            return points.join(' ')
        }
    }, [frame, dataPoints])

    return (
        <Draggable handle=".widget-header" defaultPosition={{ x: widget.x, y: widget.y }}>
            <div
                className={`dynamic-widget glass-panel ${widget.theme === 'sublet_red' ? 'sublet-widget' : ''}`}
                style={{ zIndex: widget.alwaysOnTop ? 1500 : 200 }}
            >
                <div className="widget-header">
                    <span className="widget-title">◈ {widget.title}</span>
                    <button className="widget-close" onClick={() => onClose(widget.id)}>×</button>
                </div>

                <div className="widget-content">
                    {widget.type === 'text' && <div className="widget-text">{widget.content}</div>}

                    {widget.type === 'graph' && (
                        <div className="widget-graph-container">
                            {/* Detect if the content encodes a flowchart definition */}
                            {(() => {
                                try {
                                    const data = JSON.parse(widget.content)
                                    if (Array.isArray(data.steps)) {
                                        // Render custom flowchart widget
                                        return <FlowchartWidget content={widget.content} />
                                    }
                                } catch (_) {}
                                // Fallback to existing animated graph view
                                return (
                                    <svg viewBox="0 0 200 100" className="widget-svg" preserveAspectRatio="none">
                                        <defs>
                                            <linearGradient id="lineGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                                                <stop offset="0%" stopColor="var(--neon-cyan)" stopOpacity="0.8" />
                                                <stop offset="100%" stopColor="var(--neon-cyan)" stopOpacity="0.2" />
                                            </linearGradient>
                                        </defs>
                                        <path
                                            d={graphPath}
                                            fill="none"
                                            stroke="url(#lineGrad)"
                                            strokeWidth="2"
                                            className="graph-path"
                                        />
                                    </svg>
                                )
                            })()}
                            <div className="widget-data-label">LIVE_FEED_{widget.id.slice(-4)}</div>
                        </div>
                    )}

                    {widget.type === 'gauge' && (
                        <div className="widget-gauge-container">
                            <div className="gauge-outer">
                                <div className="gauge-inner" style={{ width: `${widget.content}%` }} />
                            </div>
                            <span className="gauge-val">{widget.content}%</span>
                        </div>
                    )}
                </div>

                <div className="widget-footer">
                    <div className="scanline" />
                </div>
            </div>
        </Draggable>
    )
})

export default DynamicWidget
