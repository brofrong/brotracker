"use client";

import {
	SegmentedControl,
	SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { Moon, Sun, SunMoon } from "lucide-react";
import {
	type StoredThemeMode,
	useThemeMode,
} from "#/components/theme-provider";

export function ThemeToggle() {
	const { storedMode, setStoredMode } = useThemeMode();

	return (
		<SegmentedControl
			label="Тема оформления"
			layout="fill"
			value={storedMode}
			onChange={(value) => setStoredMode(value as StoredThemeMode)}
		>
			<SegmentedControlItem
				value="light"
				label="Светлая"
				icon={<Sun size={16} />}
			/>
			<SegmentedControlItem
				value="dark"
				label="Тёмная"
				icon={<Moon size={16} />}
			/>
			<SegmentedControlItem
				value="auto"
				label="Система"
				icon={<SunMoon size={16} />}
			/>
		</SegmentedControl>
	);
}
