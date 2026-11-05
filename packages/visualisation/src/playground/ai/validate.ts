/**
 * Whether a model's answer is a working definition, in the order the playground would find out: the JSON reads,
 * it has a definition's shape, it type-checks (`checkDefinition`), every cell evaluates, an output draws something
 * and it fits in the link. The first failing stage is reported with messages written to be sent back to the model.
 * (`validateCode` does the same for the Code tab's language: the eval suite's references are written in it.)
 */
import type { Cell, Definition, Fn, Input } from '@dirty-geometry/vec2/recording/definition';
import { evaluate, type Evaluation } from '@dirty-geometry/vec2/recording/evaluate';
import { createDefinitionSchema } from '@dirty-geometry/vec2/schema/dense/definition';
import { checkDefinition, nonNull, typeName, widen } from '@dirty-geometry/vec2/schema/typing';
import { drawnItems } from '../draw';
import { CodeError, parseDefinition } from '../model/parse';
import { choosePresets } from '../presets';
import { encodeAppState } from '../url';
import { describeJsonError, JsonError, parseLooseJson } from './json';

export type Stage = 'extract' | 'parse' | 'shape' | 'type' | 'evaluate' | 'draw' | 'link';
export type Validation =
  | { ok: true; code: string; definition: Definition; evaluation: Evaluation }
  | {
      ok: false;
      stage: Stage;
      errors: string[];
      /** The answer's text (JSON, or code). */
      code?: string;
      definition?: Definition;
      /** Where a syntax error is in the text (offsets). */
      range?: { from: number; to: number };
    };

