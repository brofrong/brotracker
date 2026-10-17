"use client";

import { createFileRoute } from "@tanstack/react-router";
import { WatchlistSettings } from "#/features/settings/watchlist-settings";

export const Route = createFileRoute("/settings/watchlist")({
	component: WatchlistSettingsRoute,
});

function WatchlistSettingsRoute() {
	return <WatchlistSettings />;
}
