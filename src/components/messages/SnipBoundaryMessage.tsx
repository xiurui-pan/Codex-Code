import type React from 'react'
import type { SystemMessage } from '../../types/message.js'

type Props = {
  message: SystemMessage
}

// External builds currently stub snip projection, so this component is a
// no-op compatibility shim unless snip boundaries are reintroduced.
export function SnipBoundaryMessage(_props: Props): React.ReactNode {
  return null
}
