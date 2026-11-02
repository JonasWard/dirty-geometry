/** The selected node's value: its expression run as a cell of its own (cells before it are reused), for drawing. */
import { useMemo } from 'react';
import type { Definition } from '@dirty-geometry/vec2/recording/definition';
import { evaluate, type Evaluation } from '@dirty-geometry/vec2/recording/evaluate';
import { freeName } from '../model/ops';
import { toGraph, withPreviewCell, type Graph } from '../model/graph';

export type Preview = { definition: Definition; evaluation: Evaluation; selected: string; value: unknown };

export function previewOf(
  definition: Definition,
  evaluation: Evaluation,
  key: string | null,
  graph: Graph = toGraph(definition),
): Preview | undefined {
  if (!key) return undefined;
  const node = graph.byKey.get(key);
  if (node?.kind === 'input') {
    const value = evaluation.inputs.get(node.name!);
    return { definition, evaluation, selected: node.name!, value };
  }
  const placed = withPreviewCell(definition, graph, key, freeName(definition, 'preview'));
  if (!placed) return undefined;
  const run = placed.definition === definition ? evaluation : evaluate(placed.definition, { previous: evaluation });
  const result = run.cells.get(placed.name);
  return {
    definition: placed.definition,
    evaluation: run,
    selected: placed.name,
    value: result && ('value' in result ? result.value : new Error(result.error)),
  };
}

export const usePreview = (definition: Definition, evaluation: Evaluation, key: string | null, graph?: Graph) =>
  useMemo(() => previewOf(definition, evaluation, key, graph), [definition, evaluation, key, graph]);
