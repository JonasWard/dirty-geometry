/**
 * The messages sent to a model, which answers with a definition as JSON (the JSON tab's format). The system part
 * holds the format, the API reference and worked examples (the starters), and stays the same for a mode, so it
 * caches. The user part holds the operations that fit the request (with what they do) and the request itself.
 * `full` sends every operation and three examples picked for the request; `light` (for small, fast models) the
 * core operations and two fixed examples.
 */
import { fromCall, type CallName } from '@dirty-geometry/fn/calls';
import type { Definition, Expr } from '@dirty-geometry/vec2/recording/definition';
import { operations } from '@dirty-geometry/vec2/schema/schema';
import { EXAMPLES } from './examples';
import { compactJson, operationsUsed } from './json';
import { compactReference, fullReference, operationById, referenceLine, signature } from './reference';
import { suggestOperations } from './suggest';

export type Mode = 'full' | 'light';
export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/** The shared forms (`lib.*` in code) as their JSON, built by the same converter the code view uses. */
function formsSheet(): string {
  const r = (name: string): Expr => ({ ref: name });
  const sample = (name: CallName, args: Parameters<typeof fromCall<Expr>>[1]) => JSON.stringify(fromCall(name, args));
  const e = (name: string) => ({ expr: r(name) });
  const rows: [string, string][] = [
    ['a + b (also - * /)', JSON.stringify({ math: '+', args: [r('a'), r('b')] })],
    ['max(a, b) (also min, pow, mod, atan2)', sample('max', [e('a'), e('b')])],
    ['sin(a) (also cos, tan, abs, sign, round, floor, ceil, asin, acos, atan, ln)', sample('sin', [e('a')])],
    ['-a', JSON.stringify({ math: 'neg', args: [r('a')] })],
    ['a < b (also >, ==)', sample('smallerThan', [e('a'), e('b')])],
    ['and / or / not', sample('and', [e('p'), e('q')])],
    ['p ? a : b', sample('ifElse', [e('p'), e('a'), e('b')])],
    [
      'a list of count items from fn(i, previous, count, data)',
      sample('generate', [e('count'), { fn: 'fn' }, undefined, e('data')]),
    ],
    ['fn(item, i, data) for each item (also filter, sort)', sample('map', [e('items'), { fn: 'fn' }, e('data')])],
    ['items[start…end]', sample('slice', [e('items'), e('start'), e('end')])],
    ['items[i] (i computed)', sample('at', [e('items'), e('i')])],
    ['number of items', sample('length', [e('items')])],
    ['smooth noise 0…1 (seed, t)', sample('smooth', [e('seed'), e('t')])],
  ];
  return rows.map(([what, json]) => `- ${what}: ${json}`).join('\n');
}

