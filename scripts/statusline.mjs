#!/usr/bin/env node

import { stdin, stdout, stderr, exit } from 'node:process'

function formatModel(input) {
  return input.model?.display_name || input.model?.id || 'GPT'
}

function buildStatusLine(input) {
  return `🤖 ${formatModel(input)}`
}

let raw = ''
stdin.setEncoding('utf8')
stdin.on('data', chunk => {
  raw += chunk
})
stdin.on('end', () => {
  try {
    const input = raw.trim() ? JSON.parse(raw) : {}
    stdout.write(buildStatusLine(input))
  } catch (error) {
    stderr.write(`statusline parse error: ${error instanceof Error ? error.message : String(error)}\n`)
    exit(1)
  }
})
stdin.resume()
