#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')
const dist = path.join(root, 'dist')
const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']
const assetExtensions = ['.md', '.txt', '.json', '.d.ts']
const currentStageRoots = [path.join(root, 'src', 'entrypoints', 'cli.tsx')]
const currentStageDisabledFeatures = new Set([
  'AGENT_TRIGGERS',
  'AGENT_TRIGGERS_REMOTE',
  'AGENT_MEMORY_SNAPSHOT',
  'CHICAGO_MCP',
  'CCR_AUTO_CONNECT',
  'CCR_MIRROR',
  'CCR_REMOTE_SETUP',
  'BASH_CLASSIFIER',
  'BG_SESSIONS',
  'BRIDGE_MODE',
  'BUDDY',
  'CACHED_MICROCOMPACT',
  'COMMIT_ATTRIBUTION',
  'CONTEXT_COLLAPSE',
  'DAEMON',
  'DIRECT_CONNECT',
  'EXPERIMENTAL_SKILL_SEARCH',
  'HISTORY_SNIP',
  'KAIROS',
  'KAIROS_BRIEF',
  'KAIROS_CHANNELS',
  'KAIROS_DREAM',
  'KAIROS_GITHUB_WEBHOOKS',
  'KAIROS_PUSH_NOTIFICATION',
  'MEMORY_SHAPE_TELEMETRY',
  'MCP_SKILLS',
  'MONITOR_TOOL',
  'OVERFLOW_TEST_TOOL',
  'PROACTIVE',
  'REACTIVE_COMPACT',
  'REVIEW_ARTIFACT',
  'SSH_REMOTE',
  'TEAMMEM',
  'TEMPLATES',
  'TERMINAL_PANEL',
  'TRANSCRIPT_CLASSIFIER',
  'UDS_INBOX',
  'ULTRAPLAN',
  'VOICE_MODE',
  'WEB_BROWSER_TOOL',
  'WORKFLOW_SCRIPTS',
  'BYOC_ENVIRONMENT_RUNNER',
  'SELF_HOSTED_RUNNER',
])
const currentStageDisabledImportEntries = [
  [
    path.join('src', 'cli', 'print.ts'),
    new Set([
      'src/cli/remoteIO.js',
      'src/bridge/initReplBridge.js',
      '../utils/udsMessaging.js',
      '../proactive/index.js',
    ]),
  ],
  [
    path.join('src', 'tools', 'AgentTool', 'builtInAgents.ts'),
    new Set(['../../coordinator/workerAgent.js']),
  ],
  [
    path.join('src', 'dialogLaunchers.tsx'),
    new Set([
      './components/agents/SnapshotUpdateDialog.js',
      './assistant/AssistantSessionChooser.js',
      './commands/assistant/assistant.js',
    ]),
  ],
  [
    path.join('src', 'main.tsx'),
    new Set([
      './assistant/sessionDiscovery.js',
      './bridge/bridgeEnabled.js',
      './bridge/bridgeMain.js',
      './bridge/trustedDevice.js',
      './cli/handlers/auth.js',
      './cli/handlers/ant.js',
      './cli/handlers/plugins.js',
      './commands/clear/caches.js',
      './components/agents/SnapshotUpdateDialog.js',
      './components/TeleportProgress.js',
      './proactive/index.js',
      './server/backends/dangerousBackend.js',
      './server/connectHeadless.js',
      './server/lockfile.js',
      './server/parseConnectUrl.js',
      './server/server.js',
      './server/serverBanner.js',
      './server/serverLog.js',
      './server/sessionManager.js',
      './services/settingsSync/index.js',
      './ssh/createSSHSession.js',
      './tools/BriefTool/BriefTool.js',
      './tools/BriefTool/prompt.js',
      './utils/auth.js',
      './utils/ccshareResume.js',
      './utils/deepLink/protocolHandler.js',
      './utils/eventLoopStallDetector.js',
      './utils/sdkHeapDumpMonitor.js',
      './utils/sessionDataUploader.js',
      'src/cli/rollback.js',
      'src/cli/up.js',
    ]),
  ],
  [
    path.join('src', 'services', 'compact', 'microCompact.ts'),
    new Set(['./cachedMicrocompact.js']),
  ],
  [
    path.join('src', 'services', 'compact', 'compact.ts'),
    new Set(['../sessionTranscript/sessionTranscript.js']),
  ],
  [
    path.join('src', 'services', 'compact', 'postCompactCleanup.ts'),
    new Set([
      '../contextCollapse/index.js',
      '../../utils/attributionHooks.js',
    ]),
  ],
  [
    path.join('src', 'services', 'compact', 'autoCompact.ts'),
    new Set(['../contextCollapse/index.js']),
  ],
  [
    path.join('src', 'query.ts'),
    new Set([
      './services/compact/reactiveCompact.js',
      './services/contextCollapse/index.js',
      './services/skillSearch/prefetch.js',
      './jobs/classifier.js',
      './services/compact/snipCompact.js',
      './utils/taskSummary.js',
    ]),
  ],
  [
    path.join('src', 'utils', 'permissions', 'yoloClassifier.ts'),
    new Set([
      './yolo-classifier-prompts/auto_mode_system_prompt.txt',
      './yolo-classifier-prompts/permissions_external.txt',
      './yolo-classifier-prompts/permissions_anthropic.txt',
    ]),
  ],
  [
    path.join('src', 'commands', 'ultraplan.tsx'),
    new Set(['../utils/ultraplan/prompt.txt']),
  ],
  [
    path.join('src', 'components', 'messages', 'UserTextMessage.tsx'),
    new Set([
      './UserGitHubWebhookMessage.js',
      './UserForkBoilerplateMessage.js',
      './UserCrossSessionMessage.js',
      './UserChannelMessage.js',
    ]),
  ],
  [
    path.join('src', 'components', 'messages', 'CollapsedReadSearchContent.tsx'),
    new Set(['./teamMemCollapsed.js']),
  ],
  [
    path.join('src', 'components', 'messages', 'SystemTextMessage.tsx'),
    new Set(['./teamMemSaved.js']),
  ],
  [
    path.join('src', 'components', 'ContextVisualization.tsx'),
    new Set(['../services/contextCollapse/index.js']),
  ],
  [
    path.join('src', 'components', 'TokenWarning.tsx'),
    new Set(['../services/contextCollapse/index.js']),
  ],
  [
    path.join('src', 'components', 'Messages.tsx'),
    new Set(['../proactive/index.js']),
  ],
  [
    path.join('src', 'components', 'LogoV2', 'LogoV2.tsx'),
    new Set(['./ChannelsNotice.js']),
  ],
  [
    path.join('src', 'components', 'Message.tsx'),
    new Set([
      '../services/compact/snipProjection.js',
      './messages/SnipBoundaryMessage.js',
    ]),
  ],
  [
    path.join('src', 'components', 'tasks', 'BackgroundTasksDialog.tsx'),
    new Set([
      './WorkflowDetailDialog.js',
      'src/tasks/LocalWorkflowTask/LocalWorkflowTask.js',
      '../../tasks/MonitorMcpTask/MonitorMcpTask.js',
      './MonitorMcpDetailDialog.js',
    ]),
  ],
  [
    path.join('src', 'components', 'permissions', 'PermissionRequest.tsx'),
    new Set([
      '../../tools/ReviewArtifactTool/ReviewArtifactTool.js',
      './ReviewArtifactPermissionRequest/ReviewArtifactPermissionRequest.js',
      '../../tools/WorkflowTool/WorkflowTool.js',
      '../../tools/WorkflowTool/WorkflowPermissionRequest.js',
      '../../tools/MonitorTool/MonitorTool.js',
      './MonitorPermissionRequest/MonitorPermissionRequest.js',
    ]),
  ],
  [
    path.join('src', 'components', 'agents', 'ToolSelector.tsx'),
    new Set(['src/tools/TungstenTool/TungstenTool.js']),
  ],
  [
    path.join('src', 'tools', 'AgentTool', 'runAgent.ts'),
    new Set(['../../tasks/MonitorMcpTask/MonitorMcpTask.js']),
  ],
  [
    path.join('src', 'tools', 'AgentTool', 'AgentTool.tsx'),
    new Set(['../../proactive/index.js']),
  ],
  [
    path.join('src', 'utils', 'conversationRecovery.ts'),
    new Set(['./udsClient.js']),
  ],
  [
    path.join('src', 'tools', 'SendMessageTool', 'SendMessageTool.ts'),
    new Set([
      '../../bridge/peerSessions.js',
      '../../utils/udsClient.js',
    ]),
  ],
  [
    path.join('src', 'utils', 'messages', 'systemInit.ts'),
    new Set(['../udsMessaging.js']),
  ],
  [
    path.join('src', 'tools', 'SkillTool', 'SkillTool.ts'),
    new Set([
      '../../services/skillSearch/remoteSkillState.js',
      '../../services/skillSearch/remoteSkillLoader.js',
      '../../services/skillSearch/telemetry.js',
      '../../services/skillSearch/featureCheck.js',
    ]),
  ],
  [
    path.join('src', 'constants', 'prompts.ts'),
    new Set(['../services/skillSearch/featureCheck.js']),
  ],
  [
    path.join('src', 'utils', 'attachments.ts'),
    new Set([
      '../services/skillSearch/featureCheck.js',
      '../services/skillSearch/prefetch.js',
      '../services/compact/snipCompact.js',
      './permissions/autoModeState.js',
    ]),
  ],
  [
    path.join('src', 'utils', 'collapseReadSearch.ts'),
    new Set(['../tools/SnipTool/prompt.js']),
  ],
  [
    path.join('src', 'utils', 'messages.ts'),
    new Set([
      '../services/compact/snipCompact.js',
      '../services/compact/snipProjection.js',
    ]),
  ],
  [
    path.join('src', 'commands.ts'),
    new Set(['./services/skillSearch/localSearch.js']),
  ],
  [
    path.join('src', 'query', 'stopHooks.ts'),
    new Set(['../jobs/classifier.js']),
  ],
  [
    path.join('src', 'utils', 'systemPrompt.ts'),
    new Set(['../proactive/index.js']),
  ],
  [
    path.join('src', 'utils', 'analyzeContext.ts'),
    new Set(['../services/contextCollapse/index.js']),
  ],
  [
    path.join('src', 'utils', 'sessionRestore.ts'),
    new Set(['../services/contextCollapse/index.js']),
  ],
  [
    path.join('src', 'utils', 'sessionFileAccessHooks.ts'),
    new Set([
      '../memdir/teamMemPaths.js',
      '../services/teamMemorySync/watcher.js',
      '../memdir/memoryShapeTelemetry.js',
    ]),
  ],
  [
    path.join('src', 'services', 'compact', 'prompt.ts'),
    new Set(['../../proactive/index.js']),
  ],
  [
    path.join('src', 'commands', 'clear', 'conversation.ts'),
    new Set(['../../proactive/index.js']),
  ],
  [
    path.join('src', 'commands', 'context', 'context.tsx'),
    new Set(['../../services/contextCollapse/index.js']),
  ],
  [
    path.join('src', 'commands', 'context', 'context-noninteractive.ts'),
    new Set(['../../services/contextCollapse/index.js']),
  ],
  [
    path.join('src', 'components', 'PromptInput', 'usePromptInputPlaceholder.ts'),
    new Set(['../../proactive/index.js']),
  ],
  [
    path.join('src', 'components', 'PromptInput', 'PromptInputFooterLeftSide.tsx'),
    new Set(['../../proactive/index.js']),
  ],
  [
    path.join('src', 'screens', 'REPL.tsx'),
    new Set([
      '../proactive/index.js',
      '../proactive/useProactive.js',
    ]),
  ],
  [
    path.join('src', 'constants', 'prompts.ts'),
    new Set(['../proactive/index.js']),
  ],
  [
    path.join('src', 'tasks.ts'),
    new Set([
      './tasks/LocalWorkflowTask/LocalWorkflowTask.js',
      './tasks/MonitorMcpTask/MonitorMcpTask.js',
    ]),
  ],
  [
    path.join('src', 'tools.ts'),
    new Set([
      './tools/ConfigTool/ConfigTool.js',
      './tools/REPLTool/REPLTool.js',
      './tools/SuggestBackgroundPRTool/SuggestBackgroundPRTool.js',
      './tools/TungstenTool/TungstenTool.js',
      './tools/SleepTool/SleepTool.js',
      './tools/ScheduleCronTool/CronCreateTool.js',
      './tools/ScheduleCronTool/CronDeleteTool.js',
      './tools/ScheduleCronTool/CronListTool.js',
      './tools/RemoteTriggerTool/RemoteTriggerTool.js',
      './tools/MonitorTool/MonitorTool.js',
      './tools/SendUserFileTool/SendUserFileTool.js',
      './tools/PushNotificationTool/PushNotificationTool.js',
      './tools/SubscribePRTool/SubscribePRTool.js',
      './tools/VerifyPlanExecutionTool/VerifyPlanExecutionTool.js',
      './tools/OverflowTestTool/OverflowTestTool.js',
      './tools/CtxInspectTool/CtxInspectTool.js',
      './tools/TerminalCaptureTool/TerminalCaptureTool.js',
      './tools/WebBrowserTool/WebBrowserTool.js',
      './coordinator/coordinatorMode.js',
      './tools/SnipTool/SnipTool.js',
      './tools/ListPeersTool/ListPeersTool.js',
      './tools/WorkflowTool/bundled/index.js',
      './tools/WorkflowTool/WorkflowTool.js',
    ]),
  ],
  [
    path.join('src', 'utils', 'attribution.ts'),
    new Set(['./attributionTrailer.js']),
  ],
  [
    path.join('src', 'utils', 'config.ts'),
    new Set([
      '../memdir/teamMemPaths.js',
      '../bridge/bridgeEnabled.js',
    ]),
  ],
  [
    path.join('src', 'services', 'extractMemories', 'extractMemories.ts'),
    new Set(['../../memdir/teamMemPaths.js']),
  ],
  [
    path.join('src', 'setup.ts'),
    new Set(['./services/contextCollapse/index.js']),
  ],
  [
    path.join('src', 'skills', 'bundled', 'index.ts'),
    new Set([
      './dream.js',
      './hunter.js',
      './loop.js',
      './scheduleRemoteAgents.js',
      './claudeApi.js',
      './runSkillGenerator.js',
    ]),
  ],
  [
    path.join('src', 'hooks', 'useReplBridge.tsx'),
    new Set(['../bridge/webhookSanitizer.js']),
  ],
  [
    path.join('src', 'utils', 'permissions', 'permissionSetup.ts'),
    new Set(['./autoModeState.js']),
  ],
  [
    path.join('src', 'utils', 'permissions', 'permissions.ts'),
    new Set([
      './classifierDecision.js',
      './autoModeState.js',
    ]),
  ],
  [
    path.join('src', 'screens', 'REPL.tsx'),
    new Set([
      '../hooks/useVoiceIntegration.js',
      '../components/FeedbackSurvey/useFrustrationDetection.js',
      '../hooks/notifs/useAntOrgWarningNotification.js',
      '../hooks/useScheduledTasks.js',
      '../tools/WebBrowserTool/WebBrowserPanel.js',
      '../services/contextCollapse/index.js',
    ]),
  ],
  [
    path.join('src', 'screens', 'ResumeConversation.tsx'),
    new Set(['../services/contextCollapse/index.js']),
  ],
]

