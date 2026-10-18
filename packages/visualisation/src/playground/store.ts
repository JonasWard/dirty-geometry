/**
 * The playground's state: the definition, the number ranges it is packed with, and the selection. Every edit is a
 * `commit` of a new definition (made by the pure edits in model/ops.ts); commits can be undone, and quick edits of
 * the same thing (typing a number) merge into one undo step.
 */
import { createStore } from 'zustand/vanilla';
import type { Definition } from '@dirty-geometry/vec2/recording/definition';
import {
  createDefinitionSchema,
  type ActivePresets,
  type NumericOptions,
} from '@dirty-geometry/vec2/schema/dense/definition';
import { choosePresets, quantisationReport } from './presets';
import { encodePlaygroundHash } from './url';

/** What undo restores. `auto`: the presets follow the definition (cheapest exact ones) until the user picks one. */
export type Document = { definition: Definition; options: NumericOptions; presets: ActivePresets; auto: boolean };
export type Encoding = { jsonBytes: number; hash?: string; error?: string; changes: readonly string[] };
export type CommitOptions = { coalesce?: string };

export type PlaygroundStore = Document & {
  /** The presets in use: chosen from the definition while `auto`, else `presets`. */
  active: ActivePresets;
  encoding: Encoding;
  /** The selected cell or input, drawn highlighted. */
  selected: string | null;
  past: Document[];
  future: Document[];
  commit: (definition: Definition, options?: CommitOptions) => void;
  update: (patch: Partial<Document>, options?: CommitOptions) => void;
  /** Replaces everything (a starter, a link); `push` keeps the current state on the undo stack. */
  load: (document: Document, mode?: 'push' | 'reset') => void;
  undo: () => void;
  redo: () => void;
  select: (name: string | null) => void;
};

const HISTORY = 200;
const COALESCE_MS = 800;

/** The presets in use and the encoding of a document. */
export function derive(document: Document): Pick<PlaygroundStore, 'active' | 'encoding'> {
  const schema = createDefinitionSchema(document.options);
  const active = document.auto ? choosePresets(document.definition, {}, schema) : document.presets;
  const jsonBytes = new TextEncoder().encode(JSON.stringify(document.definition)).length;
  const changes = quantisationReport(document.definition, active, schema);
  try {
    const hash = encodePlaygroundHash({ definition: document.definition, options: document.options, presets: active });
    return { active, encoding: { jsonBytes, hash, changes } };
  } catch (error) {
    return { active, encoding: { jsonBytes, error: (error as Error).message, changes } };
  }
}

const documentOf = (s: Document): Document => ({
  definition: s.definition,
  options: s.options,
  presets: s.presets,
  auto: s.auto,
});
const same = (a: Document, b: Document) => JSON.stringify(a) === JSON.stringify(b);

export function createPlaygroundStore(initial: Document) {
  let last: { key: string; at: number } | undefined;
  return createStore<PlaygroundStore>()((set, get) => {
    const apply = (next: Document, options: CommitOptions = {}) => {
      const current = documentOf(get());
      if (same(current, next)) return;
      const now = Date.now();
      const merge = options.coalesce !== undefined && last?.key === options.coalesce && now - last.at < COALESCE_MS;
      last = options.coalesce === undefined ? undefined : { key: options.coalesce, at: now };
      const past = merge ? get().past : [...get().past, current].slice(-HISTORY);
      set({ ...next, ...derive(next), past, future: [] });
    };
    return {
      ...initial,
      ...derive(initial),
      selected: null,
      past: [],
      future: [],
      commit: (definition, options) => apply({ ...documentOf(get()), definition }, options),
      update: (patch, options) => apply({ ...documentOf(get()), ...patch }, options),
      load: (document, mode = 'push') => {
        last = undefined;
        const past = mode === 'push' ? [...get().past, documentOf(get())].slice(-HISTORY) : [];
        set({ ...document, ...derive(document), past, future: [], selected: null });
      },
      undo: () => {
        const { past, future } = get();
        const previous = past.at(-1);
        if (!previous) return;
        last = undefined;
        set({ ...previous, ...derive(previous), past: past.slice(0, -1), future: [documentOf(get()), ...future] });
      },
      redo: () => {
        const { past, future } = get();
        const next = future[0];
        if (!next) return;
        last = undefined;
        set({ ...next, ...derive(next), past: [...past, documentOf(get())], future: future.slice(1) });
      },
      select: (selected) => set({ selected }),
    };
  });
}
export type PlaygroundStoreApi = ReturnType<typeof createPlaygroundStore>;
