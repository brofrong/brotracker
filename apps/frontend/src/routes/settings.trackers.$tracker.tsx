"use client";

import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TrackerForm } from "#/features/settings/tracker-form";
import { findTracker } from "#/features/settings/tracker-registry";

export const Route = createFileRoute("/settings/trackers/$tracker")({
	component: TrackerRoute,
});

function TrackerRoute() {
	const { tracker: trackerId } = Route.useParams();
	const { t } = useTranslation("settings");
	const navigate = useNavigate();
	const tracker = findTracker(trackerId);
	const backButton = (
		<Button
			label={t("trackers.back")}
			icon={<ChevronLeft size={16} />}
			variant="ghost"
			onClick={() => void navigate({ to: "/settings/trackers" })}
		/>
	);

	if (!tracker) {
		return (
			<EmptyState
				title={t("trackers.notFoundTitle")}
				description={t("trackers.notFoundDescription")}
				actions={backButton}
			/>
		);
	}

	return (
		<VStack gap={3} width="100%">
			<HStack>{backButton}</HStack>
			<TrackerForm key={tracker.id} tracker={tracker} />
		</VStack>
	);
}
