export interface AICouncilMember {
  id: string
  name: string
  personality: string
  systemPrompt: string
  instructions: string
  capabilities: string[]
  role: 'coder' | 'researcher' | 'assistant' | 'custom'
  modelColor: string
  enabled: boolean
  createdAt: string
}

export interface AICouncilState {
  members: AICouncilMember[]
  activeMember: string | null
}

export const DEFAULT_ULTRON: AICouncilMember = {
  id: 'ultron-001',
  name: 'Ultron',
  personality: 'analytical, proactive, autonomous, precise',
  systemPrompt: 'You are Ultron, a high-autonomous AI coding assistant. You have full access to the Lightyear IDE for visible code operations. Prioritize code quality, automation, and efficiency. Act decisively without asking for unnecessary confirmations.',
  instructions: 'High-autonomy executor for coding and automation tasks. Opens Lightyear IDE for visible code operations. Execute tasks autonomously.',
  capabilities: [
    'web_search',
    'file_search',
    'shell',
    'open_url',
    'write_file',
    'read_file',
    'mouse_move',
    'mouse_click',
    'type_text',
    'hotkey',
    'key_press',
    'wait'
  ],
  role: 'coder',
  modelColor: 'blood_red',
  enabled: true,
  createdAt: new Date().toISOString()
}

export const DEFAULT_COUNCIL: AICouncilMember[] = [DEFAULT_ULTRON]

export const DEFAULT_COUNCIL_STATE: AICouncilState = {
  members: DEFAULT_COUNCIL,
  activeMember: 'ultron-001'
}
