/** Short strings as densing enum arrays over a fixed character set (names of params, outputs and fields). */
import type { DenseField } from 'densing';

export const NAME_CHARS = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_$-'];
/** Printable ASCII, for string literals. */
export const TEXT_CHARS = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i));
export const MAX_NAME_LENGTH = 48;
export const MAX_TEXT_LENGTH = 128;

export function textField(
  name: string,
  chars: readonly string[] = NAME_CHARS,
  maxLength = MAX_NAME_LENGTH,
): DenseField {
  return {
    type: 'enum_array',
    name,
    enum: { type: 'enum', name: `${name}Char`, options: chars, defaultValue: chars[0]! },
    minLength: 0,
    maxLength,
    defaultValue: [],
  };
}

export function toChars(value: string, chars: readonly string[], label: string, maxLength = MAX_NAME_LENGTH): string[] {
  const out = [...value];
  if (out.length > maxLength) throw new RangeError(`${label}: "${value}" is longer than ${maxLength} characters`);
  for (const char of out) {
    if (!chars.includes(char)) throw new RangeError(`${label}: "${value}" contains "${char}", which is not allowed`);
  }
  return out;
}

export const fromChars = (chars: readonly string[]) => chars.join('');
