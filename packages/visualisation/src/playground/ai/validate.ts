/**
 * Whether code from a model is a working definition, in the order the playground would find out: it reads
 * (`parseDefinition`), it type-checks (`checkDefinition`), every cell evaluates, and an output draws something.
 * The first failing stage is reported with messages written to be sent back to the model.
 */
import type { Definition } from '@dirty-geometry/vec2/recording/definition';
import { evaluate, type Evaluation } from '@dirty-geometry/vec2/recording/evaluate';
import { checkDefinition } from '@dirty-geometry/vec2/schema/typing';
import { drawnItems } from '../draw';
import { CodeError, parseDefinition } from '../model/parse';
import { choosePresets } from '../presets';
import { encodeAppState } from '../url';
import { createDefinitionSchema } from '@dirty-geometry/vec2/schema/dense/definition';

export type Stage = 'extract' | 'parse' | 'type' | 'evaluate' | 'draw' | 'link';
export type Validation =
  | { ok: true; code: string; definition: Definition; evaluation: Evaluation }
  | {
      ok: false;
      stage: Stage;
      errors: string[];
      code?: string;
      definition?: Definition;
      /** Where a parse error is in the code (offsets). */
      range?: { from: number; to: number };
    };

const MAX_ERRORS = 6;

/** A parse error with its line and a caret under the spot. */
function describeCodeError(code: string, error: CodeError): string {
  const line = code.split('\n')[error.line - 1] ?? '';
  return `${error.message}\n  ${line}\n  ${' '.repeat(Math.max(0, error.column - 1))}^`;
}

export function validateCode(code: string | undefined): Validation {
  if (!code) return { ok: false, stage: 'extract', errors: ['No code block with `export function definition` found.'] };
  let definition: Definition;
  try {
    definition = parseDefinition(code);
  } catch (error) {
    if (error instanceof CodeError)
      return {
        ok: false,
        stage: 'parse',
        code,
        errors: [describeCodeError(code, error)],
        range: { from: error.from, to: error.to },
      };
    return { ok: false, stage: 'parse', code, errors: [(error as Error).message] };
  }
  const issues = checkDefinition(definition).issues;
  if (issues.length)
    return {
      ok: false,
      stage: 'type',
      code,
      definition,
      errors: issues
        .slice(0, MAX_ERRORS)
        .map((i) => `${i.kind} ${i.name}${i.path.length ? ` (at ${i.path.join('.')})` : ''}: ${i.message}`),
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
    .map(([name, result]) => `cell ${name}: ${'error' in result ? result.error : ''}`);
  if (failed.length) return { ok: false, stage: 'evaluate', code, definition, errors: failed.slice(0, MAX_ERRORS) };
  const drawn = drawnItems(definition, evaluation, { intermediates: false }).drawn;
  if (!drawn.length)
    return {
      ok: false,
      stage: 'draw',
      code,
      definition,
      errors: [
        'No output draws any geometry. Return at least one geometry (Polygon2, Circle2, Line2, …) as an output.',
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
      errors: [`${(error as Error).message}. Give that cell a declared type (e.g. \`const data: number[] = …\`).`],
    };
  }
  return { ok: true, code, definition, evaluation };
}
