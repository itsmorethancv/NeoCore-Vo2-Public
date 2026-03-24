import { memo } from 'react'
import { LogEntry } from '../App'

interface Props {
    logs: LogEntry[]
}

const CommandLog = memo(function CommandLog({ logs }: Props) {
    return (
        <div className="command-log glass-panel">
            <div className="log-header">
                ◈ TACTICAL LOG_STREAM
            </div>
            <div className="log-entries">
                {logs.length === 0 ? (
                    <div className="log-entry" style={{ opacity: 0.5 }}>System ready...</div>
                ) : (
                    logs.slice(-10).map((log) => (
                        <div key={log.id} className="log-entry">
                            <span className="log-timestamp">[{log.timestamp.toLocaleTimeString()}]</span>
                            <span className="log-message">{log.message}</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
})

export default CommandLog

