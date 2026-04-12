import type { SettingSource } from '../../../utils/settings/constants.js'
import type { AgentMemoryScope } from '../../../tools/AgentTool/agentMemory.js'
import type { CustomAgentDefinition } from '../../../tools/AgentTool/loadAgentsDir.js'
import type { AgentColorName } from '../../../tools/AgentTool/agentColorManager.js'

export type AgentWizardMethod = 'generate' | 'manual'

export type AgentWizardData = {
  location?: SettingSource
  method?: AgentWizardMethod
  generationPrompt?: string
  isGenerating?: boolean
  wasGenerated?: boolean
  agentType?: string
  whenToUse?: string
  systemPrompt?: string
  selectedTools?: string[]
  selectedModel?: string
  selectedColor?: string
  selectedMemory?: AgentMemoryScope
  generatedAgent?: {
    identifier: string
    whenToUse: string
    systemPrompt: string
  }
  finalAgent?: Omit<CustomAgentDefinition, 'location'> & {
    color?: AgentColorName
  }
}
