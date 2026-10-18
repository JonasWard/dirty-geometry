/**
 * Runs recorder TypeScript (as written by codegen.ts, or edited by hand) and returns the definition it
 * records. Types are stripped with sucrase, loaded on first use. The code runs in the caller's own
 * JavaScript context: only run code the user typed, never code taken from a shared link.
 */
import { defaultRegistry } from '@dirty-geometry/vec2/io/default-registry';
import { createRecorder, type Recorder } from '@dirty-geometry/vec2/recording/recorder';
import type { DefinitionV3 as Definition } from '@dirty-geometry/vec2/recording/v3';

export class TypeScriptRunError extends Error {
  override name = 'TypeScriptRunError';
  constructor(
    message: string,
    /** 1-based line in the TypeScript source, when known. */
    readonly line?: number,
  ) {
    super(line ? `line ${line}: ${message}` : message);
  }
}

/** Strip TypeScript syntax; line numbers are preserved. */
export async function stripTypes(code: string): Promise<string> {
  const { transform } = await import('sucrase');
  try {
    return transform(code, { transforms: ['typescript'], disableESTransforms: true }).code;
  } catch (error) {
    const loc = (error as { loc?: { line: number } }).loc;
    throw new TypeScriptRunError((error as Error).message.replace(/\s*\(\d+:\d+\)$/, ''), loc?.line);
  }
}

const SOURCE_URL = 'vec2-definition.ts';

/** Line of the code in an error stack; `new Function` puts two header lines before the body. */
function lineFromStack(error: unknown): number | undefined {
  const match = new RegExp(`${SOURCE_URL.replace('.', '\\.')}:(\\d+):\\d+`).exec(String((error as Error)?.stack ?? ''));
  return match ? Math.max(1, Number(match[1]) - 2) : undefined;
}

/** Run recorder code and return the definition of the last recorder it created. */
export async function runTypeScript(code: string): Promise<{ definition: Definition; warnings: readonly string[] }> {
  if (/^\s*(import|export)\s/m.test(code)) {
    throw new TypeScriptRunError('imports and exports are not available; createRecorder and value() are provided');
  }
  const js = await stripTypes(code);
  const recorders: Recorder[] = [];
  const create = (...args: Parameters<typeof createRecorder>) => {
    const recorder = createRecorder(...args);
    recorders.push(recorder);
    return recorder;
  };
  const value = (json: unknown) => defaultRegistry.decode(json);

  try {
    new Function('createRecorder', 'value', `${js}\n//# sourceURL=${SOURCE_URL}`)(create, value);
  } catch (error) {
    throw new TypeScriptRunError((error as Error)?.message ?? String(error), lineFromStack(error));
  }
  const recorder = recorders.at(-1);
  if (!recorder) throw new TypeScriptRunError('the code never calls createRecorder()');
  return { definition: recorder.definition(), warnings: recorder.warnings };
}
