"use client";

import { createFileRoute } from "@tanstack/react-router";
import { TransfersPage } from "#/features/torrents/transfers-page";

export const Route = createFileRoute("/torrents")({
	component: TransfersPage,
});
