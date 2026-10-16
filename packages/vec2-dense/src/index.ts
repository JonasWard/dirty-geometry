/** densing schemas for vec2 values and recorded definitions. */
export * from './numerics';
export { numericRole, type OperandRole } from './roles';
export { VALUE_TYPES, isValueType, type ValueType } from './values';
export * from './value-schema';
export { createDefinitionSchema, recordableOperations, type DenseDefinitionSchema } from './definition-schema';
export {
  decodeDefinition,
  DenseDefinitionError,
  encodeDefinition,
  normaliseDefinition,
  quantisationReport,
} from './convert';
export { choosePresets, presetBits, presetsByCost } from './presets';
export { decodePlaygroundHash, encodePlaygroundHash, type PlaygroundState } from './url';
export { definitionToTypeScript } from './codegen';
export { runTypeScript, stripTypes, TypeScriptRunError } from './run';
