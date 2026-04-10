import type { ModelAlias } from 'src/utils/model/aliases.js'
import { getAgentModel } from 'src/utils/model/agent.js'
import { renderModelName } from 'src/utils/model/model.js'
import { getBuiltInAgents } from './builtInAgents.js'

type AgentToolUseInput = Partial<{
  model?: ModelAlias
  subagent_type: string
}>

function getToolUseConfiguredModel(
  input: AgentToolUseInput,
): string | undefined {
  if (input.model) {
    return input.model
  }

  if (!input.subagent_type) {
    return undefined
  }

  return getBuiltInAgents().find(agent => agent.agentType === input.subagent_type)
    ?.model
}

export function getAgentToolUseModelTag(
  input: AgentToolUseInput,
  parentModel: string,
): string | null {
  const configuredModel = getToolUseConfiguredModel(input)
  if (!configuredModel) {
    return null
  }

  const resolvedModel = getAgentModel(configuredModel, parentModel)
  if (resolvedModel === parentModel) {
    return null
  }

  return renderModelName(resolvedModel)
}
