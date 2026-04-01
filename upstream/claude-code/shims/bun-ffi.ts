export const suffix = '.node'

export function dlopen() {
  throw new Error('bun:ffi is not available in the Node build shell')
}