const currentStageDisabledImportsByFile = currentStageDisabledImportEntries.reduce(
  (map, [file, imports]) => {
    const existing = map.get(file) ?? new Set()
    for (const value of imports) {
      existing.add(value)
    }
    map.set(file, existing)
    return map
  },
  new Map(),
)

async function pathExists(target) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

async function findInternalTarget(importerPath, specifier) {
  const candidateBase = specifier.startsWith('src/')
    ? path.join(root, specifier)
    : path.resolve(path.dirname(importerPath), specifier)

  const tryCandidate = async base => {
    if (await pathExists(base)) {
      return base
    }

    const parsed = path.parse(base)
    if (parsed.ext) {
      const withoutExt = path.join(parsed.dir, parsed.name)
      for (const ext of [...sourceExtensions, ...assetExtensions]) {
        const candidate = `${withoutExt}${ext}`
        if (await pathExists(candidate)) {
          return candidate
        }
      }
      return null
    }

    for (const ext of [...sourceExtensions, ...assetExtensions]) {
      const candidate = `${base}${ext}`
      if (await pathExists(candidate)) {
        return candidate
      }
    }

    return null
  }

  return tryCandidate(candidateBase)
}

async function collectFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)))
      continue
    }
    if (
      [...sourceExtensions, '.d.ts'].some(ext => fullPath.endsWith(ext))
    ) {
      files.push(fullPath)
    }
  }

  return files
}

