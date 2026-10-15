"use client";

import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { List, ListItem } from "@astryxdesign/core/List";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
	TRACKERS,
	type TrackerEntry,
	type TrackerSettingsData,
	trackerSettingsApi,
} from "./tracker-registry";

type TrackerStatus = "enabled" | "disabled" | "notConfigured";

function trackerStatus(
	tracker: TrackerEntry,
	data: TrackerSettingsData | undefined,
): TrackerStatus | null {
	if (!data) {
		return null;
	}
	if (tracker.credentials && !data.password) {
		return "notConfigured";
	}
	return data.enabled ? "enabled" : "disabled";
}

function TrackerRow({ tracker }: { tracker: TrackerEntry }) {
	const { t } = useTranslation("settings");
	const navigate = useNavigate();
	const settingsQuery = useQuery<TrackerSettingsData>(
		trackerSettingsApi(tracker.id).queryOptions(),
	);
	const status = trackerStatus(tracker, settingsQuery.data);
	const statusLabel = status ? t(`trackers.status.${status}`) : null;

	return (
		<ListItem
			label={t(`${tracker.id}.title`)}
			description={t(`${tracker.id}.description`)}
			endContent={
				<HStack gap={3} vAlign="center">
					{status && statusLabel ? (
						<HStack gap={2} vAlign="center">
							<StatusDot
								label={statusLabel}
								variant={
									status === "enabled"
										? "success"
										: status === "notConfigured"
											? "warning"
											: "neutral"
								}
							/>
							<Text type="supporting">{statusLabel}</Text>
						</HStack>
					) : null}
					<ChevronRight aria-hidden size={16} />
				</HStack>
			}
			onClick={() =>
				void navigate({
					to: "/settings/trackers/$tracker",
					params: { tracker: tracker.id },
				})
			}
		/>
	);
}

export function TrackersOverview() {
	const { t } = useTranslation("settings");

	return (
		<Card elevation="low" padding={5} width="100%">
			<VStack gap={4} width="100%">
				<VStack gap={1}>
					<Heading level={2}>{t("trackers.title")}</Heading>
					<Text type="supporting">{t("trackers.description")}</Text>
				</VStack>
				<List density="compact" hasDividers>
					{TRACKERS.map((tracker) => (
						<TrackerRow key={tracker.id} tracker={tracker} />
					))}
				</List>
			</VStack>
		</Card>
	);
}
