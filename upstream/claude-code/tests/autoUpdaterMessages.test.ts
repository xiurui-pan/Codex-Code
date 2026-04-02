import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getAutoUpdateFailureHint,
  getAutoUpdateRecoveryCommand,
  resolveAutoUpdatePackageName,
} from '../src/utils/autoUpdaterMessages.ts'

test('auto updater recovery command falls back to stable package name when macro package url is missing', () => {
  assert.equal(
    getAutoUpdateRecoveryCommand({
      hasLocalInstall: false,
      packageUrl: undefined,
      userType: undefined,
    }),
    'npm install -g @anthropic-ai/claude-code',
  )
})

test('auto updater recovery command uses ant fallback package for internal user type', () => {
  assert.equal(
    resolveAutoUpdatePackageName(undefined, 'ant'),
    '@anthropic-ai/claude-cli',
  )
})

test('auto updater recovery command uses local update path when local install exists', () => {
  assert.equal(
    getAutoUpdateRecoveryCommand({
      hasLocalInstall: true,
      packageUrl: '@example/claude-code-dev',
      userType: undefined,
    }),
    'cd ~/.claude/local && npm update @example/claude-code-dev',
  )
})

test('auto updater install_failed hint mentions restricted network guidance', () => {
  assert.match(
    getAutoUpdateFailureHint('install_failed') ?? '',
    /network is restricted/i,
  )
  assert.equal(getAutoUpdateFailureHint('no_permissions'), null)
})
