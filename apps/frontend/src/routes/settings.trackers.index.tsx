"use client";

import { createFileRoute } from "@tanstack/react-router";
import { TrackersOverview } from "#/features/settings/trackers-overview";

export const Route = createFileRoute("/settings/trackers/")({
	component: TrackersIndexRoute,
});

function TrackersIndexRoute() {
	return <TrackersOverview />;
}
