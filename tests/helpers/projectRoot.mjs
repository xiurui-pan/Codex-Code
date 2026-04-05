import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Absolute path to the project root (Codex-Code/). */
export const projectRoot = join(__dirname, '..', '..')
