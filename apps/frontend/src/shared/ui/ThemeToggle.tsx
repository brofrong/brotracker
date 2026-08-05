"use client";

import {
	SegmentedControl,
	SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { Moon, Sun, SunMoon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { type StoredThemeMode, useThemeMode } from "#/shared/ui/theme-provider";

export function ThemeToggle() {
	const { storedMode, setStoredMode } = useThemeMode();
	const { t } = useTranslation("common");

	return (
		<SegmentedControl
			label={t("theme.label")}
			layout="fill"
			value={storedMode}
			onChange={(value) => setStoredMode(value as StoredThemeMode)}
		>
			<SegmentedControlItem
				value="light"
				label={t("theme.light")}
				icon={<Sun size={16} />}
			/>
			<SegmentedControlItem
				value="dark"
				label={t("theme.dark")}
				icon={<Moon size={16} />}
			/>
			<SegmentedControlItem
				value="auto"
				label={t("theme.system")}
				icon={<SunMoon size={16} />}
			/>
		</SegmentedControl>
	);
}
