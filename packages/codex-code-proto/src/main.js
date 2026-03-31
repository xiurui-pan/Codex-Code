import { loadCodexConfig, resolveSessionSettings } from './config.js';
import { createUserMessageItem } from './ir.js';
import { runCodexTurn } from './codex-adapter.js';

function parseArgs(argv) {
  const args = [...argv];
  const printConfigOnly = args.includes('--print-config');
  const prompt = args.filter(arg => arg !== '--print-config').join(' ').trim();

  return {
    printConfigOnly,
    prompt: prompt || '只回复 CODEX_CODE_SMOKE_OK',
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = await loadCodexConfig();
  const session = resolveSessionSettings(config, {
    model: 'gpt-5.4',
    reasoningEffort: 'medium',
  });

  if (args.printConfigOnly) {
    console.log(JSON.stringify({
      providerId: config.providerId,
      baseUrl: config.provider.base_url,
      wireApi: config.provider.wire_api,
      model: session.model,
      reasoningEffort: session.reasoningEffort,
    }, null, 2));
    return;
  }

  const result = await runCodexTurn(args.prompt, session, config);

  console.log(JSON.stringify({
    providerId: config.providerId,
    model: session.model,
    reasoningEffort: session.reasoningEffort,
    items: [
      createUserMessageItem(args.prompt),
      ...result.items,
    ],
    responseId: result.responseId,
  }, null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
