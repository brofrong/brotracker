export type AppLocale = "ru" | "en";
export const LOCALE_STORAGE_KEY = "locale";
export const DEFAULT_LOCALE: AppLocale = "ru";

export function parseAppLocale(value: string | null | undefined): AppLocale {
	if (value === "en" || value === "ru") return value;
	return DEFAULT_LOCALE;
}

export function readStoredLocale(): AppLocale {
	if (typeof window === "undefined") return DEFAULT_LOCALE;
	return parseAppLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY));
}

export function toBcp47(locale: AppLocale): string {
	return locale === "en" ? "en-US" : "ru-RU";
}
