import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { operationById, operations } from '@dirty-geometry/vec2/schema/schema';
import { extractJson } from '../src/playground/ai/extract';
import { EXAMPLES } from '../src/playground/ai/examples';
import { compactJson, JsonError, operationsUsed, parseLooseJson } from '../src/playground/ai/json';
import { INTENTS, suggestOperations } from '../src/playground/ai/suggest';
import { parseDefinitionJson } from '../src/playground/JsonEditor';
import { parseDefinition } from '../src/playground/model/parse';
import docs from '@dirty-geometry/vec2/schema/vec2.docs.json';
import { generate, type Progress } from '../src/playground/ai/generate';
import { buildMessages, pickExamples, repairMessage } from '../src/playground/ai/prompt';
import { ChatError, providerById, resolveModel, type Chat } from '../src/playground/ai/providers';
import { COMPACT_OPERATIONS, compactReference, fullReference } from '../src/playground/ai/reference';
import { validateCode, validateJson } from '../src/playground/ai/validate';
import { STARTER_CODE, STARTERS } from '../src/playground/starters';
import { runChecks, startOf, SUITE } from './ai-suite';

const SQUARE = `export function definition(side: Length = 2): { square: Polygon2 } {
  const square = new Polygon2([new Vec2(0, 0), new Vec2(side, 0), new Vec2(side, side), new Vec2(0, side)]);
  return { square };
}`;
/** A reply holding `code`'s definition as JSON, as a model writes it. */
const fence = (code: string) => `Here you go:\n\`\`\`json\n${compactJson(parseDefinition(code))}\n\`\`\`\n`;
/** A reply whose JSON does not read (a missing comma). */
const BAD_JSON = '```json\n{"cells": [{"name": "a" "expr": 1}]}\n```';

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

describe('extractJson', () => {
  test('takes the last fenced block holding an object', () => {
    expect(extractJson('```json\n{"a": 1}\n```\nthen\n```\n{"b": 2}\n```')).toBe('{"b": 2}');
  });
  test('reads an unfenced object, and skips <think>', () => {
    expect(extractJson('<think>{"no": 1}</think>Sure: {"cells": []} done')).toBe('{"cells": []}');
  });
  test('finds nothing in prose', () => {
    expect(extractJson('I cannot do that.')).toBeUndefined();
  });
});

describe('parseLooseJson', () => {
  test('reads comments and trailing commas', () => {
    expect(parseLooseJson('{"a": [1, 2,], // note\n "b": {"c": "d",} /* x */}')).toEqual({ a: [1, 2], b: { c: 'd' } });
  });
  test('says where a syntax error is', () => {
    const error = (() => {
      try {
        parseLooseJson('{\n  "a": 1\n  "b": 2\n}');
      } catch (e) {
        return e as JsonError;
      }
    })()!;
    expect([error.line, error.column]).toEqual([3, 3]);
    expect(error.message).toContain('Expected , or }');
  });
});

describe('validateJson', () => {
  const square = compactJson(parseDefinition(SQUARE));
  test('passes a working definition, without format, version or the "uses" plan', () => {
    const result = validateJson(square.replace('{', '{"uses": ["Polygon2.new"],'));
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(Object.keys(result.definition)).toEqual(['format', 'version', 'inputs', 'functions', 'cells']);
  });
  test.each([
    ['extract', undefined, 'No JSON object'],
    ['parse', '{"cells": [{"name": "a" "expr": 1}]}', '^'],
    ['shape', '{"cells": [{"name": "a"}]}', 'cells[0] a: "expr" is missing'],
    [
      'type',
      '{"cells": [{"name": "c", "expr": {"op": "Circle2.new", "args": {"centre": 1, "radius": 1}}}]}',
      'cells[0] c at args',
    ],
    [
      'evaluate',
      '{"cells": [{"name": "p", "expr": {"op": "Polygon2.new", "args": {"vertices": [{"op": "Vec2.new", "args": {}}]}}, "output": true}]}',
      'three vertices',
    ],
    ['draw', '{"cells": [{"name": "n", "expr": 2, "output": true, "type": "number"}]}', 'No output draws'],
  ] as const)('stops at %s', (stage, text, message) => {
    const result = validateJson(text);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stage).toBe(stage);
    expect(result.errors.join('\n')).toContain(message);
  });
  test('a boolean read as "polygons" with an arc shape says to read "regions"; untyped outputs get a packable type', () => {
    const circle = (radius: unknown) => ({
      op: 'Circle2.new',
      args: { center: { op: 'Vec2.new', args: {} }, radius },
    });
    const nut = (field: string) =>
      JSON.stringify({
        inputs: [{ name: 'r', type: 'Length', value: 2 }],
        cells: [
          { name: 'hex', expr: { op: 'Polygon2.fromCircle2', args: { circle: circle({ ref: 'r' }), segments: 6 } } },
          {
            name: 'nut',
            expr: { of: { op: 'Boolean2.subtract', args: { subject: [{ ref: 'hex' }], clips: circle(0.5) } }, field },
            output: true,
          },
        ],
      });
    const polygons = validateJson(nut('polygons'));
    expect(!polygons.ok && polygons.errors[0]).toContain('the result is in "regions"');
    const regions = validateJson(nut('regions'));
    expect(regions.ok && regions.definition.cells[1]!.type).toBe('ArcPolygon2[]');
  });
  test('a round hole is not a rounded corner', () => {
    expect(suggestOperations('a hexagon nut with a round hole', 2).map((op) => op.id)).not.toContain('Arc2.fromFillet');
  });
  test("the JSON tab reads a model's answer too", () => {
    expect(parseDefinitionJson(square.replace('{', '{"uses": [],')).cells).toHaveLength(1);
  });
});

