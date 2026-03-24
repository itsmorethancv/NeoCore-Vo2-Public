import { memo } from 'react'
import { SystemMetrics } from '../App'

interface Props {
  metrics: SystemMetrics
}

const NeuralCircle = memo(function NeuralCircle({ metrics }: Props) {
  const createCircularProgress = (value: number, radius: number, stroke: number) => {
    const circumference = 2 * Math.PI * radius
    const offset = circumference - (value / 100) * circumference
    return { circumference, offset }
  }

  const cpuCircle = createCircularProgress(metrics.cpu, 140, 8)
  const ramCircle = createCircularProgress(metrics.ram, 100, 6)
  const diskCircle = createCircularProgress(metrics.disk, 60, 4)

  return (
    <div className="neural-circle">
      {/* Outer Ring - CPU */}
      <svg className="circle-ring-svg" viewBox="0 0 400 400" style={{ width: '100%', height: '100%', animation: 'rotate 20s linear infinite', willChange: 'transform', transform: 'translateZ(0)' }}>
        <circle
          cx="200"
          cy="200"
          r="140"
          className="progress-circle-bg"
          style={{ stroke: 'rgba(0, 242, 255, 0.1)', fill: 'none' }}
        />
        <circle
          cx="200"
          cy="200"
          r="140"
          className="progress-circle"
          strokeDasharray={cpuCircle.circumference}
          strokeDashoffset={cpuCircle.offset}
          style={{ stroke: 'var(--neon-cyan)', fill: 'none', transition: 'stroke-dashoffset 1s ease-out', filter: 'drop-shadow(0 0 5px rgba(0, 242, 255, 0.5))' }}
        />
      </svg>

      {/* Middle Ring - RAM */}
      <svg className="circle-ring-svg" viewBox="0 0 280 280" style={{ width: '70%', height: '70%', top: '15%', left: '15%', position: 'absolute', animation: 'rotate 15s linear infinite reverse' }}>
        <circle
          cx="140"
          cy="140"
          r="100"
          className="progress-circle-bg"
          style={{ stroke: 'rgba(0, 230, 118, 0.1)', fill: 'none' }}
        />
        <circle
          cx="140"
          cy="140"
          r="100"
          className="progress-circle"
          style={{ stroke: 'var(--accent-success)', fill: 'none', transition: 'stroke-dashoffset 1s ease-out' }}
          strokeDasharray={ramCircle.circumference}
          strokeDashoffset={ramCircle.offset}
        />
      </svg>

      {/* Inner Ring - DISK */}
      <svg className="circle-ring-svg" viewBox="0 0 160 160" style={{ width: '40%', height: '40%', top: '30%', left: '30%', position: 'absolute', animation: 'rotate 10s linear infinite' }}>
        <circle
          cx="80"
          cy="80"
          r="60"
          className="progress-circle-bg"
          style={{ stroke: 'rgba(255, 61, 0, 0.1)', fill: 'none' }}
        />
        <circle
          cx="80"
          cy="80"
          r="60"
          className="progress-circle"
          style={{ stroke: 'var(--accent-warning)', fill: 'none', transition: 'stroke-dashoffset 1s ease-out' }}
          strokeDasharray={diskCircle.circumference}
          strokeDashoffset={diskCircle.offset}
        />
      </svg>
    </div>
  )
})



export default NeuralCircle
