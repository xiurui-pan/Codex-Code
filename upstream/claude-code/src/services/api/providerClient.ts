import { getAnthropicClient } from './client.js'

export type ProviderClient = Awaited<ReturnType<typeof getAnthropicClient>>
export type ProviderClientGetter = typeof getAnthropicClient

export const getProviderClient: ProviderClientGetter = getAnthropicClient
