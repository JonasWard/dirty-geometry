/** Which numeric definition a `number` parameter of a vec2 operation uses. */
import type { NumericRole } from './numerics';

/** How a number operand is stored: through a numeric definition, or as an epsilon (±m·10^e). */
export type OperandRole = NumericRole | 'epsilon';

const BY_NAME: Readonly<Record<string, NumericRole>> = {
  // Angles in radians.
  theta: 'angle',
  thetaInTau: 'angle',
  radians: 'angle',
  angle: 'angle',
  // Curve parameters.
  t: 'parameter',
  // Indices and counts.
  i: 'integer',
  j: 'integer',
  index: 'integer',
  count: 'integer',
  hash: 'integer',
  hashValue: 'integer',
  edge: 'integer',
  a: 'integer',
  b: 'integer',
  constraints: 'integer',
  triangles: 'integer',
  direction: 'integer',
};

/** Exceptions by operation id and parameter name. */
const BY_OPERATION: Readonly<Record<string, Readonly<Record<string, OperandRole>>>> = {
  'Epsilon#areEqual': { a: 'coordinate', b: 'coordinate' },
  'Epsilon.custom': { input: 'epsilon' },
};

/** The role of parameter `param` of operation `op`; plain numbers (lengths, sizes, factors) are coordinates. */
export function numericRole(op: string, param: string): OperandRole {
  return BY_OPERATION[op]?.[param] ?? BY_NAME[param] ?? 'coordinate';
}
