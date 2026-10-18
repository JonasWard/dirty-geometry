/** What is never recorded, shared by the schema generator and the recorder. */
/** Classes left out of the schema and the recorder: mutable scratch structures and the JSON decoders. */
export const SKIP_CLASSES: ReadonlySet<string> = new Set(['CdtMesh', 'CodecRegistry', 'Deserialise']);
/** Members that run unrecorded on any class: serialisation is not geometry. */
export const SKIP_MEMBERS: ReadonlySet<string> = new Set(['toJson', 'serialise']);
