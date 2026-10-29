"use client";

import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import z from "zod";

import { SettingsLayout } from "#/features/settings/settings-layout";

const settingsSearchSchema = z.object({
	section: z
		.enum([
			"account",
			"appearance",
			"rutracker",
			"kinozal",
			"rutor",
			"qbittorrent",
			"tmdb",
		])
		.optional(),
});

export const Route = createFileRoute("/settings")({
	validateSearch: settingsSearchSchema,
	// Old single-page links (`/settings?section=kinozal`) open the matching module.
	beforeLoad: ({ search: { section } }) => {
		if (!section) {
			return;
		}
		if (section === "account" || section === "appearance") {
			throw redirect({ to: "/settings/profile" });
		}
		if (section === "qbittorrent") {
			throw redirect({ to: "/settings/downloads" });
		}
		if (section === "tmdb") {
			throw redirect({ to: "/settings/metadata" });
		}
		throw redirect({
			to: "/settings/trackers/$tracker",
			params: { tracker: section },
		});
	},
	component: SettingsLayoutRoute,
});

function SettingsLayoutRoute() {
	return (
		<SettingsLayout>
			<Outlet />
		</SettingsLayout>
	);
}
