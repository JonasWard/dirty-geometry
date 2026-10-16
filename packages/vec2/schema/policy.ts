/**
 * The hand-written half of the schema: decisions, not facts. Everything else in vec2.schema.json is
 * generated from the source. Ids are typed against the generated `OperationId`, so an entry for a
 * method that no longer exists is a compile error.
 */
import type { OperationId } from './ids';

type ClassName = OperationId extends `${infer Owner}.new` ? Owner : never;

export const policy = {
  /** Classes whose members are never recorded, with the reason. */
  excludeClasses: {
    CdtMesh: 'mutable triangulation scratch structure',
    CodecRegistry: 'mutable registry',
    Deserialise: 'JSON decoding; definitions store values through the codec registry instead',
  } satisfies Partial<Record<ClassName | 'CdtMesh' | 'CodecRegistry' | 'Deserialise', string>>,

  /** Member names never recorded on any class. */
  excludeMembers: {
    toJson: 'serialisation, not geometry',
    serialise: 'serialisation, not geometry',
  } as Record<string, string>,

  /** Individual operations never recorded. */
  excludeOperations: {} satisfies Partial<Record<OperationId, string>>,

  /**
   * Renamed operations: old id → current id. Definitions recorded before a rename keep replaying.
   * Add an entry whenever a recordable operation is renamed.
   */
  aliases: {} satisfies Record<string, OperationId>,
} as const;
