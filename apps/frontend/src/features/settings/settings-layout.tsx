"use client";

import { Center } from "@astryxdesign/core/Center";
import { Heading } from "@astryxdesign/core/Heading";
import { Section } from "@astryxdesign/core/Section";
import { VStack } from "@astryxdesign/core/Stack";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

const SECTIONS = [
	{ id: "profile", to: "/settings/profile" },
	{ id: "trackers", to: "/settings/trackers" },
	{ id: "downloads", to: "/settings/downloads" },
	{ id: "watchlist", to: "/settings/watchlist" },
	{ id: "metadata", to: "/settings/metadata" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

function activeSection(pathname: string): SectionId {
	return (
		SECTIONS.find((section) => pathname.startsWith(section.to))?.id ?? "profile"
	);
}

export function SettingsLayout({ children }: { children: ReactNode }) {
	const { t } = useTranslation("settings");
	const navigate = useNavigate();
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});

	return (
		<Section padding={4} variant="transparent" height="100%">
			<Center axis="horizontal" height="100%" width="100%">
				<VStack gap={4} maxWidth={520} width="100%">
					<Heading level={1}>{t("title")}</Heading>
					<TabList
						hasDivider
						value={activeSection(pathname)}
						onChange={(value) => {
							const section = SECTIONS.find((s) => s.id === value);
							if (section) {
								void navigate({ to: section.to });
							}
						}}
					>
						{SECTIONS.map((section) => (
							<Tab
								key={section.id}
								value={section.id}
								label={t(`sections.${section.id}`)}
							/>
						))}
					</TabList>
					{children}
				</VStack>
			</Center>
		</Section>
	);
}