function isCurrentStageDisabledImport(importerPath, specifier) {
  const importerRelative = path.relative(root, importerPath)
  return currentStageDisabledImportsByFile
    .get(importerRelative)
    ?.has(specifier) ?? false
}

function isCurrentStageDisabledByGuard(content, match) {
  const matchIndex = match.index ?? 0
  const rawImport = match[0] ?? ''
  const windowStart = Math.max(0, matchIndex - 600)
  const windowEnd = Math.min(content.length, matchIndex + rawImport.length + 400)
  const windowText = content.slice(windowStart, windowEnd)

  for (const featureName of currentStageDisabledFeatures) {
    if (
      windowText.includes(`feature('${featureName}')`) ||
      windowText.includes(`feature("${featureName}")`)
    ) {
      return true
    }
  }

  return (
    windowText.includes("process.env.USER_TYPE === 'ant'") ||
    windowText.includes('process.env.USER_TYPE === "ant"') ||
    windowText.includes("\"external\" === 'ant'") ||
    windowText.includes("'external' === 'ant'") ||
    windowText.includes("=== 'ant' ? require(") ||
    windowText.includes('=== "ant" ? require(')
  )
}

async function validateInternalImports() {
  const seenFiles = new Set()
  const specifierPattern =
    /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g

  async function visitFile(file) {
    const normalized = path.resolve(file)
    if (seenFiles.has(normalized)) {
      return
    }
    seenFiles.add(normalized)

    const content = await fs.readFile(file, 'utf8')
    for (const match of content.matchAll(specifierPattern)) {
      const rawImport = match[0] ?? ''
      const specifier = match[1] ?? match[2] ?? match[3]
      if (
        rawImport.includes('import type') ||
        rawImport.includes('export type') ||
        specifier?.endsWith('.d.ts') ||
        specifier?.startsWith('src/types/') ||
        specifier?.includes('/types/') ||
        !specifier ||
        specifier === 'bun:bundle' ||
        specifier === 'bun:ffi' ||
        (!specifier.startsWith('./') &&
          !specifier.startsWith('../') &&
          !specifier.startsWith('src/'))
      ) {
        continue
      }

      if (isCurrentStageDisabledImport(file, specifier)) {
        continue
      }

      if (isCurrentStageDisabledByGuard(content, match)) {
        continue
      }

      const resolved = await findInternalTarget(file, specifier)
      if (!resolved) {
        const relativeFile = path.relative(root, file)
        throw new Error(
          `Missing internal module: ${specifier} imported from ${relativeFile}`,
        )
      }

      if (resolved.endsWith('.ts') || resolved.endsWith('.tsx')) {
        await visitFile(resolved)
      }
    }
  }

  for (const rootFile of currentStageRoots) {
    await visitFile(rootFile)
  }
}

