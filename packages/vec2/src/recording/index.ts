/** Recording vec2 calls as JSON definitions: record, replay with new params, inspect. */
export { createRecorder, pruneDefinition, RecordingError, type Recorder, type RecorderOptions } from './recorder';
export {
  checkDefinition,
  DefinitionError,
  evaluateDefinition,
  type EvaluateOptions,
  type EvaluateResult,
} from './replay';
export { definitionGraph, type DefinitionGraph, type DefinitionGraphEdge, type DefinitionGraphNode } from './graph';
export { Scalar } from './scalar';
export type { ArgJson, Definition, NodeJson, ParamJson } from './definition';
