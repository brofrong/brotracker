"use client";

import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/settings/trackers")({
	component: TrackersLayoutRoute,
});

function TrackersLayoutRoute() {
	return <Outlet />;
}
