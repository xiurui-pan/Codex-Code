import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { projectRoot } from './helpers/projectRoot.mjs'
import { join } from 'node:path'

const ROOT = join(projectRoot, 'src')

test('native auto updater failure copy points to Codex recovery guidance', async () => {
  const source = await readFile(`${ROOT}/components/NativeAutoUpdater.tsx`, 'utf8')

  assert.match(source, /Try <Text bold>\/doctor<\/Text> or/)
  assert.match(source, /getAutoUpdateRecoveryCommand/)
  assert.doesNotMatch(source, /Try <Text bold>\/status<\/Text>/)
  assert.doesNotMatch(source, /claude rollback --safe/)
})

test('npm deprecation notification no longer shows Claude-only install guidance', async () => {
  const source = await readFile(
    `${ROOT}/hooks/notifs/useNpmDeprecationNotification.tsx`,
    'utf8',
  )

  assert.match(source, /Codex Code no longer uses the legacy npm installer path/)
  assert.doesNotMatch(source, /Claude Code has switched from npm to native installer/)
  assert.doesNotMatch(source, /`claude install`/)
})

test('update and doctor guidance no longer points to Claude-only install commands or links', async () => {
  const updateSource = await readFile(`${ROOT}/cli/update.ts`, 'utf8')
  const doctorSource = await readFile(`${ROOT}/utils/doctorDiagnostic.ts`, 'utf8')
  const fastModeSource = await readFile(`${ROOT}/utils/fastMode.ts`, 'utf8')

  assert.doesNotMatch(updateSource, /claude install/)
  assert.doesNotMatch(updateSource, /Claude Code is up to date/)
  assert.doesNotMatch(updateSource, /claude doctor/)
  assert.match(updateSource, /Codex Code is up to date/)
  assert.match(updateSource, /Try running "\/doctor" for diagnostics/)
  assert.doesNotMatch(fastModeSource, /https:\/\/claude\.com\/product\/claude-code/)
  assert.doesNotMatch(doctorSource, /Consider using native installation: claude install/)
  assert.doesNotMatch(doctorSource, /Run claude install to update configuration/)
  assert.doesNotMatch(doctorSource, /Use `claude install` for native installation/)
  assert.doesNotMatch(doctorSource, /npm -g uninstall @anthropic-ai\/claude-code/)
})

test('plugin and installer copy no longer points users at Claude-only commands', async () => {
  const pluginSource = await readFile(`${ROOT}/cli/handlers/plugins.ts`, 'utf8')
  const autoUpdaterSource = await readFile(`${ROOT}/utils/autoUpdater.ts`, 'utf8')
  const localInstallerSource = await readFile(`${ROOT}/utils/localInstaller.ts`, 'utf8')
  const windowsSource = await readFile(`${ROOT}/utils/windowsPaths.ts`, 'utf8')
  const doctorSource = await readFile(`${ROOT}/utils/doctorDiagnostic.ts`, 'utf8')
  const bridgeSource = await readFile(`${ROOT}/bridge/bridgeEnabled.ts`, 'utf8')
  const envLessBridgeSource = await readFile(
    `${ROOT}/bridge/envLessBridgeConfig.ts`,
    'utf8',
  )
  const initReplBridgeSource = await readFile(
    `${ROOT}/bridge/initReplBridge.ts`,
    'utf8',
  )
  const movedCommandSource = await readFile(
    `${ROOT}/commands/createMovedToPluginCommand.ts`,
    'utf8',
  )
  const mcpHandlerSource = await readFile(`${ROOT}/cli/handlers/mcp.tsx`, 'utf8')
  const mcpAddSource = await readFile(
    `${ROOT}/commands/mcp/addCommand.ts`,
    'utf8',
  )

  assert.match(pluginSource, /Use `\/plugin install` to install a plugin/)
  assert.doesNotMatch(pluginSource, /claude plugin install/)

  assert.match(autoUpdaterSource, /version of Codex Code/)
  assert.doesNotMatch(autoUpdaterSource, /version of Claude Code/)
  assert.doesNotMatch(autoUpdaterSource, /To update, please run:\s+claude update/)
  assert.doesNotMatch(autoUpdaterSource, /Try updating again with 'claude update'/)
  assert.doesNotMatch(autoUpdaterSource, /new version of claude/)

  assert.doesNotMatch(localInstallerSource, /Failed to install Claude CLI package/)
  assert.match(localInstallerSource, /local Codex Code package/)

  assert.doesNotMatch(doctorSource, /alias claude="~\/\.claude\/local\/claude"/)
  assert.doesNotMatch(windowsSource, /Claude Code on Windows requires git-bash/)
  assert.match(windowsSource, /Codex Code on Windows requires git-bash/)

  assert.doesNotMatch(bridgeSource, /Your version of Claude Code/)
  assert.doesNotMatch(envLessBridgeSource, /Your version of Claude Code/)
  assert.doesNotMatch(initReplBridgeSource, /run `claude update` to upgrade/)
  assert.match(movedCommandSource, /\/plugin install .*@claude-plugins-official/)
  assert.doesNotMatch(movedCommandSource, /claude plugin install/)

  assert.match(mcpHandlerSource, /codex-code mcp add/)
  assert.match(mcpHandlerSource, /codex-code mcp remove/)
  assert.doesNotMatch(mcpHandlerSource, /claude mcp/)

  assert.match(mcpAddSource, /codex-code mcp add/)
  assert.match(mcpAddSource, /codex-code mcp xaa setup/)
  assert.doesNotMatch(mcpAddSource, /claude mcp/)
})

