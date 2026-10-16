import { CodecRegistry } from './codec';
import { boundsCodecs } from './codecs/bounds';
import { coreCodecs } from './codecs/core';
import { geometryCodecs } from './codecs/geometry';
import { gridCodecs } from './codecs/grid';

/** Registry with a codec for every vec2 type; the only module that imports them all. */
export function createDefaultRegistry(): CodecRegistry {
  return new CodecRegistry().register(...coreCodecs, ...boundsCodecs, ...geometryCodecs, ...gridCodecs);
}

export const defaultRegistry = createDefaultRegistry();
