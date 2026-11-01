/** The playground's state from the definition part of its link. */
import { STARTERS } from './starters';
import type { Document } from './store';
import { decodeAppState } from './url';

/** The first starter, for a page opened without a link. */
export const starter = (): Document => ({ definition: STARTERS[0]!.build(), options: {}, presets: {}, auto: true });

/** The state to start with: a link's app state, else (no link, or one that cannot be read) a starter. */
export function initialDocument(app: string): { document: Document; error?: string } {
  if (!app) return { document: starter() };
  try {
    // A shared link keeps the presets it was written with.
    return { document: { ...decodeAppState(app), auto: false } };
  } catch (error) {
    return { document: starter(), error: `Could not read the link: ${(error as Error).message}` };
  }
}