test('tui helper copy uses Codex Code wording in MCP, IDE, and attribution output', async () => {
  const mcpSource = await readFile(`${ROOT}/components/mcp/MCPSettings.tsx`, 'utf8')
  const ideSource = await readFile(`${ROOT}/commands/ide/ide.tsx`, 'utf8')
  const attributionSource = await readFile(`${ROOT}/utils/attribution.ts`, 'utf8')

  assert.doesNotMatch(mcpSource, /claude mcp --help/)
  assert.match(mcpSource, /use \/mcp to inspect or add MCP servers/)

  assert.doesNotMatch(ideSource, /Claude Code extension/)
  assert.doesNotMatch(ideSource, /Only one Claude Code instance/)
  assert.match(ideSource, /Codex Code extension/)
  assert.match(ideSource, /Only one Codex Code instance/)

  assert.doesNotMatch(attributionSource, /Generated with \[Claude Code\]/)
  assert.match(attributionSource, /Generated with Codex Code/)
})

test('main help and session copy use Codex-facing wording', async () => {
  const mainSource = await readFile(`${ROOT}/main.tsx`, 'utf8')
  const oauthSource = await readFile(`${ROOT}/components/ConsoleOAuthFlow.tsx`, 'utf8')
  const resumeSource = await readFile(`${ROOT}/components/ResumeTask.tsx`, 'utf8')

  assert.match(mainSource, /const cliCommandName = 'codex-code'/)
  assert.match(mainSource, /program\.name\(cliCommandName\)/)
  assert.match(mainSource, /launch Codex Code with just `codex-code`/)
  assert.match(mainSource, /Start the Codex Code MCP server/)
  assert.match(mainSource, /Manage Codex Code plugins/)
  assert.match(mainSource, /Manage Codex Code marketplaces/)
  assert.match(mainSource, /Check the health of your Codex Code auto-updater/)
  assert.match(mainSource, /Usage: codex-code ssh/)
  assert.match(mainSource, /Usage: codex-code assistant/)
  assert.match(mainSource, /auth\.command\('login'\)\.description\('Sign in'\)/)
  assert.match(mainSource, /auth\.command\('logout'\)\.description\('Log out'\)/)
  assert.doesNotMatch(mainSource, /when Claude is run with the -p mode/)
  assert.doesNotMatch(mainSource, /Anthropic auth is strictly ANTHROPIC_API_KEY/)
  assert.doesNotMatch(mainSource, /Sign in to your Anthropic account/)
  assert.doesNotMatch(mainSource, /Log out from your Anthropic account/)
  assert.doesNotMatch(mainSource, /program\.name\('claude'\)/)
  assert.doesNotMatch(mainSource, /launch Claude Code with just `claude`/)

  assert.match(oauthSource, /Codex Code login successful/)
  assert.match(oauthSource, /restart Codex Code/)
  assert.match(oauthSource, /Creating API key for Codex Code/)
  assert.doesNotMatch(oauthSource, /Claude Code login successful/)
  assert.doesNotMatch(oauthSource, /Claude account/)
  assert.doesNotMatch(oauthSource, /Anthropic Console/)

  assert.match(resumeSource, /Loading Codex Code sessions…/)
  assert.match(resumeSource, /Error loading Codex Code sessions/)
  assert.match(resumeSource, /No Codex Code sessions found/)
  assert.match(resumeSource, /Sorry, Codex Code encountered an error/)
  assert.doesNotMatch(resumeSource, /Loading Claude Code sessions…/)
})

