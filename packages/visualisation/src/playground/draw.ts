/** What the playground canvas draws, and in which colour; kept apart from three.js so it can be tested. */
import { isGeometry2, type Geometry2 } from '@dirty-geometry/vec2/geometry/kinds';
import type { Definition } from '@dirty-geometry/vec2/recording/definition';
import type { Evaluation } from '@dirty-geometry/vec2/recording/evaluate';

export const PLAYGROUND_COLORS = {
  intermediate: '#5b6577',
  outputs: ['#4da3ff', '#7dff7d', '#ffb347', '#c77dff', '#5ce1ff', '#ff7db8'],
  selected: '#ffd84d',
} as const;

export type Drawn = {
  key: string;
  name: string;
  geometry: Geometry2;
  role: 'intermediate' | 'output' | 'selected';
  color: string;
};

/** Geometries of a node value: the value itself, or the geometries in its items or (plain object) fields. */
const geometriesOf = (value: unknown): Geometry2[] =>
  isGeometry2(value)
    ? [value]
    : Array.isArray(value)
      ? value.flatMap(geometriesOf)
      : value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
        ? Object.values(value).flatMap(geometriesOf)
        : [];

/** The value of an input or a cell. */
export const valueOf = (evaluation: Evaluation, name: string): unknown => {
  const cell = evaluation.cells.get(name);
  return cell ? ('value' in cell ? cell.value : undefined) : evaluation.inputs.get(name);
};

export type DrawOptions = {
  /** Drawn highlighted on top. */
  selected?: string | null;
  /** Names left out (the camera still frames them, so hiding one does not move the view). */
  hidden?: ReadonlySet<string>;
  /** Whether inputs and cells that are not outputs are drawn (faintly); default yes. */
  intermediates?: boolean;
};

/** Output colours by the output's place among the definition's outputs. */
export const outputColor = (index: number) => PLAYGROUND_COLORS.outputs[index % PLAYGROUND_COLORS.outputs.length]!;

/**
 * What is drawn, intermediates first so outputs and the selection sit on top, and what the camera frames (the
 * same, hidden ones included).
 */
export function drawnItems(
  definition: Definition,
  evaluation: Evaluation,
  { selected = null, hidden, intermediates = true }: DrawOptions = {},
): { drawn: Drawn[]; framed: Geometry2[] } {
  const outputs = definition.cells.filter((cell) => cell.output).map((cell) => cell.name);
  const items: Drawn[] = [];
  const framed: Geometry2[] = [];
  for (const { name } of [...definition.inputs, ...definition.cells]) {
    const output = outputs.indexOf(name);
    if (output < 0 && !intermediates && name !== selected) continue;
    const role = name === selected ? 'selected' : output >= 0 ? 'output' : 'intermediate';
    const color =
      role === 'selected'
        ? PLAYGROUND_COLORS.selected
        : role === 'output'
          ? outputColor(output)
          : PLAYGROUND_COLORS.intermediate;
    geometriesOf(valueOf(evaluation, name)).forEach((geometry, i) => {
      framed.push(geometry);
      // Keyed by name, so a geometry keeps its object when it is highlighted (and moves to the top).
      if (!hidden?.has(name)) items.push({ key: `${name}-${i}`, name, geometry, role, color });
    });
  }
  const order = { intermediate: 0, output: 1, selected: 2 } as const;
  return { drawn: items.sort((a, b) => order[a.role] - order[b.role]), framed };
}
