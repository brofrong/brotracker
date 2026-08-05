"use client";

import { createFileRoute } from "@tanstack/react-router";
import { TorrentsPage } from "#/features/torrents/torrents-page";

export const Route = createFileRoute("/torrents")({
	component: TorrentsPage,
});
