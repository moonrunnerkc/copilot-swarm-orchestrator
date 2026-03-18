/**
 * Converts a string to camelCase.
 * Handles spaces, hyphens, underscores, and mixed input.
 *
 * @param input - The string to convert
 * @returns The camelCase representation
 */
export function camelCase(input: string): string {
  return input
    .trim()
    .replace(/[-_\s]+(.)/g, (_, char: string) => char.toUpperCase())
    .replace(/^(.)/, (_, char: string) => char.toLowerCase());
}

/**
 * Converts a string to snake_case.
 * Handles camelCase, spaces, hyphens, and mixed input.
 *
 * @param input - The string to convert
 * @returns The snake_case representation
 */
export function snakeCase(input: string): string {
  return input
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase();
}

/**
 * Converts a string to Title Case.
 * Each word's first letter is capitalized, the rest lowercased.
 *
 * @param input - The string to convert
 * @returns The Title Case representation
 */
export function titleCase(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/(?:^|[\s_-]+)(\w)/g, (_, char: string) => ' ' + char.toUpperCase())
    .trim();
}