async function copyIfExists(from, to) {
  try {
    await fs.access(from)
  } catch {
    return
  }
  await fs.cp(from, to, { recursive: true })
}

async function writeJsEntryShims(dir) {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      await writeJsEntryShims(fullPath)
      continue
    }

    if (
      !entry.isFile() ||
      entry.name.endsWith('.d.ts') ||
      (!entry.name.endsWith('.ts') && !entry.name.endsWith('.tsx'))
    ) {
      continue
    }

    const parsed = path.parse(entry.name)
    const shimPath = path.join(dir, `${parsed.name}.js`)

    try {
      await fs.access(shimPath)
      continue
    } catch {
      // Fall through and create the shim.
    }

    await fs.writeFile(
      shimPath,
      `export * from './${entry.name}'\nimport * as mod from './${entry.name}'\nexport default mod.default\n`,
      'utf8',
    )
  }
}

await fs.rm(dist, { recursive: true, force: true })
await fs.mkdir(dist, { recursive: true })
await validateInternalImports()

await copyIfExists(path.join(root, 'src'), path.join(dist, 'src'))
await copyIfExists(path.join(root, 'assets'), path.join(dist, 'assets'))
await copyIfExists(path.join(root, 'shims'), path.join(dist, 'shims'))
await copyIfExists(path.join(root, 'types'), path.join(dist, 'types'))
await fs.copyFile(path.join(root, 'tsconfig.json'), path.join(dist, 'tsconfig.json'))
await writeJsEntryShims(path.join(dist, 'src'))
await writeJsEntryShims(path.join(dist, 'shims'))

