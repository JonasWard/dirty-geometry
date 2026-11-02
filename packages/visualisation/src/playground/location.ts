/** The playground's state from the definition part of its link. */
import { STARTERS } from './starters';
import type { Document } from './store';
import { decodeAppState } from './url';
import { toGraph } from './model/graph';
import { decodeLayout } from './model/layout';

/** The first starter, for a page opened without a link. */
export const starter = (): Document => ({ definition: STARTERS[0]!.build(), options: {}, presets: {}, auto: true });

/** The state to start with: a link's app state, else (no link, or one that cannot be read) a starter. */
export function initialDocument(app: string, layout?: string): { document: Document; error?: string } {
  if (!app) return { document: starter() };
  try {
    // A shared link keeps the presets it was written with, and the node view's positions when they fit.
    const read = decodeAppState(app);
    return { document: { ...read, auto: false, layout: decodeLayout(layout, toGraph(read.definition)) } };
  } catch (error) {
    return { document: starter(), error: `Could not read the link: ${(error as Error).message}` };
  }
}
