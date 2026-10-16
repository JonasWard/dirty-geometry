/** Decodes the JSON that one type's `toJson` writes; `type` is the JSON `type` tag it handles. */
export type Codec<T = unknown> = {
  readonly type: string;
  decode(json: unknown): T;
};

/** Build a codec from a shape guard and a constructor; invalid JSON throws `Invalid <type> JSON`. */
export function codec<J, T>(type: string, isJson: (json: unknown) => json is J, build: (json: J) => T): Codec<T> {
  return {
    type,
    decode(json: unknown): T {
      if (!isJson(json)) throw new Error(`Invalid ${type} JSON`);
      return build(json);
    },
  };
}

/** Dispatches JSON to the codec registered for its `type` tag. Register your own types to extend it. */
export class CodecRegistry {
  private readonly codecs = new Map<string, Codec>();

  register(...codecs: readonly Codec[]): this {
    for (const entry of codecs) {
      if (this.codecs.has(entry.type)) throw new Error(`A codec for ${entry.type} is already registered`);
      this.codecs.set(entry.type, entry);
    }
    return this;
  }

  has(type: string): boolean {
    return this.codecs.has(type);
  }

  types(): string[] {
    return [...this.codecs.keys()];
  }

  decode<T = unknown>(json: unknown): T {
    if (typeof json !== 'object' || json === null || typeof (json as { type?: unknown }).type !== 'string') {
      throw new Error('Invalid JSON: expected an object with a string `type`');
    }
    const type = (json as { type: string }).type;
    const entry = this.codecs.get(type);
    if (!entry) throw new Error(`Unknown type: ${type}`);
    return entry.decode(json) as T;
  }
}
