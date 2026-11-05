/**
 * The messages sent to a model: the rules of the playground's code (what `parseDefinition` reads), the API
 * reference, worked examples (the starters), and the request. `full` sends every operation and three examples
 * picked for the request; `light` (for small, fast models) the core operations and two fixed examples.
 */
import { operations } from '@dirty-geometry/vec2/schema/schema';
import { STARTER_CODE } from '../starters';
import { compactReference, fullReference } from './reference';

export type Mode = 'full' | 'light';
export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export const RULES = `You write geometry definitions for the vec2 playground, a 2D geometry tool. The code is a small, strict subset of TypeScript that is parsed (never run as JavaScript), so follow these rules exactly.

Shape of the code:
- Optionally \`import * as lib from '@dirty-geometry/fn/lib';\` first (only if you use lib.*).
- Then optional helper functions: \`function name(p: Type, …) { const t = expression; … return expression; }\` (only const lines, then one return; no if).
- Then exactly one \`export function definition(input: Type = literal, …): { out: Type; … } { const cell = expression; … return { out, … }; }\`.
  Inputs are the user's sliders: give each a number type and a literal default. The body is only \`const\` lines, then one \`return { … }\` of cell names. Every returned name must be a const cell and appear in the return type.

Expressions: \`new Class(…)\`, static calls \`Class.member(…)\`, method calls \`value.member(…)\`, field reads \`line.from\`, index reads \`list[0]\`, list literals \`[a, b]\`, option objects \`{ arcs: { mode: 'exact' } }\`, number/string/boolean literals, \`+ - * /\`, unary \`-\` and parentheses.
NOT available: loops, if, ternary \`? :\`, arrow functions, comparison operators, %, template strings, spread outside arguments. Math.PI and Math.sin/cos/sqrt/… work; for the rest use lib.*:
- lib.sin/cos/tan/atan2/abs/min/max/pow/floor/round/mod, lib.smallerThan(a, b)/biggerThan/equal, lib.and/or/not, lib.ifElse(condition, then, otherwise)
- lib.generate(count, fnName, undefined, data): calls \`fnName(i: Index, previous: T, count: Index, data: D)\` for i = 0…count-1 and returns the list (use it instead of loops; data is often a list of numbers like [radius, depth]).
- lib.map(list, fnName, data) with \`fnName(item: T, i: Index, data: D)\`; lib.filter(list, fnName, data) (fn returns a boolean); lib.sort(list, fnName, data) (fn returns a number); lib.slice(list, start, end); lib.at(list, i); lib.length(list)
- callbacks are passed by NAME (a helper function defined above), never inline.

Types: number types are Coordinate (any position or offset), Length (≥ 0 size), Radians, Parameter (0…1), Integer, Index (whole ≥ 0); plus boolean, string and the classes below. Lists are \`T[]\`.
Methods depend on the value's type; only use operations listed in the reference. Angles are radians (2π ≈ 6.2832); Angle.fromDegrees(d).radians() converts.

Pitfalls:
- Boolean2.union/subtract/intersect return a result: read \`.polygons\` (Polygon2[]) or, with \`{ arcs: { mode: 'exact' } }\` and arc shapes (ArcPolygon2, Circle2), \`.regions\` (ArcPolygon2[]).
- No spread in list literals (\`[a, ...rest]\` fails); build one list with lib.generate (lib.ifElse(lib.equal(i, 0), first, other) for a different first item).
- Boolean2.union takes ONE list; subtract/intersect take (subject list, clip or clip list).
- A circle as a region is ArcPolygon2.fromCircle2(circle) (exact) or Polygon2.fromCircle2(circle, segments).
- Polygon vertices are a list of Vec2 in order around the shape; do not repeat the first vertex.
- Rotate or move with .transform(Mat3.rotation(radians)) / .transform(Mat3.translation(x, y)).
- Outputs that are geometry are drawn; also return useful numbers (area, length) as outputs.

Answer with ONE \`\`\`ts code block containing the complete code, and nothing else.`;

const LIGHT_EXAMPLES = ['squares', 'star'];
const DEFAULT_EXAMPLES = ['squares', 'star', 'gear'];
/** Words that point to an example beyond its id. */
const KEYWORDS: Record<string, string[]> = {
  star: ['star', 'point', 'spike', 'rim'],
  squares: ['square', 'union', 'rectangle', 'box', 'merge', 'combine'],
  gear: ['gear', 'tooth', 'teeth', 'cog', 'bore', 'rotate', 'rotated', 'sprocket'],
  fillet: ['fillet', 'round', 'rounded', 'corner'],
  'three-points': ['arc', 'three', 'through'],
  slot: ['slot', 'offset', 'capsule', 'stadium'],
  lens: ['lens', 'intersect', 'intersection', 'disc', 'circles', 'overlap'],
  wave: ['wave', 'wavy', 'path', 'zigzag'],
  'mounting-plate': ['plate', 'hole', 'holes', 'bolt', 'mount', 'bracket', 'subtract', 'cut'],
  'half-ring': ['ring', 'annulus', 'half', 'washer', 'donut'],
  'wobbly-ring': ['random', 'noise', 'wobbly', 'generate', 'many', 'filter', 'sort', 'points', 'repeat', 'count'],
  line: ['line', 'point', 'segment'],
};

