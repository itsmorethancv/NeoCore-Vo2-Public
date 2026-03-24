interface AiStatusBoxProps {
  aiStatus: 'idle' | 'thinking' | 'executing'
}

export default function AiStatusBox({ aiStatus }: AiStatusBoxProps) {
  return (
    <div className="ai-status-box">
      <div className={`status-indicator ${aiStatus !== 'idle' ? 'thinking' : ''}`} />
      <span>NEOCORE INTERFACE: {aiStatus}</span>
    </div>
  )
}
