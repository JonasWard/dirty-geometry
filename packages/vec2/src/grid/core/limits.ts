/** Smallest grid index on either axis; cell hashes store `index - GRID_MIN_INDEX` in 26 bits. */
export const GRID_MIN_INDEX = -(2 ** 25);

/** Largest grid index on either axis. */
export const GRID_MAX_INDEX = 2 ** 25 - 1;
