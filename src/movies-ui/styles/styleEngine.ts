import type { CSSProperties } from 'react';

type StaticStyle = CSSProperties;
type DynamicStyle<Args extends unknown[]> = (...args: Args) => CSSProperties;
type StyleDef = StaticStyle | DynamicStyle<never[]>;

type StyleSheet<T extends Record<string, StyleDef>> = {
  [K in keyof T]: T[K] extends (...args: infer A) => CSSProperties
    ? (...args: A) => CSSProperties
    : CSSProperties;
};

/**
 * Creates a frozen stylesheet — like React Native's StyleSheet.create.
 * Static styles are frozen once. Dynamic styles (functions) are passed through.
 * No CSS cascade — every component's styles are explicit and complete.
 */
export function createStyles<T extends Record<string, StyleDef>>(
  defs: T
): StyleSheet<T> {
  const result = {} as Record<string, unknown>;
  for (const key of Object.keys(defs)) {
    const def = defs[key];
    if (typeof def === 'function') {
      result[key] = def;
    } else {
      result[key] = Object.freeze({ ...def });
    }
  }
  return Object.freeze(result) as StyleSheet<T>;
}

/**
 * Merge multiple style objects. Later objects override earlier ones.
 * Useful for composing base + state-specific styles.
 */
export function mergeStyles(...styles: (CSSProperties | undefined | false)[]): CSSProperties {
  const result: CSSProperties = {};
  for (const s of styles) {
    if (s) Object.assign(result, s);
  }
  return result;
}
