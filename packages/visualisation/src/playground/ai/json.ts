/**
 * The JSON the prompt workflow reads and writes. Models write JSON with habits `JSON.parse` refuses (comments,
 * trailing commas) and browsers report a syntax error without saying where (Safari), so the reader is lenient
 * about the habits and exact about the place. The writer prints a definition one input, function and cell per line.
 */
import type { Definition } from '@dirty-geometry/vec2/recording/definition';

/** A syntax error and where it is (offset, 1-based line and column). */
export class JsonError extends Error {
  override name = 'JsonError';
  constructor(
    message: string,
    readonly offset: number,
    readonly line: number,
    readonly column: number,
  ) {
    super(`${line}:${column} ${message}`);
  }
}

/** JSON, also with `//` and block comments and trailing commas. */
export function parseLooseJson(text: string): unknown {
  let i = 0;
  const fail = (message: string, at = i): never => {
    const before = text.slice(0, at).split('\n');
    throw new JsonError(message, at, before.length, before.at(-1)!.length + 1);
  };
  const space = () => {
    for (;;) {
      while (i < text.length && /\s/.test(text[i]!)) i++;
      if (text.startsWith('//', i)) i = text.indexOf('\n', i) < 0 ? text.length : text.indexOf('\n', i);
      else if (text.startsWith('/*', i)) {
        const end = text.indexOf('*/', i + 2);
        if (end < 0) fail('A comment is not closed');
        i = end + 2;
      } else return;
    }
  };
  const describe = () => (i >= text.length ? 'the end' : JSON.stringify(text[i]));
  function value(): unknown {
    space();
    const c = text[i];
    if (c === '{') {
      i++;
      const object: Record<string, unknown> = {};
      space();
      while (text[i] !== '}') {
        if (text[i] !== '"') fail(`Expected a "quoted" key or }, found ${describe()}`);
        const key = string();
        space();
        if (text[i] !== ':') fail(`Expected : after "${key}", found ${describe()}`);
        i++;
        object[key] = value();
        space();
        if (text[i] === ',') {
          i++;
          space();
        } else if (text[i] !== '}') fail(`Expected , or } after the value of "${key}", found ${describe()}`);
      }
      i++;
      return object;
    }
    if (c === '[') {
      i++;
      const list: unknown[] = [];
      space();
      while (text[i] !== ']') {
        list.push(value());
        space();
        if (text[i] === ',') {
          i++;
          space();
        } else if (text[i] !== ']') fail(`Expected , or ] in a list, found ${describe()}`);
      }
      i++;
      return list;
    }
    if (c === '"') return string();
    const literal = /^(true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(i, i + 40));
    if (!literal) return fail(`Expected a value, found ${describe()}`);
    i += literal[0].length;
    return JSON.parse(literal[0]);
  }
  function string(): string {
    const start = i;
    i++;
    while (i < text.length && text[i] !== '"') {
      if (text[i] === '\n') fail('A string is not closed', start);
      i += text[i] === '\\' ? 2 : 1;
    }
    if (i >= text.length) fail('A string is not closed', start);
    i++;
    try {
      return JSON.parse(text.slice(start, i)) as string;
    } catch {
      return fail('A string has a bad escape', start);
    }
  }
  const result = value();
  space();
  if (i < text.length) fail(`Unexpected ${describe()} after the JSON`);
  return result;
}

/** A JSON syntax error with the line it is on and a caret under the spot, for the model. */
export function describeJsonError(text: string, error: JsonError): string {
  const line = text.split('\n')[error.line - 1] ?? '';
  return `${error.message}\n  ${line}\n  ${' '.repeat(Math.max(0, error.column - 1))}^`;
}

/** Every vec2 operation an expression (or a definition) uses, in first-use order. */
export function operationsUsed(definition: Definition): string[] {
  const found = new Set<string>();
  const walk = (e: unknown): void => {
    if (Array.isArray(e)) return e.forEach(walk);
    if (e === null || typeof e !== 'object' || 'value' in e) return;
    const op = (e as { op?: unknown }).op;
    if (typeof op === 'string') found.add(op);
    Object.values(e).forEach(walk);
  };
  for (const fn of definition.functions) walk(fn.body);
  for (const cell of definition.cells) walk(cell.expr);
  return [...found];
}

/**
 * A definition as compact JSON: one input, function and cell per line. With `uses`, its operations first (what a
 * model is asked to write before the cells).
 */
export function compactJson(definition: Definition, uses?: readonly string[]): string {
  const one = (value: unknown) => JSON.stringify(value);
  const list = (items: readonly unknown[]) => (items.length ? `[\n    ${items.map(one).join(',\n    ')}\n  ]` : '[]');
  const lines = [
    ...(uses ? [`  "uses": ${one(uses)}`] : []),
    `  "inputs": ${list(definition.inputs)}`,
    `  "functions": ${list(definition.functions)}`,
    `  "cells": ${list(definition.cells)}`,
  ];
  return `{\n${lines.join(',\n')}\n}`;
}
