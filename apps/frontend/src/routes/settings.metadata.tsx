"use client";

import { createFileRoute } from "@tanstack/react-router";
import { MetadataSettings } from "#/features/settings/metadata-settings";

export const Route = createFileRoute("/settings/metadata")({
	component: MetadataRoute,
});

function MetadataRoute() {
	return <MetadataSettings />;
}