export const RULES = `You write geometry definitions for the vec2 playground, a 2D geometry tool, as JSON. The JSON is checked and evaluated, never run as code, so follow the format exactly.

# Format
{
  "uses": ["Polygon2.fromCircle2", "Boolean2.subtract"],
  "inputs": [{ "name": "radius", "type": "Length", "value": 2 }],
  "functions": [{ "name": "corner", "params": [{ "name": "i", "type": "Index" }, …], "body": <expression> }],
  "cells": [{ "name": "hexagon", "expr": <expression>, "output": true, "type": "Polygon2" }]
}
- "uses" comes first: the vec2 operations you will build with, chosen from the reference before you write cells.
- "inputs" are the user's sliders: a number type and a literal value.
- "cells" are computed in order; each may use inputs and earlier cells. Mark what should be drawn or shown "output": true, with its "type".
- "functions" are helpers: called with {"call"}, or by name from generate / map / filter / sort; their params are referred to with {"ref": name}. A function may call functions above it and itself (recursion, up to 64 calls deep): give it a base case with {"if": …}, as in the tree example.
- Keep each expression a few levels deep. Put sub-results (a shape, a matrix, a branch) in their own helper functions or cells and refer to them: long one-line expressions are where brackets go wrong.

# Expressions
- literals: 2, "exact", true, null; lists: [a, b, c]
- {"ref": "radius"}: an input, an earlier cell, or a function's parameter
- {"op": "Class.member", "args": {param: expression}}: an operation from the reference, args by parameter NAME. "Vec2.new" makes a Vec2.
- {"op": "Class.member", "self": expression, "args": {…}}: a method (or field) on a value; the reference lists it with "self".
- {"call": "functionName", "args": {param: expression}}: one of your functions
- {"of": expression, "index": 0} and {"of": expression, "field": "polygons"}: a list item or a result's field
- {"object": {"arcs": {"object": {"mode": "exact"}}}}: an options object (each value is an expression)
${formsSheet()}

# Use the operations
Build with the library's operations instead of computing coordinates yourself:
- a circle: Circle2.new; as a region: ArcPolygon2.fromCircle2 (exact) or Polygon2.fromCircle2 (segments)
- a regular polygon (triangle, hexagon, n-gon): Polygon2.fromCircle2 with segments = number of sides
- a rectangle: Polygon2.fromAabb2 of Aabb2.fromPoints (two corners)
- holes, cut-outs: Boolean2.subtract; merging shapes: Boolean2.union; overlap: Boolean2.intersect. They return a result, not shapes: with Polygon2 shapes only read its "polygons" field; as soon as one shape is a Circle2 or ArcPolygon2 read its "regions" field (its "polygons" are empty), with "options": {"object": {"arcs": {"object": {"mode": "exact"}}}}
- rounded corners: Arc2.fromFillet, joined with ArcPolygon2.fromSegments
- a wall, inset or outline: .offset
- copies around a centre or along a row: one Mat3.rotation / Mat3.translation per copy, applied with .transform, the copies made with generate
- points on a circle: Circle2.evaluate (theta in radians, 2π ≈ 6.2832)

Number types: Coordinate (any position or offset), Length (≥ 0 size), Radians, Parameter (0…1), Integer, Index (whole ≥ 0).

Answer with ONE JSON object and nothing else.`;

const LIGHT_EXAMPLES = ['flange', 'cross'];
const DEFAULT_EXAMPLES = ['flange', 'pattern', 'cross'];
/** Words that point to an example beyond its id. */
const KEYWORDS: Record<string, string[]> = {
  flange: ['flange', 'hole', 'holes', 'bolt', 'bore', 'disc', 'ring', 'circle', 'circles', 'around'],
  tree: [
    'tree',
    'branch',
    'branches',
    'branching',
    'recursion',
    'recursive',
    'recursively',
    'fractal',
    'self',
    'similar',
    'lsystem',
    'nested',
    'level',
    'levels',
  ],
  pattern: [
    'row',
    'copies',
    'copy',
    'repeat',
    'pattern',
    'array',
    'grid',
    'tile',
    'tiles',
    'many',
    'pentagon',
    'regular',
  ],
  cross: ['cross', 'plus', 'union', 'merge', 'combine', 'rotate', 'rotated', 'bar', 'rectangle', 'box'],
  gear: ['gear', 'tooth', 'teeth', 'cog', 'sprocket'],
  fillet: ['fillet', 'round', 'rounded', 'corner'],
  'three-points': ['arc', 'three', 'through'],
  slot: ['slot', 'offset', 'capsule', 'stadium', 'wall', 'inset'],
  lens: ['lens', 'intersect', 'intersection', 'overlap'],
  wave: ['wave', 'wavy', 'path', 'zigzag', 'curve'],
  'mounting-plate': ['plate', 'mount', 'bracket', 'subtract', 'cut'],
  'half-ring': ['ring', 'annulus', 'half', 'washer', 'donut'],
  'wobbly-ring': ['random', 'noise', 'wobbly', 'generate', 'filter', 'sort', 'points'],
};
const EXAMPLE_IDS = EXAMPLES.map((e) => e.id);

