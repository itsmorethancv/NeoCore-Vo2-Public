import type { SystemMetrics } from '@/App'

interface HudMetricCalloutsProps {
  metrics: SystemMetrics
}

export default function HudMetricCallouts({ metrics }: HudMetricCalloutsProps) {
  return (
    <>
      <div className="data-callout callout-cpu glass-panel">
        <span className="metric-label">CPU LOAD</span>
        <span className="metric-value">{metrics.cpu.toFixed(1)}%</span>
      </div>

      <div className="data-callout callout-ram glass-panel">
        <span className="metric-label">RAM USAGE</span>
        <span className="metric-value">{metrics.ram.toFixed(1)}%</span>
      </div>

      <div className="data-callout callout-disk glass-panel">
        <span className="metric-label">DISK OPS</span>
        <span className="metric-value">{metrics.disk.toFixed(1)}%</span>
      </div>

      <div className="data-callout callout-network glass-panel">
        <span className="metric-label">NETWORK</span>
        <span className="metric-value">{(metrics.network / 1024).toFixed(2)} MB/s</span>
      </div>
    </>
  )
}
