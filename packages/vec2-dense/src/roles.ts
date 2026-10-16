/** Which numeric definition a `number` parameter of a vec2 operation uses. */
import type { NumericRole } from './numerics';

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
const BY_OPERATION: Readonly<Record<string, Readonly<Record<string, NumericRole>>>> = {
  'Epsilon#areEqual': { a: 'coordinate', b: 'coordinate' },
};

/** The role of parameter `param` of operation `op`; plain numbers (lengths, sizes, factors) are coordinates. */
export function numericRole(op: string, param: string): NumericRole {
  return BY_OPERATION[op]?.[param] ?? BY_NAME[param] ?? 'coordinate';
}
