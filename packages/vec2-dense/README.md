# @dirty-geometry/vec2-dense

[densing](https://www.npmjs.com/package/densing) schemas for `@dirty-geometry/vec2`. It covers every value type and every recorded definition, packed into short strings for URLs and QR codes.

```ts
import { createValueSchema, encodeValue, decodeValue } from '@dirty-geometry/vec2-dense';
import { encodeDefinition, decodeDefinition, choosePresets } from '@dirty-geometry/vec2-dense';

const values = createValueSchema();
encodeValue(values, new Vec2(1.25, -3.5)); // 'bVAnjUtk'

const presets = choosePresets(definition); // the cheapest presets that keep every literal exact
const text = encodeDefinition(definition, presets); // the plate example: 323 characters instead of 3252 bytes of JSON
decodeDefinition(text).definition; // replay with evaluateDefinition
```

## Numbers

Every number is a densing `referenceNumeric` of one of four shared definitions. A payload stores which preset is active, once per definition.

| Definition | Presets | Used for |
| --- | --- | --- |
| `coordinate` | scales 1, 10, 100, 1000, 10000 × domains `[0, s]` and `[-s, s]` × precisions 1, .1, .01, .001, .0001 (50 presets, default `±100@0.01`) | x / y, lengths, radii, sizes and other plain numbers |
| `angle` | `deg@1`, `deg@0.1`, `deg@0.01` (degrees in [-360, 360]) and `rad@0.001` | radians in vec2. Degree presets convert, because densing needs decimal precisions. |
| `parameter` | `t@0.01`, `t@0.001`, `t@0.0001` in [0, 1], and `extended@0.001` in [-1, 2] | curve parameters `t` |
| `integer` | `uint8`, `±1024`, `grid` (±2²⁵) | indices, counts, grid cells |

`roles.ts` maps each number parameter of an operation to one of these definitions. Epsilons are stored as `preferIn` / `preferOut` or ±m·10^e.

Custom presets can be added with `createNumerics({ custom: { coordinate: { site: { min: -500, max: 500, precision: 0.25 } } } })`, passed as the options of `createValueSchema` / `createDefinitionSchema`. Numbers are snapped onto the active preset's grid. Values outside its range throw, and `quantisationReport` lists what a preset would change.

## Definitions

`createDefinitionSchema` is generated from `vec2.schema.json`. A node is a union over every recordable operation. Each parameter is an operand that is one of:
- an earlier node;
- omitted;
- a literal shaped by its type (number, boolean, text, choice, stored vec2 value, list, tuple or options object).

This follows the operand template of state-to-function. A payload carries a 32-bit stamp of the vec2 schema, and payloads written against another version are rejected.

`url.ts` encodes the playground hash as `<options>/<definition>`. The options carry only the custom presets; the full schema is rebuilt from them.

## TypeScript

- `definitionToTypeScript(definition)` writes recorder code.
- `runTypeScript(code)` strips types with sucrase (loaded on first use), runs the code and returns the definition it records. The code runs in the caller's context, so only run code the user typed.
