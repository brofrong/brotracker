"use client";

import { IconButton } from "@astryxdesign/core/IconButton";
import { Moon, Sun, SunMoon } from "lucide-react";
import {
	type StoredThemeMode,
	useThemeMode,
} from "#/components/theme-provider";

const nextMode: Record<StoredThemeMode, StoredThemeMode> = {
	light: "dark",
	dark: "auto",
	auto: "light",
};

const themeIcons: Record<StoredThemeMode, React.ReactNode> = {
	light: <Sun />,
	dark: <Moon />,
	auto: <SunMoon />,
};

const themeLabels: Record<StoredThemeMode, string> = {
	light: "Theme mode: light. Click to switch to dark mode.",
	dark: "Theme mode: dark. Click to switch to system mode.",
	auto: "Theme mode: system. Click to switch to light mode.",
};

export function ThemeToggle() {
	const { storedMode, setStoredMode } = useThemeMode();

	return (
		<IconButton
			variant="ghost"
			label={themeLabels[storedMode]}
			tooltip={themeLabels[storedMode]}
			icon={themeIcons[storedMode]}
			onClick={() => setStoredMode(nextMode[storedMode])}
		/>
	);
}
