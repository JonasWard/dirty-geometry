import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { operationById, operations } from '@dirty-geometry/vec2/schema/schema';
import { extractCode } from '../src/playground/ai/extract';
import { generate, type Progress } from '../src/playground/ai/generate';
import { buildMessages, pickExamples, repairMessage } from '../src/playground/ai/prompt';
import { ChatError, providerById, resolveModel, type Chat } from '../src/playground/ai/providers';
import { COMPACT_OPERATIONS, compactReference, fullReference } from '../src/playground/ai/reference';
import { validateCode } from '../src/playground/ai/validate';
import { STARTER_CODE, STARTERS } from '../src/playground/starters';
import { runChecks, startOf, SUITE } from './ai-suite';

const SQUARE = `export function definition(side: Length = 2): { square: Polygon2 } {
  const square = new Polygon2([new Vec2(0, 0), new Vec2(side, 0), new Vec2(side, side), new Vec2(0, side)]);
  return { square };
}`;
const fence = (code: string) => `Here you go:\n\`\`\`ts\n${code}\n\`\`\`\n`;

describe('eval suite', () => {
  test.each(SUITE.map((c) => [c.id, c] as const))('reference for %s validates and passes its checks', (_, c) => {
    const result = validateCode(c.reference.trim());
    if (!result.ok) throw new Error(`${result.stage}: ${result.errors.join('; ')}`);
    expect(runChecks(c, result.definition, result.evaluation)).toEqual([]);
  });
  test('edit cases start from starters that do not pass already', () => {
    for (const c of SUITE.filter((c) => c.tier === 'edit')) {
      const start = validateCode(STARTER_CODE[c.edit!]);
      if (!start.ok) throw new Error(c.id);
      expect(startOf(c)).toBeDefined();
      expect(runChecks(c, start.definition, start.evaluation).length).toBeGreaterThan(0);
    }
  });
  test('checks catch a wrong shape', () => {
    const square = SUITE.find((c) => c.id === 'square')!;
    const wrong = validateCode(SQUARE.replace('side: Length = 2', 'side: Length = 3'));
    if (!wrong.ok) throw new Error('wrong square does not validate');
    expect(runChecks(square, wrong.definition, wrong.evaluation)).toHaveLength(1);
  });
});

describe('reference', () => {
  test('lists every operation (full) and only real ones (compact)', () => {
    expect(COMPACT_OPERATIONS.filter((id) => !operationById.has(id))).toEqual([]);
    const full = fullReference();
    expect(operations.filter((op) => op.member !== 'new' && !full.includes(op.member))).toEqual([]);
    expect(compactReference().length).toBeLessThan(full.length / 3);
  });
  test('every starter written as code is an example', () => {
    expect(Object.keys(STARTER_CODE).sort()).toEqual(
      STARTERS.filter((s) => s.id !== 'plate')
        .map((s) => s.id)
        .sort(),
    );
  });
});

describe('extractCode', () => {
  test('takes the last fenced block with a definition', () => {
    const reply = `${fence('const x = 1;')}\nthen\n${fence(SQUARE)}`;
    expect(extractCode(reply)).toBe(SQUARE);
  });
  test('reads code without a fence, and skips <think>', () => {
    expect(extractCode(`<think>export function definition() {}</think>Sure.\n${SQUARE}`)).toBe(SQUARE);
    expect(extractCode('```typescript\n' + SQUARE)).toBe(SQUARE);
  });
  test('finds nothing in prose', () => {
    expect(extractCode('I cannot do that.')).toBeUndefined();
  });
});

describe('validateCode', () => {
  test('passes working code', () => {
    expect(validateCode(SQUARE).ok).toBe(true);
  });
  test.each([
    ['extract', undefined, 'No code block'],
    ['parse', 'export function definition() { let a = 1; }', '^'],
    [
      'type',
      `export function definition(r: Length = 1): { c: Circle2 } { const c = new Circle2(r, r); return { c }; }`,
      'Vec2 expected',
    ],
    [
      'evaluate',
      `export function definition(r: Length = 1): { p: Polygon2 } { const p = new Polygon2([new Vec2(0, 0)]); return { p }; }`,
      'three vertices',
    ],
    [
      'draw',
      `export function definition(r: Length = 1): { n: number } { const n = r * 2; return { n }; }`,
      'No output draws',
    ],
  ] as const)('stops at %s', (stage, code, message) => {
    const result = validateCode(code);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stage).toBe(stage);
    expect(result.errors.join('\n')).toContain(message);
  });
});

