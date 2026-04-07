import { useCallback, useState } from 'react'

export type VerificationStatus =
  | 'loading'
  | 'valid'
  | 'invalid'
  | 'missing'
  | 'error'

export type ApiKeyVerificationResult = {
  status: VerificationStatus
  reverify: () => Promise<void>
  error: Error | null
}

export function useApiKeyVerification(): ApiKeyVerificationResult {
  const [error] = useState<Error | null>(null)

  const reverify = useCallback(async (): Promise<void> => {}, [])

  return {
    status: 'valid',
    reverify,
    error,
  }
}
