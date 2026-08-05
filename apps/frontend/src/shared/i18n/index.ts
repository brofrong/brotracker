import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { readStoredLocale } from "./locale";
import en from "./locales/en.json";
import ru from "./locales/ru.json";

export const namespaces = [
	"common",
	"nav",
	"settings",
	"home",
	"search",
	"title",
	"transfers",
	"stats",
	"workers",
	"auth",
] as const;

void i18n.use(initReactI18next).init({
	resources: {
		ru,
		en,
	},
	lng: readStoredLocale(),
	fallbackLng: "ru",
	defaultNS: "common",
	ns: [...namespaces],
	interpolation: {
		escapeValue: false,
	},
});

export default i18n;
export {
	type AppLocale,
	DEFAULT_LOCALE,
	LOCALE_STORAGE_KEY,
	parseAppLocale,
	readStoredLocale,
	toBcp47,
} from "./locale";