describe('prompts', () => {
  test('light is smaller than full; an edit carries the current code', () => {
    const full = buildMessages({ prompt: 'a gear', mode: 'full' });
    const light = buildMessages({ prompt: 'a gear', mode: 'light' });
    expect(light[0]!.content.length).toBeLessThan(full[0]!.content.length / 2);
    expect(buildMessages({ prompt: 'bigger', mode: 'light', current: SQUARE })[1]!.content).toContain(SQUARE);
  });
  test('repairs carry a hint for known mistakes', () => {
    const fail = (code: string) => {
      const result = validateCode(code);
      if (result.ok) throw new Error('expected a failure');
      return repairMessage(result.stage, result.errors);
    };
    expect(
      fail(`export function definition(r: Length = 1): { p: Polygon2 } { const p = r > 1 ? 1 : 2; return { p }; }`),
    ).toContain('lib.smallerThan');
    expect(
      fail(
        `export function definition(r: Length = 1): { p: number } { const p = new Circle2(new Vec2(0, 0), r).perimeter(); return { p }; }`,
      ),
    ).toContain('Circle2 methods: ');
  });
  test('examples follow the request', () => {
    expect(pickExamples('a gear with 12 teeth')[0]).toBe('gear');
    expect(pickExamples('a plate with bolt holes')[0]).toBe('mounting-plate');
    expect(pickExamples('something')).toEqual(['squares', 'star', 'gear']);
  });
});

describe('generate', () => {
  const target = resolveModel('ovh/gpt-oss-120b')!;
  const fallback = resolveModel('llm7/codestral-latest')!;
  const scripted = (...replies: (string | Error)[]): Chat & { calls: { model: string; last: string }[] } => {
    const calls: { model: string; last: string }[] = [];
    const chat = (async (_p: unknown, model: { id: string }, messages: { content: string }[]) => {
      calls.push({ model: model.id, last: messages.at(-1)!.content });
      const next = replies.shift() ?? 'nothing';
      if (next instanceof Error) throw next;
      return { text: next };
    }) as unknown as Chat & { calls: typeof calls };
    chat.calls = calls;
    return chat;
  };

  test('repairs a parse error with the error in the follow-up', async () => {
    const chat = scripted(fence('export function definition() { let a = 1; }'), fence(SQUARE));
    const events: Progress[] = [];
    const result = await generate({
      prompt: 'a square',
      mode: 'full',
      target,
      chat,
      onProgress: (e) => events.push(e),
    });
    expect(result.ok).toBe(true);
    expect(result.attempts).toHaveLength(2);
    expect(chat.calls[1]!.last).toContain('does not parse');
    expect(events.some((e) => e.type === 'request' && e.repairing === 'parse')).toBe(true);
  });
  test('gives up after the repairs, on the last stage', async () => {
    const bad = fence(`export function definition(r: Length = 1): { n: number } { const n = r; return { n }; }`);
    const other = bad.replace('= r;', '= r * 2;');
    const result = await generate({ prompt: 'x', mode: 'light', target, chat: scripted(bad, other) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('draw');
    expect(result.attempts).toHaveLength(2);
  });
  test('stops when the same code comes back', async () => {
    const bad = fence('export function definition() { let a = 1; }');
    const result = await generate({ prompt: 'x', mode: 'full', target, chat: scripted(bad, bad, fence(SQUARE)) });
    expect(result.ok === false && result.kind).toBe('repeated');
  });
  test('falls back once when the endpoint is unreachable, not when rate limited', async () => {
    const chat = scripted(new ChatError('network', 'offline'), fence(SQUARE));
    const result = await generate({ prompt: 'a square', mode: 'full', target, fallback, chat });
    expect(result.ok).toBe(true);
    expect(chat.calls.map((c) => c.model)).toEqual(['gpt-oss-120b', 'codestral-latest']);
    const limited = await generate({
      prompt: 'a square',
      mode: 'full',
      target,
      fallback,
      chat: scripted(new ChatError('rate', 'slow down', 429)),
    });
    expect(limited.ok === false && limited.kind).toBe('rate');
  });
  test('an edit must change the definition', async () => {
    const current = validateCode(SQUARE);
    if (!current.ok) throw new Error();
    const result = await generate({
      prompt: 'bigger',
      mode: 'light',
      current: current.definition,
      target,
      chat: scripted(fence(SQUARE), fence(SQUARE.replace('= 2', '= 3'))),
    });
    expect(result.ok).toBe(true);
    expect(result.attempts).toHaveLength(2);
  });
  test('times out', async () => {
    const slow: Chat = (_p, _m, _msgs, { signal }) =>
      new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new ChatError('aborted', 'x'))));
    const result = await generate({ prompt: 'x', mode: 'light', target, chat: slow, timeoutMs: 20 });
    expect(result.ok === false && result.kind).toBe('timeout');
  });
  test('the providers are known', () => {
    expect(providerById('anthropic')!.models[0]!.id).toBe('claude-haiku-5-5');
  });
});

