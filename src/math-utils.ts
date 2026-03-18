/**
 * Clamps a value to the inclusive range [min, max].
 *
 * @param value - The value to clamp
 * @param min - The lower bound
 * @param max - The upper bound
 * @returns The clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Linearly interpolates between start and end by factor t.
 * t=0 returns start, t=1 returns end, values outside [0,1] extrapolate.
 *
 * @param start - The start value
 * @param end - The end value
 * @param t - The interpolation factor
 * @returns The interpolated value
 */
export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

/**
 * Normalizes a value from the range [min, max] to [0, 1].
 * Returns 0 when min === max to avoid division by zero.
 *
 * @param value - The value to normalize
 * @param min - The minimum of the input range
 * @param max - The maximum of the input range
 * @returns The normalized value, typically in [0, 1]
 */
export function normalize(value: number, min: number, max: number): number {
  if (min === max) return 0;
  return (value - min) / (max - min);
}
