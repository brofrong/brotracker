"use client";

import { createFileRoute } from "@tanstack/react-router";
import { ProfileSettings } from "#/features/settings/profile-settings";

export const Route = createFileRoute("/settings/profile")({
	component: ProfileRoute,
});

function ProfileRoute() {
	return <ProfileSettings />;
}
