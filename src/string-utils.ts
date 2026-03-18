// String utility functions for common case transformations.

/**
 * Splits an input string into words, handling spaces, hyphens,
 * underscores, and camelCase/PascalCase boundaries.
 */
function splitWords(input: string): string[] {
  return input
    .trim()
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[\s\-_]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/**
 * Converts a string to camelCase.
 * Handles spaces, hyphens, underscores, and mixed input (including PascalCase).
 *
 * @param input - The string to convert
 * @returns The camelCase representation
 *
 * @example
 * camelCase('hello world') // 'helloWorld'
 * camelCase('foo_bar_baz') // 'fooBarBaz'
 * camelCase('FooBarBaz')   // 'fooBarBaz'
 */
export function camelCase(input: string): string {
  const words = splitWords(input);
  return words
    .map((word, index) =>
      index === 0
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join('');
}

/**
 * Converts a string to snake_case.
 * Handles camelCase, spaces, hyphens, and mixed input.
 *
 * @param input - The string to convert
 * @returns The snake_case representation
 *
 * @example
 * snakeCase('hello world') // 'hello_world'
 * snakeCase('fooBarBaz')   // 'foo_bar_baz'
 * snakeCase('Foo Bar Baz') // 'foo_bar_baz'
 */
export function snakeCase(input: string): string {
  return splitWords(input)
    .map((word) => word.toLowerCase())
    .join('_');
}

/**
 * Converts a string to Title Case.
 * Each word's first letter is capitalized, the rest lowercased.
 *
 * @param input - The string to convert
 * @returns The Title Case representation
 *
 * @example
 * titleCase('hello world') // 'Hello World'
 * titleCase('foo_bar_baz') // 'Foo Bar Baz'
 * titleCase('fooBarBaz')   // 'Foo Bar Baz'
 */
export function titleCase(input: string): string {
  return splitWords(input)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
