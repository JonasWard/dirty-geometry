import type { Grid2ChainOp, Grid2SetOp } from './scenarios';

/** Earth-tone palette for non-subtractive operands. */
export const GRID2_EARTH_TONES = [
  '#c4a882', // sand
  '#a68a64', // clay
  '#8b7355', // umber
  '#b8956a', // wheat
  '#9c7e5c', // tan
  '#7d6b52', // bark
  '#d4b896', // linen
  '#6f5f4a', // loam
] as const;

export const GRID2_COLORS = {
  lattice: '#6b6560',
  frame: '#524c47',
  geometryFill: GRID2_EARTH_TONES[0],
  geometryOutline: GRID2_EARTH_TONES[2],
  geometryMarker: GRID2_EARTH_TONES[1],
  resultFill: '#5b8fd4',
  resultOutline: '#4a7ab8',
  resultOpacity: 0.48,
  subtractive: '#c45c5c',
  subtractiveOutline: '#a84848',
  operandFillOpacity: 0.24,
  earthTones: GRID2_EARTH_TONES,
} as const;

export function earthToneAt(index: number): string {
  return GRID2_EARTH_TONES[index % GRID2_EARTH_TONES.length]!;
}

/** Operand color for binary set ops: right side is red on difference. */
export function setOpOperandColor(side: 'left' | 'right', operation: Grid2SetOp): string {
  if (operation === 'difference' && side === 'right') {
    return GRID2_COLORS.subtractive;
  }
  return side === 'left' ? earthToneAt(0) : earthToneAt(1);
}

/** Operand color for chained expressions: red when the preceding op is difference. */
export function chainOperandColor(operandIndex: number, operations: readonly Grid2ChainOp[]): string {
  if (operandIndex > 0 && operations[operandIndex - 1] === 'difference') {
    return GRID2_COLORS.subtractive;
  }

  let earthIndex = 0;
  for (let i = 0; i <= operandIndex; i++) {
    if (i > 0 && operations[i - 1] === 'difference') {
      continue;
    }
    if (i === operandIndex) {
      return earthToneAt(earthIndex);
    }
    earthIndex++;
  }

  return earthToneAt(0);
}
