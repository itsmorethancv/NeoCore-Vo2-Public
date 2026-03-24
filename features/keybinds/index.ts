export interface Keybind {
  key: string
  description: string
  action: string
}

export const KEYBINDS: Keybind[] = [
  {
    key: 'Ctrl+Q',
    description: 'Quit and close NeoCore HUD',
    action: 'quit'
  }
]

export const DEFAULT_KEYBINDS = KEYBINDS