await fs.writeFile(
  path.join(dist, 'loader.mjs'),
  `import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { transformSync } from 'esbuild'

const distRoot = path.dirname(fileURLToPath(import.meta.url))
const extensionCandidates = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.md', '.txt', '.json', '.d.ts']

function maybeResolveWithExtensions(targetPath) {
  if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
    return targetPath
  }

  const parsed = path.parse(targetPath)
  const bases = parsed.ext
    ? [path.join(parsed.dir, parsed.name)]
    : [targetPath]

  for (const base of bases) {
    for (const ext of extensionCandidates) {
      const candidate = base + ext
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate
      }
    }
  }

  return null
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'bun:bundle') {
    return {
      shortCircuit: true,
      url: pathToFileURL(path.join(distRoot, 'shims', 'bun-bundle.ts')).href,
    }
  }

  if (specifier === 'bun:ffi') {
    return {
      shortCircuit: true,
      url: pathToFileURL(path.join(distRoot, 'shims', 'bun-ffi.ts')).href,
    }
  }

  if (specifier.startsWith('src/')) {
    const resolved = maybeResolveWithExtensions(path.join(distRoot, specifier))
    if (resolved) {
      return {
        shortCircuit: true,
        url: pathToFileURL(resolved).href,
      }
    }
  }

  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const importerPath = context.parentURL
      ? fileURLToPath(context.parentURL)
      : path.join(distRoot, 'src', 'entrypoints', 'cli.tsx')
    const resolved = maybeResolveWithExtensions(
      path.resolve(path.dirname(importerPath), specifier),
    )
    if (resolved) {
      return {
        shortCircuit: true,
        url: pathToFileURL(resolved).href,
      }
    }
  }

  return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.d.ts')) {
    return {
      format: 'module',
      shortCircuit: true,
      source: 'export {}',
    }
  }

  if (url.endsWith('.ts') || url.endsWith('.tsx') || url.endsWith('.jsx')) {
    const filename = fileURLToPath(url)
    const source = fs.readFileSync(filename, 'utf8')
    const loader = url.endsWith('.tsx')
      ? 'tsx'
      : url.endsWith('.jsx')
        ? 'jsx'
        : 'ts'
    const result = transformSync(source, {
      format: 'esm',
      loader,
      jsx: 'automatic',
      sourcefile: filename,
    })
    return {
      format: 'module',
      shortCircuit: true,
      source: result.code,
    }
  }

  if (url.endsWith('.md') || url.endsWith('.txt')) {
    const source = fs.readFileSync(fileURLToPath(url), 'utf8')
    return {
      format: 'module',
      shortCircuit: true,
      source: \`export default \${JSON.stringify(source)}\`,
    }
  }

  return nextLoad(url, context)
}
`,
  'utf8',
)

await fs.writeFile(
  path.join(dist, 'shims', 'runtime-globals.mjs'),
  `globalThis.MACRO = {
  VERSION: process.env.CODEX_CODE_VERSION ?? '0.0.0-dev',
}
`,
  'utf8',
)

await fs.writeFile(
  path.join(dist, 'cli.js'),
  `#!/usr/bin/env node
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const entry = path.join(__dirname, 'src', 'entrypoints', 'cli.tsx')
const loader = path.join(__dirname, 'loader.mjs')
const globals = path.join(__dirname, 'shims', 'runtime-globals.mjs')

const registerLoader = \`data:text/javascript,import { register } from "node:module"; import { pathToFileURL } from "node:url"; register(\${JSON.stringify(pathToFileURL(loader).href)}, pathToFileURL("./"));\`

const child = spawn(
  process.execPath,
  [
    '--import',
    globals,
    '--import',
    'tsx',
    '--import',
    registerLoader,
    entry,
    ...process.argv.slice(2),
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      CODEX_CODE_VERSION: process.env.CODEX_CODE_VERSION ?? '0.0.0-dev',
    },
  },
)

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
`,
  'utf8',
)

await fs.chmod(path.join(dist, 'cli.js'), 0o755)
