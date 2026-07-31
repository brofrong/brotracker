"use client";

import { Theme } from "@astryxdesign/core/theme";
import { stoneTheme } from "@astryxdesign/theme-stone/built";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useSyncExternalStore,
} from "react";

export type StoredThemeMode = "light" | "dark" | "auto";
export type AstryxThemeMode = "light" | "dark" | "system";

const THEME_STORAGE_KEY = "theme";

function storedToAstryxMode(stored: StoredThemeMode): AstryxThemeMode {
	return stored === "auto" ? "system" : stored;
}

function readStoredMode(): StoredThemeMode {
	if (typeof window === "undefined") {
		return "auto";
	}

	const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
	if (stored === "light" || stored === "dark" || stored === "auto") {
		return stored;
	}

	return "auto";
}

const themeListeners = new Set<() => void>();

function subscribeThemeMode(onStoreChange: () => void) {
	themeListeners.add(onStoreChange);

	const onStorage = (event: StorageEvent) => {
		if (event.key === THEME_STORAGE_KEY) {
			onStoreChange();
		}
	};

	window.addEventListener("storage", onStorage);

	return () => {
		themeListeners.delete(onStoreChange);
		window.removeEventListener("storage", onStorage);
	};
}

function notifyThemeModeChange() {
	for (const listener of themeListeners) {
		listener();
	}
}

function getThemeModeSnapshot(): StoredThemeMode {
	return readStoredMode();
}

function getThemeModeServerSnapshot(): StoredThemeMode {
	return "auto";
}

type ThemeModeContextValue = {
	mode: AstryxThemeMode;
	storedMode: StoredThemeMode;
	setStoredMode: (mode: StoredThemeMode) => void;
};

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

export function useThemeMode() {
	const context = useContext(ThemeModeContext);
	if (!context) {
		throw new Error("useThemeMode must be used within ThemeProvider");
	}

	return context;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
	const storedMode = useSyncExternalStore(
		subscribeThemeMode,
		getThemeModeSnapshot,
		getThemeModeServerSnapshot,
	);

	const setStoredMode = useCallback((mode: StoredThemeMode) => {
		window.localStorage.setItem(THEME_STORAGE_KEY, mode);
		notifyThemeModeChange();
	}, []);

	const mode = storedToAstryxMode(storedMode);

	return (
		<ThemeModeContext.Provider value={{ mode, storedMode, setStoredMode }}>
			<Theme theme={stoneTheme} mode={mode}>
				{children}
			</Theme>
		</ThemeModeContext.Provider>
	);
}