/** The examples that share the most words with the request (ties keep the default order). */
export function pickExamples(prompt: string, count = 3): string[] {
  const words = new Set(prompt.toLowerCase().match(/[a-z]+/g) ?? []);
  const score = (id: string) => (KEYWORDS[id] ?? []).filter((w) => words.has(w) || words.has(`${w}s`)).length;
  return EXAMPLE_IDS.map((id, order) => ({
    id,
    score: score(id),
    order: DEFAULT_EXAMPLES.includes(id) ? DEFAULT_EXAMPLES.indexOf(id) - 100 : order,
  }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, count)
    .map((r) => r.id);
}

/** A starter as the JSON a model is asked to write ("uses" first). */
export function exampleJson(id: string): string {
  const definition = EXAMPLES.find((e) => e.id === id)!.build();
  return compactJson(definition, operationsUsed(definition));
}

/** The system prompt: rules, reference and examples. It depends only on the mode and the examples, so it caches. */
export function systemPrompt(mode: Mode, examples: readonly string[]): string {
  const reference = mode === 'full' ? fullReference() : compactReference();
  const shown = examples
    .map((id) => `Example: ${EXAMPLES.find((e) => e.id === id)!.label}\n${exampleJson(id)}`)
    .join('\n\n');
  return `${RULES}\n\n# API reference (op {args} → result — what it does)\n${reference}\n\n# Examples\n${shown}`;
}

export type PromptRequest = {
  prompt: string;
  mode: Mode;
  /** The definition open in the playground: the request edits it. */
  current?: Definition;
};

/** The operations that fit the request, with what they do: first in the request, so the model builds with them. */
export function suggestionBlock(prompt: string): string {
  const fitting = suggestOperations(prompt);
  if (!fitting.length) return '';
  return `Operations that fit this request:\n${fitting.map((op) => `- ${referenceLine(op, true)}`).join('\n')}\n\n`;
}

/** The first messages of a generation. */
export function buildMessages({ prompt, mode, current }: PromptRequest): ChatMessage[] {
  const examples = mode === 'light' ? LIGHT_EXAMPLES : pickExamples(prompt);
  const ask = current
    ? `Here is the current definition:\n${compactJson(current)}\n\nChange it: ${prompt}\nAnswer with the complete revised JSON.`
    : `Write a definition for: ${prompt}`;
  return [
    { role: 'system', content: systemPrompt(mode, examples) },
    { role: 'user', content: `${suggestionBlock(prompt)}${ask}` },
  ];
}

/** For an error a model often makes, what to write instead. */
const HINTS: [RegExp, (m: RegExpMatchArray) => string | undefined][] = [
  [
    /(\w+)\.(\w+) is not a vec2 operation/,
    (m) => {
      const own = operations.filter((op) => op.owner === m[1]);
      return own.length
        ? `${m[1]} has: ${own.map((op) => op.member).join(', ')}.`
        : `${m[1]} is not a class; see the reference for the operations there are.`;
    },
  ],
  [/(\w+\.\w+) has no parameter|(\w+\.\w+): \w+ is missing/, (m) => usage(m[1] ?? m[2]!)],
  [/the (\w+) is missing/, () => 'A method needs "self": the value it is called on.'],
  [/is not defined here/, () => 'A ref names an input, an earlier cell, or (inside a function) a parameter.'],
  [/No output draws/, () => 'Mark a geometry cell "output": true (with its "type").'],
  [
    /^\d+:(\d+) /,
    (m) =>
      Number(m[1]) > 120
        ? 'The error is deep in a long line: split that expression into helper functions or cells (one sub-result each) so the brackets balance.'
        : undefined,
  ],
  [
    /(\w+) is not a function defined before here/,
    (m) => `A function can call itself and the functions above it; define ${m[1]} first.`,
  ],
  [
    /a function that calls itself needs a base case|recursion that branches is too deep/,
    () => 'Give the recursion a base case with {"if": …} on a level that counts down, and keep the depth small.',
  ],
];
function usage(id: string): string | undefined {
  const op = operationById.get(id);
  return op && `Its signature: ${signature(op)}.`;
}
export const hintsFor = (errors: readonly string[]) => [
  ...new Set(
    errors.flatMap((e) =>
      HINTS.flatMap(([re, hint]) => {
        const m = e.match(re);
        const text = m && hint(m);
        return text ? [text] : [];
      }),
    ),
  ),
];

/** The follow-up that asks for a fix, with what failed. */
export function repairMessage(stage: string, errors: readonly string[]): string {
  const what =
    {
      extract: 'could not be found',
      parse: 'is not valid JSON',
      shape: 'is not a definition',
      type: 'does not type-check',
      evaluate: 'fails when evaluated',
      draw: 'draws nothing',
      link: 'cannot be saved in the playground link',
    }[stage] ?? 'failed';
  const hints = hintsFor(errors);
  return `That definition ${what}:\n${errors.map((e) => `- ${e}`).join('\n')}${hints.length ? `\n\nHint: ${hints.join(' ')}` : ''}\n\nFix it and answer with the complete corrected JSON object. Use only operations from the reference.`;
}
