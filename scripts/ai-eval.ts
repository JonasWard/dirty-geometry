/**
 * Scores models on the prompt workflow: every case of packages/visualisation/test/ai-suite.ts, per model, mode (and
 * Claude effort), a few runs each. Writes the leaderboard to docs/AI-EVAL.md. Needs the network, so it is run by
 * hand, not in CI (CI replays recorded replies offline, see test/ai.test.ts).
 *
 *   bun run ai:eval                                   # every model, both modes, 3 runs
 *   bun run ai:eval --models anthropic/claude-haiku-5-5 --effort low,medium
 *   bun run ai:eval --mode light --only square,star --runs 1
 *   bun run ai:eval --list                            # the models each keyless endpoint serves
 *   bun run ai:eval --dry                             # no network: the reference solutions answer (checks the script)
 *   bun run ai:eval --fixtures                        # also record replies to test/ai-fixtures/
 *
 * Claude reads ANTHROPIC_API_KEY or an `ant auth login` profile; without either, its rows are skipped.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  generate,
  LIMITS,
  type FailureKind,
  type GenerateResult,
} from '../packages/visualisation/src/playground/ai/generate';
import type { Mode } from '../packages/visualisation/src/playground/ai/prompt';
import {
  costOf,
  modelKey,
  PROVIDERS,
  resolveModel,
  type Chat,
  type Usage,
} from '../packages/visualisation/src/playground/ai/providers';
import { runChecks, startOf, SUITE, type Case, type Tier } from '../packages/visualisation/test/ai-suite';
import { repoRoot } from './import-graph';

const { values: args } = parseArgs({
  options: {
    models: { type: 'string' },
    mode: { type: 'string', default: 'full,light' },
    only: { type: 'string' },
    runs: { type: 'string', default: '3' },
    effort: { type: 'string', default: 'medium' },
    out: { type: 'string', default: 'docs/AI-EVAL.md' },
    list: { type: 'boolean', default: false },
    dry: { type: 'boolean', default: false },
    fixtures: { type: 'boolean', default: false },
  },
});

if (args.list) {
  for (const provider of PROVIDERS.filter((p) => p.transport === 'openai')) {
    try {
      const response = await fetch(`${provider.baseUrl}/models`);
      const json = (await response.json()) as { data?: { id: string }[] };
      console.log(`${provider.id} (${response.status}):`, (json.data ?? []).map((m) => m.id).join(', '));
    } catch (error) {
      console.log(`${provider.id}: ${(error as Error).message}`);
    }
  }
  process.exit(0);
}

const modes = args.mode!.split(',') as Mode[];
const runs = Number(args.runs);
const efforts = args.effort!.split(',') as ('low' | 'medium' | 'high')[];
const cases = args.only ? SUITE.filter((c) => args.only!.split(',').includes(c.id)) : SUITE;
const keys = args.models ? args.models.split(',') : PROVIDERS.flatMap((p) => p.models.map((m) => modelKey(p, m)));
const targets = keys.map((key) => resolveModel(key) ?? (console.error(`unknown model ${key}`), process.exit(1)));

/** --dry: answers with the case's reference solution (the first time with a typo, so a repair is exercised). */
const dryChat = (c: Case): Chat => {
  let calls = 0;
  return async () => ({
    text:
      '```ts\n' +
      (calls++ === 0 && c.tier === 'hard' ? c.reference.replace('return {', 'retrun {') : c.reference) +
      '\n```',
    usage: { input: 0, output: 0 },
  });
};

type Category =
  | 'no-code'
  | 'parse'
  | 'type'
  | 'evaluate'
  | 'nothing-drawn'
  | 'wrong-shape'
  | 'unchanged'
  | 'timeout'
  | 'http'
  | 'refusal'
  | 'max_tokens';
type Row = {
  key: string;
  mode: Mode;
  effort?: string;
  case: string;
  tier: Tier;
  run: number;
  pass: boolean;
  first: boolean;
  category?: Category;
  detail?: string;
  attempts: number;
  ms: number;
  usage: Usage;
  cost: number;
};
const categoryOf = (kind: FailureKind, result: GenerateResult): Category => {
  if (kind === 'repeated')
    return categoryOf(result.ok || !result.last || result.last.ok ? 'evaluate' : result.last.stage, result);
  const map: Partial<Record<FailureKind, Category>> = {
    extract: 'no-code',
    draw: 'nothing-drawn',
    rate: 'http',
    network: 'http',
    auth: 'http',
    aborted: 'http',
  };
  return map[kind] ?? (kind as Category);
};

