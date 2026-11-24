/**
 * Minimal `t` signature for helpers that format text outside components.
 * Two overloads instead of one optional `options` parameter: i18next 27 types
 * `t(key)` and `t(key, options)` as separate overloads, so a single
 * `(key, options?) => string` no longer accepts the real `t`.
 */
export type Translate = {
	(key: string): string;
	(key: string, options: Record<string, unknown>): string;
};