test('secondary TUI copy no longer tells users to ask Claude', async () => {
  const interruptSource = await readFile(`${ROOT}/components/InterruptedByUser.tsx`, 'utf8')
  const eventModeSource = await readFile(`${ROOT}/components/hooks/SelectEventMode.tsx`, 'utf8')
  const matcherModeSource = await readFile(
    `${ROOT}/components/hooks/SelectMatcherMode.tsx`,
    'utf8',
  )
  const hookModeSource = await readFile(
    `${ROOT}/components/hooks/SelectHookMode.tsx`,
    'utf8',
  )
  const hooksMenuSource = await readFile(
    `${ROOT}/components/hooks/HooksConfigMenu.tsx`,
    'utf8',
  )
  const autoModeSource = await readFile(
    `${ROOT}/components/AutoModeOptInDialog.tsx`,
    'utf8',
  )
  const settingsConfigSource = await readFile(
    `${ROOT}/components/Settings/Config.tsx`,
    'utf8',
  )

  assert.match(interruptSource, /What should Codex Code do instead\?/)
  assert.doesNotMatch(interruptSource, /What should Claude do instead\?/)
  assert.doesNotMatch(eventModeSource, /ask Claude\./)
  assert.doesNotMatch(matcherModeSource, /ask Claude\./)
  assert.doesNotMatch(hookModeSource, /ask Claude\./)
  assert.doesNotMatch(hooksMenuSource, /ask Claude\./)
  assert.match(eventModeSource, /ask Codex Code\./)
  assert.match(matcherModeSource, /ask Codex Code\./)
  assert.match(hookModeSource, /ask Codex Code\./)
  assert.match(hooksMenuSource, /ask Codex Code\./)
  assert.match(autoModeSource, /Auto mode lets Codex Code handle permission prompts/)
  assert.doesNotMatch(autoModeSource, /Claude checks each tool call/)
  assert.match(settingsConfigSource, /Push when Codex Code decides/)
  assert.doesNotMatch(settingsConfigSource, /Push when Claude decides/)
})

test('project onboarding copy points to Codex Code rather than Claude', async () => {
  const onboardingSource = await readFile(`${ROOT}/projectOnboardingState.ts`, 'utf8')

  assert.match(onboardingSource, /Ask Codex Code to create a new app or clone a repository/)
  assert.match(
    onboardingSource,
    /Run \/init to create a CLAUDE\.md file with instructions for Codex Code/,
  )
  assert.doesNotMatch(onboardingSource, /Ask Claude to create a new app or clone a repository/)
  assert.doesNotMatch(
    onboardingSource,
    /Run \/init to create a CLAUDE\.md file with instructions for Claude/,
  )
})

test('remaining visible help and warning copy avoid Claude-branded links and command names', async () => {
  const claudeMdDialogSource = await readFile(
    `${ROOT}/components/ClaudeMdExternalIncludesDialog.tsx`,
    'utf8',
  )
  const hookEventSource = await readFile(
    `${ROOT}/components/hooks/SelectEventMode.tsx`,
    'utf8',
  )
  const sandboxOverridesSource = await readFile(
    `${ROOT}/components/sandbox/SandboxOverridesTab.tsx`,
    'utf8',
  )
  const sandboxSettingsSource = await readFile(
    `${ROOT}/components/sandbox/SandboxSettings.tsx`,
    'utf8',
  )
  const teleportMismatchSource = await readFile(
    `${ROOT}/components/TeleportRepoMismatchDialog.tsx`,
    'utf8',
  )
  const assistantMessageSource = await readFile(
    `${ROOT}/components/messages/AssistantTextMessage.tsx`,
    'utf8',
  )

  assert.doesNotMatch(claudeMdDialogSource, /code\.claude\.com/)
  assert.doesNotMatch(hookEventSource, /code\.claude\.com/)
  assert.match(hookEventSource, /ask Codex Code\./)

  assert.match(sandboxOverridesSource, /Codex Code can retry/)
  assert.doesNotMatch(sandboxOverridesSource, /Claude can retry/)
  assert.doesNotMatch(sandboxOverridesSource, /code\.claude\.com/)
  assert.doesNotMatch(sandboxSettingsSource, /code\.claude\.com/)

  assert.match(teleportMismatchSource, /Run codex-code --teleport/)
  assert.doesNotMatch(teleportMismatchSource, /Run claude --teleport/)

  assert.doesNotMatch(assistantMessageSource, /platform\.claude\.com/)
  assert.match(assistantMessageSource, /Add funds in your billing settings/)
})