const realChat: Chat = (await import('../packages/visualisation/src/playground/ai/providers')).chat;
const rows: Row[] = [];
const skipped: string[] = [];
const fixturesDir = path.join(repoRoot, 'packages/visualisation/test/ai-fixtures');
if (args.fixtures) mkdirSync(fixturesDir, { recursive: true });

for (const { provider, model } of targets) {
  const key = modelKey(provider, model);
  const sweep = provider.transport === 'anthropic' ? efforts : [undefined];
  for (const mode of modes)
    for (const effort of sweep)
      for (let run = 0; run < runs; run++)
        for (const c of cases) {
          const current = startOf(c);
          // Free endpoints' rate limits are waited out inside chat (as in the browser); waits are not model time.
          const chat: Chat = args.dry ? dryChat(c) : realChat;
          let waited = 0;
          const started = Date.now();
          const result = await generate({
            prompt: c.prompt,
            mode,
            target: { provider, model },
            chat,
            ...(current && { current }),
            ...(effort && { effort }),
            // Generous: free endpoints are slow at times (waits for their limits extend it by themselves).
            timeoutMs: LIMITS[mode].timeoutMs * 3,
            onProgress: (event) => {
              if (event.type !== 'waiting') return;
              waited += event.seconds * 1000;
              console.log(`  … waiting ${event.seconds} s for ${key}'s rate limit`);
            },
          });
          const ms = Math.max(0, Date.now() - started - waited);
          if (!result.ok && result.kind === 'auth' && provider.needsKey) {
            skipped.push(`${key}: ${result.message}`);
            break;
          }
          const usage = result.attempts.reduce<Usage>(
            (sum, a) => ({
              input: sum.input + (a.usage?.input ?? 0),
              output: sum.output + (a.usage?.output ?? 0),
              cacheRead: (sum.cacheRead ?? 0) + (a.usage?.cacheRead ?? 0),
              cacheWrite: (sum.cacheWrite ?? 0) + (a.usage?.cacheWrite ?? 0),
            }),
            { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          );
          const failures = result.ok
            ? runChecks(
                c,
                result.definition,
                (await import('@dirty-geometry/vec2/recording/evaluate')).evaluate(result.definition),
              )
            : [];
          const pass = result.ok && failures.length === 0;
          const row: Row = {
            key,
            mode,
            ...(effort && { effort }),
            case: c.id,
            tier: c.tier,
            run,
            pass,
            first: pass && result.attempts.length === 1,
            ...(!pass && {
              category: result.ok ? 'wrong-shape' : categoryOf(result.kind, result),
              detail: result.ok ? failures.join('; ') : result.message.split('\n')[0]!.slice(0, 160),
            }),
            attempts: result.attempts.length,
            ms,
            usage,
            cost: costOf(model.id, usage),
          };
          rows.push(row);
          console.log(
            `${pass ? '✓' : '✗'} ${key} ${mode}${effort ? `/${effort}` : ''} #${run} ${c.id}: ${row.attempts} attempt(s), ${(ms / 1000).toFixed(1)} s${row.category ? ` — ${row.category}: ${row.detail}` : ''}`,
          );
          if (args.fixtures && run === 0)
            writeFileSync(
              path.join(
                fixturesDir,
                `${key.replace(/[^\w.-]+/g, '_')}-${mode}${effort ? `-${effort}` : ''}-${c.id}.json`,
              ),
              `${JSON.stringify({ case: c.id, model: key, mode, attempts: result.attempts.map((a) => ({ reply: a.reply, stage: a.validation.ok ? null : a.validation.stage })) }, null, 2)}\n`,
            );
        }
}

// ---- the report ----
const pct = (n: number) => `${Math.round(n * 100)}%`;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 0;
};
const rate = (rs: Row[]) => (rs.length ? rs.filter((r) => r.pass).length / rs.length : 0);
type Verdict = 'recommended' | 'usable' | 'hidden';
function verdict(mode: Mode, rs: Row[]): Verdict {
  const p50 = median(rs.map((r) => r.ms)) / 1000;
  const tier = (t: Tier[]) => rate(rs.filter((r) => t.includes(r.tier)));
  if (mode === 'full') {
    const all = rate(rs);
    if (all >= 0.8 && tier(['easy']) >= 0.95 && p50 < 20) return 'recommended';
    return all >= 0.6 ? 'usable' : 'hidden';
  }
  const core = tier(['easy', 'medium']);
  if (core >= 0.75 && p50 < 8) return 'recommended';
  return core >= 0.6 ? 'usable' : 'hidden';
}