/** The examples that share the most words with the request (ties keep the default order). */
export function pickExamples(prompt: string, count = 3): string[] {
  const words = new Set(prompt.toLowerCase().match(/[a-z]+/g) ?? []);
  const score = (id: string) => (KEYWORDS[id] ?? []).filter((w) => words.has(w) || words.has(`${w}s`)).length;
  const ranked = Object.keys(STARTER_CODE)
    .map((id, order) => ({
      id,
      score: score(id),
      order: DEFAULT_EXAMPLES.includes(id) ? DEFAULT_EXAMPLES.indexOf(id) - 100 : order,
    }))
    .sort((a, b) => b.score - a.score || a.order - b.order);
  return ranked.slice(0, count).map((r) => r.id);
}

/** The system prompt: rules, reference and examples. It depends only on the mode and the examples, so it caches. */
export function systemPrompt(mode: Mode, examples: readonly string[]): string {
  const reference = mode === 'full' ? fullReference() : compactReference();
  const shown = examples.map((id) => `Example (${id}):\n\`\`\`ts\n${STARTER_CODE[id]}\n\`\`\``).join('\n\n');
  return `${RULES}\n\n# API reference\n${reference}\n\n# Examples\n${shown}`;
}

export type PromptRequest = {
  prompt: string;
  mode: Mode;
  /** The code open in the playground: the request edits it. */
  current?: string;
};

/** The first messages of a generation. */
export function buildMessages({ prompt, mode, current }: PromptRequest): ChatMessage[] {
  const examples = mode === 'light' ? LIGHT_EXAMPLES : pickExamples(prompt);
  const user = current
    ? `Here is the current definition:\n\`\`\`ts\n${current}\n\`\`\`\n\nChange it: ${prompt}\nReturn the complete revised code.`
    : `Write a definition for: ${prompt}`;
  return [
    { role: 'system', content: systemPrompt(mode, examples) },
    { role: 'user', content: user },
  ];
}

/** The follow-up that asks for a fix, with what failed. */
/** For an error a model often makes, how to write it instead. */
const HINTS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [
    /found (for|while)\b/,
    () => 'There are no loops: make the list with lib.generate(count, helperName, undefined, data).',
  ],
  [/found if\b/, () => 'There is no if: use lib.ifElse(condition, then, otherwise).'],
  [
    /found =>|Unexpected "=>"|found \(/,
    () => 'There are no arrow functions: pass a named helper function to lib.generate/map/filter/sort.',
  ],
  [/Unexpected "\?"|found \?/, () => 'There is no ternary: use lib.ifElse(condition, then, otherwise).'],
  [/Unexpected "%"/, () => 'There is no %: use lib.mod(a, b).'],
  [/Unexpected "`"/, () => 'There are no template strings.'],
  [
    /found (>|<|=|!)|Unexpected "(>|<|=|!)"/,
    () =>
      'There are no comparison operators: use lib.smallerThan(a, b), lib.biggerThan(a, b) or lib.equal(a, b), and lib.ifElse to choose.',
  ],
  [/Spread items only/, () => 'No spread in lists: build the whole list with lib.generate.'],
  [
    /(\w+) has no method (\w+)/,
    (m) => {
      const names = operations.filter((op) => op.owner === m[1] && !op.static).map((op) => op.member);
      return names.length ? `${m[1]} methods: ${names.join(', ')}.` : `Check the reference for what ${m[1]} offers.`;
    },
  ],
];
export const hintsFor = (errors: readonly string[]) => [
  ...new Set(
    errors.flatMap((e) => HINTS.map(([re, hint]) => e.match(re)).flatMap((m, i) => (m ? [HINTS[i]![1](m)] : []))),
  ),
];

export function repairMessage(stage: string, errors: readonly string[]): string {
  const what =
    {
      extract: 'could not be found',
      parse: 'does not parse',
      type: 'does not type-check',
      evaluate: 'fails when evaluated',
      draw: 'draws nothing',
      link: 'cannot be saved in the playground link',
    }[stage] ?? 'failed';
  const hints = hintsFor(errors);
  return `That code ${what}:\n${errors.map((e) => `- ${e}`).join('\n')}${hints.length ? `\n\nHint: ${hints.join(' ')}` : ''}\n\nFix it and answer with the complete corrected code in one \`\`\`ts block. Use only operations from the reference.`;
}
