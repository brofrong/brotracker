export type AppLocale = "ru" | "en";

const DEFAULT_LOCALE: AppLocale = "ru";

export function parseAppLocale(value: string | string[] | undefined): AppLocale {
	const raw = Array.isArray(value) ? value[0] : value;
	if (raw === "en" || raw === "ru") {
		return raw;
	}
	return DEFAULT_LOCALE;
}

/** TMDB `language` query param for the given app locale. */
export function toTmdbLanguage(locale: AppLocale): string {
	return locale === "en" ? "en-US" : "ru-RU";
}