const lines: string[] = [
  '# Prompt workflow: model eval',
  '',
  `Generated by \`bun run ai:eval\`${args.dry ? ' **(dry run: reference solutions, no models)**' : ''} on ${new Date().toISOString().slice(0, 10)}. ` +
    `${cases.length} cases (${(['easy', 'medium', 'hard', 'edit'] as Tier[]).map((t) => `${cases.filter((c) => c.tier === t).length} ${t}`).join(', ')}), ${runs} run(s) each.`,
  '',
  "A case passes when the code parses, type-checks, evaluates, draws, and passes the case's property checks",
  '(area, vertex count, …; see `packages/visualisation/test/ai-suite.ts`). **pass@1**: on the first answer; **pass**: after',
  'the repairs (full 2, light 1). Verdicts: full is *recommended* at ≥ 80% pass, ≥ 95% on easy and p50 < 20 s, *usable* at',
  '≥ 60%; light is *recommended* at ≥ 75% on easy + medium and p50 < 8 s, *usable* at ≥ 60%; below, the model is hidden.',
  "Times leave out waiting for free endpoints' rate limits.",
];
const verdicts: {
  key: string;
  mode: Mode;
  effort?: string;
  verdict: Verdict;
  keyless: boolean;
}[] = [];
for (const mode of modes) {
  lines.push(
    '',
    `## ${mode}`,
    '',
    '| model | pass@1 | pass | easy | medium | hard | edit | repairs | p50 | cost / pass | verdict |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
  );
  const groups = new Map<string, Row[]>();
  for (const r of rows.filter((r) => r.mode === mode)) {
    const g = `${r.key}${r.effort ? ` (effort ${r.effort})` : ''}`;
    groups.set(g, [...(groups.get(g) ?? []), r]);
  }
  for (const [name, rs] of groups) {
    const tier = (t: Tier) => {
      const of = rs.filter((r) => r.tier === t);
      return of.length ? pct(rate(of)) : '–';
    };
    const passes = rs.filter((r) => r.pass).length;
    const cost = rs.reduce((s, r) => s + r.cost, 0);
    const v = verdict(mode, rs);
    verdicts.push({
      key: rs[0]!.key,
      mode,
      ...(rs[0]!.effort && { effort: rs[0]!.effort }),
      verdict: v,
      keyless: !resolveModel(rs[0]!.key)!.provider.needsKey,
    });
    lines.push(
      `| ${name} | ${pct(rs.filter((r) => r.first).length / rs.length)} | ${pct(rate(rs))} | ${tier('easy')} | ${tier('medium')} | ${tier('hard')} | ${tier('edit')} | ${(rs.reduce((s, r) => s + Math.max(0, r.attempts - 1), 0) / rs.length).toFixed(2)} | ${(median(rs.map((r) => r.ms)) / 1000).toFixed(1)} s | ${cost ? `$${(cost / Math.max(1, passes)).toFixed(4)}` : 'free'} | ${v} |`,
    );
  }
}
const failures = rows.filter((r) => !r.pass);
if (failures.length) {
  lines.push('', '## Failures by kind', '', '| model | mode | kind | count | example |', '|---|---|---|---|---|');
  const groups = new Map<string, Row[]>();
  for (const r of failures) {
    const g = `${r.key}${r.effort ? ` (${r.effort})` : ''}|${r.mode}|${r.category}`;
    groups.set(g, [...(groups.get(g) ?? []), r]);
  }
  for (const [g, rs] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    const [name, mode, kind] = g.split('|');
    lines.push(
      `| ${name} | ${mode} | ${kind} | ${rs.length} | ${rs[0]!.case}: ${(rs[0]!.detail ?? '').replace(/\|/g, '\\|')} |`,
    );
  }
}
const total = rows.reduce((s, r) => s + r.cost, 0);
const ship = (mode: Mode) => verdicts.some((v) => v.mode === mode && v.keyless && v.verdict === 'recommended');
lines.push(
  '',
  '## Ship check',
  '',
  `- A keyless model recommended in full mode: **${ship('full') ? 'yes' : 'no'}**; in light mode: **${ship('light') ? 'yes' : 'no'}**.`,
  '- Keyless endpoints must also pass the browser CORS check (see docs/README.md → Prompt); this script cannot see CORS.',
  `- Paid spend for this run: $${total.toFixed(4)}.`,
  ...(skipped.length ? ['', 'Skipped:', ...skipped.map((s) => `- ${s}`)] : []),
  '',
);
const out = path.resolve(repoRoot, args.out!);
writeFileSync(out, lines.join('\n'));
console.log(`\nwrote ${path.relative(repoRoot, out)} · paid spend $${total.toFixed(4)}`);
