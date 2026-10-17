import { describe, expect, test } from 'bun:test';
import { evaluateDefinition } from '@dirty-geometry/vec2/recording/replay';
import { operationOf } from '@dirty-geometry/vec2-dense/definition-schema';
import { DEFAULT_VALUES } from '../src/playground/defaults';
import {
  addNode,
  addParam,
  emptyDefinition,
  moveNode,
  removeNode,
  setArg,
  setOutput,
  validateDefinition,
} from '../src/playground/editing';
import { OPERATION_GROUPS } from '../src/playground/operations';
import { STARTERS } from '../src/playground/starters';
import { defaultRegistry } from '@dirty-geometry/vec2/io/default-registry';

describe('playground', () => {
  test('every hardcoded operation is a recordable vec2 operation', () => {
    for (const op of OPERATION_GROUPS.flatMap((group) => group.ops)) {
      expect(operationOf(op)?.recordable, op).toBe(true);
    }
  });

  test('default values decode for every value type', () => {
    for (const json of Object.values(DEFAULT_VALUES)) expect(() => defaultRegistry.decode(json)).not.toThrow();
  });

  test('starters replay without errors', () => {
    for (const starter of STARTERS)
      expect(evaluateDefinition(starter.build(), { partial: true }).error).toBeUndefined();
  });

  test('building a definition with the editing helpers', () => {
    let definition = addParam(emptyDefinition(), 'width', { lit: 3 }, { kind: 'number' });
    definition = addNode(definition, 'Vec2.new');
    const point = definition.nodes.at(-1)!.id;
    definition = setArg(definition, point, 0, { ref: definition.params.width!.node });
    let values = evaluateDefinition(definition).values;
    // A new method node picks the latest fitting node as self.
    definition = addNode(definition, 'Vec2#scale', values);
    const scaled = definition.nodes.at(-1)!;
    expect(scaled).toMatchObject({ self: point, args: [{ lit: 1 }] });
    definition = setArg(definition, scaled.id, 0, { lit: 2 });
    definition = setOutput(definition, scaled.id, 'doubled');
    expect((evaluateDefinition(definition).outputs.doubled as { toJson(): unknown }).toJson()).toEqual({
      type: 'Vec2',
      x: 6,
      y: 2,
    });
    expect(validateDefinition(definition).size).toBe(0);
  });

  test('validation flags later and removed references and missing operands', () => {
    let definition = addNode(emptyDefinition(), 'Vec2.new');
    const first = definition.nodes[0]!.id;
    definition = addNode(definition, 'Vec2#scale', evaluateDefinition(definition).values);
    const second = definition.nodes[1]!.id;
    expect(validateDefinition(moveNode(definition, second, -1)).get(second)).toEqual([
      expect.stringContaining('later node'),
    ]);
    expect(validateDefinition(removeNode(definition, first)).get(second)).toEqual([
      expect.stringContaining('removed node'),
    ]);
    expect(validateDefinition(setArg(definition, second, 0, { undefined: true })).get(second)).toEqual([
      'factor is required',
    ]);
  });
});
