import type { VisualisationMeta } from '../../../core/meta';
import { DEFINITION_COLORS as C } from './colors';

export const definitionsVisualisationMeta: VisualisationMeta = {
  id: 'definitions',
  label: 'Definitions',
  title: 'Recorded definitions: record → JSON → replay',
  description:
    'A plate with a hole, built once through the recorder (createRecorder). Right: the stored definition as a DAG, from the params at the top down to the outputs (repeated sibling operations are drawn as one node). Move the sliders to replay the same JSON with new params (evaluateDefinition), the number of hole segments included.',
  legend: [
    { color: C.plate, label: 'Plate (Boolean2.subtract)', shape: 'line' },
    { color: C.hole, label: 'Hole (Polygon2.fromCircle2)', shape: 'line' },
    { color: C.param, label: 'Param node' },
    { color: C.operation, label: 'Operation node' },
    { color: C.structural, label: 'Item / field node' },
    { color: C.output, label: 'Output' },
  ],
};
