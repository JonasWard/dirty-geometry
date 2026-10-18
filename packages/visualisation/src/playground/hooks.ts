'use client';

import { createContext, useContext, useMemo, useRef } from 'react';
import { useStore } from 'zustand';
import type { Definition } from '@dirty-geometry/vec2/recording/definition';
import { evaluate, type Evaluation } from '@dirty-geometry/vec2/recording/evaluate';
import { checkDefinition, type Analysis } from '@dirty-geometry/vec2/schema/typing';
import type { PlaygroundStore, PlaygroundStoreApi } from './store';

export const StoreContext = createContext<PlaygroundStoreApi | null>(null);
export const useStoreApi = () => {
  const store = useContext(StoreContext);
  if (!store) throw new Error('The playground store is missing');
  return store;
};
export const usePlayground = <T>(selector: (state: PlaygroundStore) => T) => useStore(useStoreApi(), selector);

/** The type check and the evaluation of a definition; unchanged cells keep their values from the last run. */
export function useAnalysis(definition: Definition): { analysis: Analysis; evaluation: Evaluation } {
  const previous = useRef<Evaluation | undefined>(undefined);
  return useMemo(() => {
    const analysis = checkDefinition(definition);
    let evaluation: Evaluation;
    try {
      evaluation = evaluate(definition, { previous: previous.current });
    } catch (error) {
      const message = (error as Error).message;
      evaluation = {
        inputs: new Map(),
        cells: new Map(definition.cells.map((c) => [c.name, { error: message }])),
        outputs: {},
        memo: new Map(),
      };
    }
    previous.current = evaluation;
    return { analysis, evaluation };
  }, [definition]);
}
