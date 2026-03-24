import { useState, useRef, useEffect, useMemo, memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChatMessage } from '../App'

interface Props {
  messages: ChatMessage[]
  onSendMessage: (message: string) => void
  aiStatus: 'idle' | 'thinking' | 'executing'
  ttsEnabled: boolean
  onToggleTts: () => void
}

const ChatPanel = memo(function ChatPanel({ messages, onSendMessage, aiStatus, ttsEnabled, onToggleTts }: Props) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const remarkPluginsList = useMemo(() => [remarkGfm], [])
  const displayMessages = useMemo(() => messages.slice(-100), [messages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, aiStatus])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (input.trim()) {
      onSendMessage(input.trim())
      setInput('')
    }
  }

  const highlightMentions = (content: string) => {
    // Match @Name patterns and wrap them in spans with model colors
    const parts = content.split(/(@\w+)/g)
    return parts.map((part, idx) => {
      const mentionMatch = part.match(/^@(\w+)$/i)
      if (mentionMatch) {
        const name = mentionMatch[1].toLowerCase()
        let color = '#888'
        if (name === 'ultron') {
          color = '#ff4444' // blood_red
        }
        return <span key={idx} style={{ color, fontWeight: 'bold', textShadow: `0 0 5px ${color}` }}>{part}</span>
      }
      return part
    })
  }

  return (
    <div className="chat-panel glass-panel">
      <div className="chat-header">
        <span>◈ NEURAL INTERFACE</span>
        <button 
          className="tts-toggle"
          onClick={onToggleTts}
          style={{ 
            opacity: ttsEnabled ? 1 : 0.5,
            fontSize: '10px',
            background: 'transparent',
            border: '1px solid currentColor',
            padding: '2px 8px',
            cursor: 'pointer',
            marginLeft: 'auto'
          }}
        >
          TTS {ttsEnabled ? 'ON' : 'OFF'}
        </button>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && aiStatus === 'idle' && (
          <div className="chat-message ai">
            NeoCore system online. Awaiting tactical input.
          </div>
        )}
        {displayMessages.map((msg) => (
          <div 
            key={msg.id} 
            className={`chat-message ${msg.role}`}
            style={msg.role === 'council' && msg.modelColor ? {
              borderLeft: `3px solid ${msg.modelColor === 'blood_red' ? '#ff4444' : '#44ff44'}`,
              background: msg.modelColor === 'blood_red' ? 'rgba(255, 68, 68, 0.1)' : 'rgba(68, 255, 68, 0.1)'
            } : undefined}
          >
            {msg.role === 'council' && msg.memberName && (
              <div className="council-tag" style={{ 
                color: msg.modelColor === 'blood_red' ? '#ff4444' : '#44ff44',
                fontSize: '10px',
                marginBottom: '4px'
              }}>
                @{msg.memberName.toUpperCase()}
              </div>
            )}
            {msg.role === 'ai' || msg.role === 'council' ? (
              <ReactMarkdown 
                remarkPlugins={remarkPluginsList}
                components={{
                  p: ({ children }) => (
                    <p>
                      {typeof children === 'string' ? highlightMentions(children) : children}
                    </p>
                  )
                }}
              >
                {msg.content}
              </ReactMarkdown>
            ) : (
              msg.content
            )}
          </div>
        ))}
        {aiStatus !== 'idle' && (
          <div className="chat-message ai">
            <span style={{ opacity: 0.6, fontStyle: 'italic' }}>Thinking...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-container" onSubmit={handleSubmit}>
        <input
          type="text"
          className="chat-input"
          placeholder="Command..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoFocus
        />
        <button type="submit" className="send-button">
          SEND
        </button>
      </form>
    </div>
  )
})

export default ChatPanel