test('tips, status notices, and chrome startup copy avoid stale Claude wording in Codex mode', async () => {
  const tipSource = await readFile(`${ROOT}/services/tips/tipRegistry.ts`, 'utf8')
  const statusSource = await readFile(`${ROOT}/utils/statusNoticeDefinitions.tsx`, 'utf8')

  assert.match(tipSource, /codex-code --continue or codex-code --resume/)
  assert.doesNotMatch(tipSource, /claude --continue/)
  assert.doesNotMatch(tipSource, /@claude/)
  assert.doesNotMatch(tipSource, /clau\.de\/web/)
  assert.doesNotMatch(tipSource, /Claude desktop app/)
  assert.doesNotMatch(tipSource, /\/mobile/)
  assert.match(tipSource, /currentStageDisableClaudeProductTips/)

  assert.doesNotMatch(statusSource, /claude \/logout/)
  assert.doesNotMatch(statusSource, /docs\.claude\.com/)
  assert.doesNotMatch(statusSource, /Anthropic Console key/)
  assert.doesNotMatch(statusSource, /instead of Claude account/)
  assert.match(statusSource, /isCurrentPhaseCustomCodexProvider\(\)/)
  assert.match(statusSource, /run `\/logout`/)
})

test('command descriptions avoid stale Claude Code wording', async () => {
  const statuslineSource = await readFile(`${ROOT}/commands/statusline.tsx`, 'utf8')
  const statsSource = await readFile(`${ROOT}/commands/stats/index.ts`, 'utf8')
  const doctorSource = await readFile(`${ROOT}/commands/doctor/index.ts`, 'utf8')
  const memorySource = await readFile(`${ROOT}/commands/memory/index.ts`, 'utf8')
  const reviewSource = await readFile(`${ROOT}/commands/review.ts`, 'utf8')
  const ultraplanSource = await readFile(`${ROOT}/commands/ultraplan.tsx`, 'utf8')
  const installSource = await readFile(`${ROOT}/commands/install.tsx`, 'utf8')
  const desktopCommandSource = await readFile(`${ROOT}/commands/desktop/index.ts`, 'utf8')
  const fastCommandSource = await readFile(`${ROOT}/commands/fast/index.ts`, 'utf8')
  const fastPickerSource = await readFile(`${ROOT}/commands/fast/fast.tsx`, 'utf8')
  const loginSource = await readFile(`${ROOT}/commands/login/index.ts`, 'utf8')
  const logoutSource = await readFile(`${ROOT}/commands/logout/index.ts`, 'utf8')
  const settingsConfigSource = await readFile(`${ROOT}/components/Settings/Config.tsx`, 'utf8')

  assert.match(statuslineSource, /Set up Codex Code's status line UI/)
  assert.match(statsSource, /Show your Codex Code usage statistics and activity/)
  assert.match(doctorSource, /Diagnose and verify your Codex Code installation and settings/)
  assert.match(memorySource, /Edit Codex memory files/)
  assert.match(reviewSource, /Runs in the Codex Code web session\./)
  assert.match(
    ultraplanSource,
    /Ask Codex to stay in plan mode and produce a deeper, execution-ready plan in this session/,
  )
  assert.match(installSource, /Install Codex Code native build/)
  assert.match(desktopCommandSource, /Continue the current session in Codex Code Desktop/)
  assert.match(fastCommandSource, /Toggle fast mode \(\$\{FAST_MODE_MODEL_DISPLAY\} for faster responses\)/)
  assert.match(fastPickerSource, /High-speed mode that uses \$\{FAST_MODE_MODEL_DISPLAY\} for faster responses\./)
  assert.match(settingsConfigSource, /Fast mode \(\$\{FAST_MODE_MODEL_DISPLAY\} for faster responses\)/)
  assert.doesNotMatch(fastCommandSource, /Opus 4\.6 only/)
  assert.doesNotMatch(fastPickerSource, /Opus 4\.6 only/)
  assert.doesNotMatch(settingsConfigSource, /Opus 4\.6 only/)
  assert.doesNotMatch(reviewSource, /Runs in Claude Code on the web\./)
  assert.doesNotMatch(ultraplanSource, /Codex Code web session drafts an advanced plan/)
  assert.doesNotMatch(ultraplanSource, /Claude Code on the web drafts an advanced plan/)
  assert.doesNotMatch(loginSource, /Anthropic account/)
  assert.doesNotMatch(logoutSource, /Anthropic account/)
  assert.match(logoutSource, /Sign out of your current account/)
})

test('desktop and help surfaces use Codex Code wording', async () => {
  const helpSource = await readFile(`${ROOT}/components/HelpV2/HelpV2.tsx`, 'utf8')
  const desktopHandoffSource = await readFile(
    `${ROOT}/components/DesktopHandoff.tsx`,
    'utf8',
  )
  const desktopImportSource = await readFile(
    `${ROOT}/components/MCPServerDesktopImportDialog.tsx`,
    'utf8',
  )
  const deepLinkSource = await readFile(`${ROOT}/utils/desktopDeepLink.ts`, 'utf8')
  const desktopUtilsSource = await readFile(`${ROOT}/utils/claudeDesktop.ts`, 'utf8')
  const mcpHandlerSource = await readFile(`${ROOT}/cli/handlers/mcp.tsx`, 'utf8')
  const cliEntrySource = await readFile(`${ROOT}/entrypoints/cli.tsx`, 'utf8')

  assert.match(helpSource, /Codex Code v\$\{MACRO\.VERSION\}/)
  assert.match(cliEntrySource, /\(Codex Code\)/)
  assert.match(desktopHandoffSource, /Codex Code Desktop is not installed\./)
  assert.match(desktopHandoffSource, /Opening in Codex Code Desktop/)
  assert.match(desktopHandoffSource, /Session transferred to Codex Code Desktop/)
  assert.match(desktopImportSource, /Import MCP Servers from the desktop app/)
  assert.match(deepLinkSource, /Codex Code Desktop is not installed/)
  assert.match(desktopUtilsSource, /Codex Code Desktop integration only works/)
  assert.match(mcpHandlerSource, /No MCP servers found in the desktop app configuration/)
  assert.doesNotMatch(helpSource, /Claude Code v\$\{MACRO\.VERSION\}/)
})

test('debug and MCP help copy no longer points at Claude-only commands or docs', async () => {
  const debugSkillSource = await readFile(`${ROOT}/skills/bundled/debug.ts`, 'utf8')
  const updateConfigSource = await readFile(`${ROOT}/skills/bundled/updateConfig.ts`, 'utf8')
  const mcpListPanelSource = await readFile(`${ROOT}/components/mcp/MCPListPanel.tsx`, 'utf8')
  const mcpDialogSource = await readFile(`${ROOT}/components/MCPServerDialogCopy.tsx`, 'utf8')
  const mcpConfigSource = await readFile(`${ROOT}/services/mcp/config.ts`, 'utf8')
  const authHandlerSource = await readFile(`${ROOT}/cli/handlers/auth.ts`, 'utf8')

  assert.match(debugSkillSource, /codex-code --debug/)
  assert.doesNotMatch(debugSkillSource, /claude --debug/)
  assert.match(updateConfigSource, /codex-code --debug/)
  assert.doesNotMatch(updateConfigSource, /claude --debug/)
  assert.match(mcpListPanelSource, /Run codex-code --debug to see error logs/)
  assert.match(mcpListPanelSource, /developers\.openai\.com\/codex\/mcp/)
  assert.doesNotMatch(mcpListPanelSource, /code\.claude\.com\/docs\/en\/mcp/)
  assert.match(mcpDialogSource, /developers\.openai\.com\/codex\/mcp/)
  assert.doesNotMatch(mcpDialogSource, /code\.claude\.com\/docs\/en\/mcp/)
  assert.match(mcpConfigSource, /developers\.openai\.com\/codex\/mcp/)
  assert.doesNotMatch(mcpConfigSource, /code\.claude\.com\/docs\/en\/mcp/)
  assert.match(authHandlerSource, /Successfully logged out\./)
  assert.doesNotMatch(authHandlerSource, /Successfully logged out from your Anthropic account/)
})