describe('validateCode', () => {
  test('passes working code', () => {
    expect(validateCode(SQUARE).ok).toBe(true);
  });
  test.each([
    ['extract', undefined, 'No code'],
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
  test('light is smaller than full; an edit carries the current definition as JSON', () => {
    const full = buildMessages({ prompt: 'a gear', mode: 'full' });
    const light = buildMessages({ prompt: 'a gear', mode: 'light' });
    expect(light[0]!.content.length).toBeLessThan(full[0]!.content.length / 2);
    const current = parseDefinition(SQUARE);
    expect(buildMessages({ prompt: 'bigger', mode: 'light', current })[1]!.content).toContain(compactJson(current));
  });
  test('the request starts with the operations that fit it, with what they do', () => {
    const ask = buildMessages({ prompt: 'a regular hexagon with a round hole', mode: 'light' })[1]!.content;
    expect(ask).toStartWith('Operations that fit this request:');
    expect(ask).toContain('Polygon2.fromCircle2 {circle: Circle2, segments: Index');
    expect(ask).toContain('Boolean2.subtract');
  });
  test('suggestions follow the request', () => {
    const top = (prompt: string) => suggestOperations(prompt, 3).map((op) => op.id);
    expect(top('a regular hexagon')).toContain('Polygon2.fromCircle2');
    expect(top('a 4 x 4 plate with a hole')[0]).toBe('Boolean2.subtract');
    expect(top('rounded corners')).toContain('Arc2.fromFillet');
    expect(suggestOperations('hello')).toEqual([]);
  });
  test('every operation a suggestion points at exists and says what it does', () => {
    const targets = [...new Set(Object.values(INTENTS).flat())];
    expect(targets.filter((id) => !operationById.has(id))).toEqual([]);
    expect(targets.filter((id) => !(id in docs))).toEqual([]);
  });
  test('repairs carry a hint for known mistakes', () => {
    const fail = (text: string) => {
      const result = validateJson(text);
      if (result.ok) throw new Error('expected a failure');
      return repairMessage(result.stage, result.errors);
    };
    expect(fail('{"cells": [{"name": "a", "expr": {"op": "Circle2.perimeter", "self": 1}}]}')).toContain(
      'Circle2 has: ',
    );
    expect(fail('{"cells": [{"name": "c", "expr": {"op": "Circle2.new", "args": {"centre": 1}}}]}')).toContain(
      'Its signature: Circle2.new {center: Vec2, radius: Length}',
    );
  });
  test('examples follow the request, and each one evaluates and builds with operations', () => {
    expect(pickExamples('a gear with 12 teeth')[0]).toBe('gear');
    expect(pickExamples('a plate with bolt holes')[0]).toBe('flange');
    expect(pickExamples('something')).toEqual(['flange', 'pattern', 'cross']);
    for (const example of EXAMPLES) {
      const result = validateJson(compactJson(example.build()));
      if (!result.ok) throw new Error(`${example.id}: ${result.stage} ${result.errors.join('; ')}`);
      expect(operationsUsed(result.definition).length).toBeGreaterThan(2);
    }
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
    const chat = scripted(BAD_JSON, fence(SQUARE));
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
    expect(chat.calls[1]!.last).toContain('is not valid JSON');
    expect(events.some((e) => e.type === 'request' && e.repairing === 'parse')).toBe(true);
  });
  test('gives up after the repairs, on the last stage', async () => {
    const code = `export function definition(r: Length = 1): { n: number } { const n = r; return { n }; }`;
    const bad = fence(code);
    const other = fence(code.replace('= r;', '= r * 2;'));
    const result = await generate({ prompt: 'x', mode: 'light', target, chat: scripted(bad, other) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('draw');
    expect(result.attempts).toHaveLength(2);
  });
  test('stops when the same code comes back', async () => {
    const bad = BAD_JSON;
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
  test('a request that never answers times out, naming the model and the limit', async () => {
    const slow: Chat = (_p, _m, _msgs, { signal }) =>
      new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new ChatError('aborted', 'x'))));
    const result = await generate({ prompt: 'x', mode: 'light', target, chat: slow, requestTimeoutMs: 20 });
    expect(result.ok === false && result.kind).toBe('timeout');
    expect(result.ok === false && result.message).toBe('No answer from gpt-oss 120B within 0 s');
  });
  test('the time limit is per request: an answer and a fix may each take most of it', async () => {
    const replies = [BAD_JSON, fence(SQUARE)];
    const slowly: Chat = () => new Promise((resolve) => setTimeout(() => resolve({ text: replies.shift()! }), 80));
    const events: Progress[] = [];
    const result = await generate({
      prompt: 'a square',
      mode: 'full',
      target,
      chat: slowly,
      requestTimeoutMs: 100,
      onProgress: (e) => events.push(e),
    });
    expect(result.ok).toBe(true);
    expect(result.attempts).toHaveLength(2);
    expect(events.filter((e) => e.type === 'request').map((e) => e.type === 'request' && e.timeoutMs)).toEqual([
      100, 100,
    ]);
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
      requestTimeoutMs: 500,
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
      const result = validateJson(extractJson(attempt.reply));
      expect(result.ok ? null : result.stage).toBe(attempt.stage as never);
    }
  });
});
