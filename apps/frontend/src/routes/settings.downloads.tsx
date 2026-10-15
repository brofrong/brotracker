"use client";

import { createFileRoute } from "@tanstack/react-router";
import { DownloadsSettings } from "#/features/settings/downloads-settings";

export const Route = createFileRoute("/settings/downloads")({
	component: DownloadsRoute,
});

function DownloadsRoute() {
	return <DownloadsSettings />;
}
