/** The playground's state from the definition part of its link. */
import { STARTERS } from './starters';
import type { Document } from './store';
import { decodePlaygroundHash, isLegacyHash } from './url';

/** The first starter, for a page opened without a link. */
export const starter = (): Document => ({ definition: STARTERS[0]!.build(), options: {}, presets: {}, auto: true });

/**
 * The state to start with from a link's definition (`4/<options>/<definition>`): a version 4 link right away (an
 * older link is read once the page is up), else a starter.
 */
export function initialDocument(hash: string): { document: Document; error?: string } {
  if (!hash || isLegacyHash(hash)) return { document: starter() };
  try {
    // A shared link keeps the presets it was written with.
    return { document: { ...decodePlaygroundHash(hash), auto: false } };
  } catch (error) {
    return { document: starter(), error: `Could not read the link: ${(error as Error).message}` };
  }
}
