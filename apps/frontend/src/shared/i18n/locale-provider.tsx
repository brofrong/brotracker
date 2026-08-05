"use client";

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useSyncExternalStore,
} from "react";
import { I18nextProvider } from "react-i18next";
import { queryClient } from "#/shared/lib/trpc";
import i18n from "./index";
import {
	type AppLocale,
	DEFAULT_LOCALE,
	LOCALE_STORAGE_KEY,
	readStoredLocale,
	toBcp47,
} from "./locale";

const localeListeners = new Set<() => void>();

function subscribeLocale(onStoreChange: () => void) {
	localeListeners.add(onStoreChange);

	const onStorage = (event: StorageEvent) => {
		if (event.key === LOCALE_STORAGE_KEY) {
			onStoreChange();
		}
	};

	window.addEventListener("storage", onStorage);

	return () => {
		localeListeners.delete(onStoreChange);
		window.removeEventListener("storage", onStorage);
	};
}

function notifyLocaleChange() {
	for (const listener of localeListeners) {
		listener();
	}
}

function getLocaleSnapshot(): AppLocale {
	return readStoredLocale();
}

function getLocaleServerSnapshot(): AppLocale {
	return DEFAULT_LOCALE;
}

type LocaleContextValue = {
	locale: AppLocale;
	setLocale: (locale: AppLocale) => void;
	bcp47: string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function useLocale() {
	const context = useContext(LocaleContext);
	if (!context) {
		throw new Error("useLocale must be used within LocaleProvider");
	}

	return context;
}

export function LocaleProvider({ children }: { children: ReactNode }) {
	const locale = useSyncExternalStore(
		subscribeLocale,
		getLocaleSnapshot,
		getLocaleServerSnapshot,
	);

	const setLocale = useCallback((next: AppLocale) => {
		window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
		notifyLocaleChange();
		void i18n.changeLanguage(next);
		document.documentElement.lang = toBcp47(next);
		void queryClient.invalidateQueries();
	}, []);

	useEffect(() => {
		document.documentElement.lang = toBcp47(locale);
		if (i18n.language !== locale) {
			void i18n.changeLanguage(locale);
		}
	}, [locale]);

	return (
		<LocaleContext.Provider
			value={{ locale, setLocale, bcp47: toBcp47(locale) }}
		>
			<I18nextProvider i18n={i18n}>{children}</I18nextProvider>
		</LocaleContext.Provider>
	);
}
