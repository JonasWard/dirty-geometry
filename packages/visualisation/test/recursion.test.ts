import { describe, expect, test } from 'bun:test';
import type { Definition, Expr } from '@dirty-geometry/vec2/recording/definition';
import { evaluate } from '@dirty-geometry/vec2/recording/evaluate';
import { createDefinitionSchema } from '@dirty-geometry/vec2/schema/dense/definition';
import { checkDefinition, typeName } from '@dirty-geometry/vec2/schema/typing';
import { validateJson } from '../src/playground/ai/validate';
import { toDefinition, toGraph } from '../src/playground/model/graph';
import { CodeError, parseDefinition } from '../src/playground/model/parse';
import { printDefinition } from '../src/playground/model/print';
import { choosePresets } from '../src/playground/presets';
import { decodeAppState, encodeAppState } from '../src/playground/url';
import lTree from './fixtures/l-tree.json';

const less = (n: Expr): Expr => ({ math: '-', args: [n, 1] });
/** `f(n) = n < 1 ? 1 : n * f(n - 1)`, or the body given. */
const counting = (body?: Expr, n = 5): Definition => ({
  format: 'vec2-definition',
  version: 4,
  inputs: [],
  functions: [
    {
      name: 'f',
      params: [{ name: 'n', type: 'Integer' }],
      body: body ?? {
        if: { compare: '<', args: [{ ref: 'n' }, 1] },
        then: 1,
        else: { math: '*', args: [{ ref: 'n' }, { call: 'f', args: { n: less({ ref: 'n' }) } }] },
      },
    },
  ],
  cells: [{ name: 'x', expr: { call: 'f', args: { n } } }],
});
const value = (d: Definition) => {
  const cell = evaluate(d).cells.get('x')!;
  return 'error' in cell ? cell.error : cell.value;
};

describe('recursion', () => {
  test('a function may call itself; its type comes from the base case', () => {
    const analysis = checkDefinition(counting());
    expect(analysis.issues).toEqual([]);
    expect(typeName(analysis.fns.get('f')!.returns)).toBe('number');
    expect(value(counting())).toBe(120);
  });
  test('a missing base case, or recursion that branches too much, fails the cell instead of hanging', () => {
    expect(value(counting({ call: 'f', args: { n: { ref: 'n' } } }))).toContain('needs a base case');
    const twice: Expr = {
      if: { compare: '<', args: [{ ref: 'n' }, 1] },
      then: 1,
      else: {
        math: '+',
        args: [
          { call: 'f', args: { n: less({ ref: 'n' }) } },
          { call: 'f', args: { n: less({ ref: 'n' }) } },
        ],
      },
    };
    expect(value(counting(twice, 30))).toContain('too deep');
    expect(value(counting(twice, 10))).toBe(1024);
  });
  test('an L-tree that calls itself checks, draws, survives the link, the code view and the node graph', () => {
    const result = validateJson(JSON.stringify(lTree));
    if (!result.ok) throw new Error(`${result.stage}: ${result.errors.join('; ')}`);
    const definition = result.definition;
    const presets = choosePresets(definition, {}, createDefinitionSchema());
    const linked = decodeAppState(encodeAppState({ definition, options: {}, presets })).definition;
    expect(printDefinition(linked)).toBe(printDefinition(definition));
    const code = printDefinition(definition);
    expect(code).toContain('function limb(level: Index): Polygon2 {');
    expect(printDefinition(parseDefinition(code))).toBe(code);
    expect(toDefinition(toGraph(definition)).functions).toEqual(definition.functions);
  });
  test('in code, a function that calls itself declares what it returns', () => {
    const code = `function f(n: Integer) {\n  return lib.ifElse(lib.smallerThan(n, 1), 1, n * f(n - 1));\n}\n\nexport function definition(): { x: number } {\n  const x = f(5);\n  return { x };\n}`;
    expect(() => parseDefinition(code)).toThrow(CodeError);
    expect(() => parseDefinition(code)).toThrow(/declares what it returns/);
    expect(value(parseDefinition(code.replace('(n: Integer)', '(n: Integer): number')))).toBe(120);
  });
});
