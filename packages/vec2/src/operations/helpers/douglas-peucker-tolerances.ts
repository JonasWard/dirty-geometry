import { DouglasPeucker, type DouglasPeuckerTolerances } from '../douglas-peucker';

/** `true` → the default tolerances, `false` / missing → no simplification, tolerances are checked and kept. */
export function resolveDouglasPeuckerTolerances(
  input: boolean | DouglasPeuckerTolerances | undefined,
): DouglasPeuckerTolerances | undefined {
  if (input === undefined || input === false) return undefined;
  if (input === true) return DouglasPeucker.defaults;
  input.distance.isPositive('operations', 'resolveDouglasPeuckerTolerances');
  return input;
}
