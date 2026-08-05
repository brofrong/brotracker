"use client";

import { createFileRoute } from "@tanstack/react-router";
import z from "zod";
import { SettingsPage } from "#/features/settings/settings-page";

const settingsSearchSchema = z.object({
	section: z
		.enum(["account", "appearance", "rutracker", "qbittorrent", "tmdb"])
		.optional(),
});

export const Route = createFileRoute("/settings")({
	component: SettingsRoute,
	validateSearch: settingsSearchSchema,
});

function SettingsRoute() {
	const { section } = Route.useSearch();
	return <SettingsPage section={section} />;
}