const MAX_ERRORS = 6;
const caret = (text: string, line: number, column: number, message: string) =>
  `${message}\n  ${text.split('\n')[line - 1] ?? ''}\n  ${' '.repeat(Math.max(0, column - 1))}^`;

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * A parsed answer as a definition: `format` and `version` filled in, `uses` (the model's plan) and unknown keys
 * left out. Problems are named by their place (`cells[2]: "expr" is missing`).
 */
export function toDefinition(value: unknown): { definition: Definition } | { errors: string[] } {
  const errors: string[] = [];
  if (!isObject(value)) return { errors: ['The answer is not a JSON object with "inputs", "functions" and "cells".'] };
  const list = (key: string) => {
    const items = value[key];
    if (items === undefined) {
      if (key === 'cells') errors.push('"cells" is missing: a definition needs at least one cell.');
      return [];
    }
    if (!Array.isArray(items)) {
      errors.push(`"${key}" is not a list.`);
      return [];
    }
    return items;
  };
  const named = (item: unknown, where: string): item is Record<string, unknown> => {
    if (!isObject(item)) return (errors.push(`${where} is not an object.`), false);
    if (typeof item.name !== 'string' || !item.name) return (errors.push(`${where}: "name" is missing.`), false);
    return true;
  };
  const inputs: Input[] = [];
  list('inputs').forEach((item, i) => {
    const where = `inputs[${i}]`;
    if (!named(item, where)) return;
    if (typeof item.type !== 'string')
      errors.push(`${where} ${item.name}: "type" is missing (a number type, e.g. "Length").`);
    else if (item.value === undefined) errors.push(`${where} ${item.name}: "value" is missing.`);
    else inputs.push({ name: item.name as string, type: item.type, value: item.value as Input['value'] });
  });
  const functions: Fn[] = [];
  list('functions').forEach((item, i) => {
    const where = `functions[${i}]`;
    if (!named(item, where)) return;
    const params = Array.isArray(item.params) ? item.params : [];
    if (!Array.isArray(item.params)) errors.push(`${where} ${item.name}: "params" is not a list.`);
    const typed = params.every((p) => isObject(p) && typeof p.name === 'string' && typeof p.type === 'string');
    if (!typed) errors.push(`${where} ${item.name}: each param needs a "name" and a "type".`);
    else if (item.body === undefined) errors.push(`${where} ${item.name}: "body" is missing.`);
    else functions.push({ name: item.name as string, params: params as Fn['params'], body: item.body as Fn['body'] });
  });
  const cells: Cell[] = [];
  list('cells').forEach((item, i) => {
    const where = `cells[${i}]`;
    if (!named(item, where)) return;
    if (item.expr === undefined) return errors.push(`${where} ${item.name}: "expr" is missing.`);
    if (item.type !== undefined && typeof item.type !== 'string')
      errors.push(`${where} ${item.name}: "type" is a type name.`);
    cells.push({
      name: item.name as string,
      expr: item.expr as Cell['expr'],
      ...(typeof item.type === 'string' && { type: item.type }),
      ...(item.output === true && { output: true as const }),
    });
  });
  if (errors.length) return { errors };
  return { definition: withOutputTypes({ format: 'vec2-definition', version: 4, inputs, functions, cells }) };
}

/** Outputs a model left untyped get the type the checker finds for them (an output declares its type). */
function withOutputTypes(definition: Definition): Definition {
  const untyped = definition.cells.filter((cell) => cell.output && cell.type === undefined);
  if (!untyped.length) return definition;
  const { refs } = checkDefinition({ ...definition, cells: definition.cells.map(({ output: _, ...cell }) => cell) });
  const found = (name: string) => {
    const type = refs.get(name);
    // An optional field (a boolean's `regions`) is declared without its `| null`, as the link packs it.
    const text = type === undefined ? undefined : typeName(nonNull(widen(type)));
    return text && text !== 'unknown' ? text : undefined;
  };
  return {
    ...definition,
    cells: definition.cells.map((cell) => {
      const type = cell.output && cell.type === undefined ? found(cell.name) : undefined;
      return type ? { ...cell, type } : cell;
    }),
  };
}

/** A model's JSON answer, checked stage by stage. */
export function validateJson(text: string | undefined): Validation {
  if (!text) return { ok: false, stage: 'extract', errors: ['No JSON object found in the answer.'] };
  let value: unknown;
  try {
    value = parseLooseJson(text);
  } catch (error) {
    if (!(error instanceof JsonError)) throw error;
    return {
      ok: false,
      stage: 'parse',
      code: text,
      errors: [describeJsonError(text, error)],
      range: { from: error.offset, to: error.offset + 1 },
    };
  }
  const shaped = toDefinition(value);
  if ('errors' in shaped) return { ok: false, stage: 'shape', code: text, errors: shaped.errors.slice(0, MAX_ERRORS) };
  return checkStages(shaped.definition, text);
}

/** Code in the Code tab's language, checked the same way. */
export function validateCode(code: string | undefined): Validation {
  if (!code) return { ok: false, stage: 'extract', errors: ['No code with `export function definition` found.'] };
  let definition: Definition;
  try {
    definition = parseDefinition(code);
  } catch (error) {
    if (!(error instanceof CodeError)) return { ok: false, stage: 'parse', code, errors: [(error as Error).message] };
    const message = caret(code, error.line, error.column, error.message);
    return { ok: false, stage: 'parse', code, errors: [message], range: { from: error.from, to: error.to } };
  }
  return checkStages(definition, code);
}

/** Where an issue is: `cells[3] plate at args.radius`. */
function place(definition: Definition, kind: string, name: string, path: readonly (string | number)[]) {
  const key = kind === 'cell' ? 'cells' : kind === 'function' ? 'functions' : 'inputs';
  const index = (definition[key] as { name: string }[]).findIndex((item) => item.name === name);
  return `${key}[${index}] ${name}${path.length ? ` at ${path.join('.')}` : ''}`;
}

/** The checks after reading: types, evaluation, something drawn, and the link. */
export function checkStages(definition: Definition, code: string): Validation {
  const issues = checkDefinition(definition).issues;
  if (issues.length)
    return {
      ok: false,
      stage: 'type',
      code,
      definition,
      errors: issues.slice(0, MAX_ERRORS).map((i) => `${place(definition, i.kind, i.name, i.path)}: ${i.message}`),
    };
  let evaluation: Evaluation;
  try {
    evaluation = evaluate(definition);
  } catch (error) {
    return { ok: false, stage: 'evaluate', code, definition, errors: [(error as Error).message] };
  }
  // Only the cells that failed themselves: the ones after them fail with "depends on …".
  const failed = [...evaluation.cells]
    .filter(([, result]) => 'error' in result && !result.error.startsWith('depends on '))
    .map(([name, result]) => `${place(definition, 'cell', name, [])}: ${'error' in result ? result.error : ''}`);
  if (failed.length) return { ok: false, stage: 'evaluate', code, definition, errors: failed.slice(0, MAX_ERRORS) };
  // A boolean with an arc shape (Circle2, ArcPolygon2) answers in "regions": its "polygons" are then empty.
  const emptyBooleans = definition.cells.flatMap((cell) => {
    const value = evaluation.cells.get(cell.name);
    const expr = cell.expr as { of?: { op?: unknown }; field?: unknown } | null;
    const boolean =
      typeof expr === 'object' &&
      expr !== null &&
      expr.field === 'polygons' &&
      String(expr.of?.op).startsWith('Boolean2.');
    return boolean && value && 'value' in value && Array.isArray(value.value) && value.value.length === 0
      ? [
          `${place(definition, 'cell', cell.name, [])}: the boolean's "polygons" are empty. With a Circle2 or ArcPolygon2 among the shapes the result is in "regions" (pass "options": {"object": {"arcs": {"object": {"mode": "exact"}}}} and read the "regions" field), or use Polygon2 shapes only.`,
        ]
      : [];
  });
  if (emptyBooleans.length) return { ok: false, stage: 'evaluate', code, definition, errors: emptyBooleans };
  const drawn = drawnItems(definition, evaluation, { intermediates: false }).drawn;
  if (!drawn.length)
    return {
      ok: false,
      stage: 'draw',
      code,
      definition,
      errors: [
        'No output draws any geometry: mark at least one geometry cell (Polygon2, Circle2, Line2, …) as an output.',
      ],
    };
  // It has to fit in the link too, or the playground cannot keep or share it.
  try {
    encodeAppState({ definition, options: {}, presets: choosePresets(definition, {}, createDefinitionSchema()) });
  } catch (error) {
    return {
      ok: false,
      stage: 'link',
      code,
      definition,
      errors: [`${(error as Error).message}. Give that cell a "type" (e.g. "number[]").`],
    };
  }
  return { ok: true, code, definition, evaluation };
}