describe('rate limits', () => {
  const ovh = resolveModel('ovh/Qwen3.6-27B')!;
  const original = globalThis.fetch;
  const reply = (status: number, headers: Record<string, string> = {}) =>
    new Response(
      status === 200
        ? JSON.stringify({ choices: [{ message: { content: fence(SQUARE) }, finish_reason: 'stop' }] })
        : 'slow down',
      { status, headers },
    );
  const serve = (...responses: Response[]) => {
    const calls: number[] = [];
    globalThis.fetch = (async () => (
      calls.push(Date.now()),
      responses.shift() ?? reply(200)
    )) as unknown as typeof fetch;
    return calls;
  };
  afterEach(() => {
    globalThis.fetch = original;
  });

  test('a 429 is waited out (Retry-After) and asked again on the same model', async () => {
    const calls = serve(reply(429, { 'retry-after': '1' }), reply(200));
    const events: Progress[] = [];
    const result = await generate({
      prompt: 'a square',
      mode: 'light',
      target: ovh,
      timeoutMs: 500,
      onProgress: (e) => events.push(e),
    });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[1]! - calls[0]!).toBeGreaterThanOrEqual(950);
    // The wait does not use up the 500 ms limit.
    expect(events.filter((e) => e.type === 'waiting').map((e) => e.type === 'waiting' && e.seconds)).toEqual([1]);
  });
  test('cancel ends the wait', async () => {
    serve(reply(429, { 'retry-after': '30' }));
    const controller = new AbortController();
    const pending = generate({
      prompt: 'x',
      mode: 'light',
      target: ovh,
      signal: controller.signal,
      onProgress: (e) => e.type === 'waiting' && controller.abort(),
    });
    const result = await pending;
    expect(result.ok === false && result.kind).toBe('aborted');
  });
});

// Replies recorded by `bun run ai:eval` still get the verdict they got (so prompt or checker changes show up).
const FIXTURES = path.join(import.meta.dir, 'ai-fixtures');
const fixtures = existsSync(FIXTURES) ? readdirSync(FIXTURES).filter((f) => f.endsWith('.json')) : [];
describe.if(fixtures.length > 0)('recorded replies', () => {
  test.each(fixtures)('%s', (file) => {
    const record = JSON.parse(readFileSync(path.join(FIXTURES, file), 'utf8')) as {
      case: string;
      attempts: { reply: string; stage: string | null }[];
    };
    for (const attempt of record.attempts) {
      const result = validateCode(extractCode(attempt.reply));
      expect(result.ok ? null : result.stage).toBe(attempt.stage as never);
    }
  });
});
