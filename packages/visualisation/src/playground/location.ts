/** Reading the playground's state from the page's link, shared by the playground and the viewer. */
import { STARTERS } from './starters';
import type { Document } from './store';
import { decodePlaygroundHash, isLegacyHash } from './url';

/** The first starter, for a page opened without a link. */
export const starter = (): Document => ({ definition: STARTERS[0]!.build(), options: {}, presets: {}, auto: true });

/** The page's hash without `#/`. */
export const currentHash = () => (typeof window === 'undefined' ? '' : window.location.hash.replace(/^#\/?/, ''));

/** The state to start with: a version 4 link right away (an older link is read once the page is up), else a starter. */
export function initialDocument(): { document: Document; error?: string } {
  const hash = currentHash();
  if (!hash || isLegacyHash(hash)) return { document: starter() };
  try {
    // A shared link keeps the presets it was written with.
    return { document: { ...decodePlaygroundHash(hash), auto: false } };
  } catch (error) {
    return { document: starter(), error: `Could not read the link: ${(error as Error).message}` };
  }
}
