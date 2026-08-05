"use client";

import { Heading } from "@astryxdesign/core/Heading";
import {
	SegmentedControl,
	SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AppLocale } from "#/shared/i18n/locale";
import { useLocale } from "#/shared/i18n/locale-provider";

export function LocaleToggle() {
	const { locale, setLocale } = useLocale();
	const { t } = useTranslation("settings");

	return (
		<VStack gap={2} width="100%">
			<VStack gap={1} width="100%">
				<HStack gap={2} vAlign="center">
					<Globe size={16} aria-hidden />
					<Heading level={3}>{t("appearance.locale.title")}</Heading>
				</HStack>
				<Text type="supporting">{t("appearance.locale.description")}</Text>
			</VStack>
			<SegmentedControl
				label={t("appearance.locale.label")}
				layout="fill"
				value={locale}
				onChange={(value) => setLocale(value as AppLocale)}
			>
				<SegmentedControlItem value="ru" label={t("appearance.locale.ru")} />
				<SegmentedControlItem value="en" label={t("appearance.locale.en")} />
			</SegmentedControl>
		</VStack>
	);
}
