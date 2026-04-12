export type KeybindingContextName =
  | 'Global'
  | 'Chat'
  | 'Autocomplete'
  | 'Confirmation'
  | 'Help'
  | 'Transcript'
  | 'HistorySearch'
  | 'Task'
  | 'ThemePicker'
  | 'Settings'
  | 'Tabs'
  | 'Scroll'
  | 'Attachments'
  | 'Footer'
  | 'MessageSelector'
  | 'MessageActions'
  | 'DiffDialog'
  | 'ModelPicker'
  | 'Select'
  | 'Plugin'

export type KeybindingAction = string

export type ParsedKeystroke = {
  key: string
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
  super: boolean
}

export type Chord = ParsedKeystroke[]

export type KeybindingBlock = {
  context: KeybindingContextName
  bindings: Record<string, KeybindingAction | null>
}

export type ParsedBinding = {
  chord: Chord
  action: KeybindingAction | null
  context: KeybindingContextName
}
