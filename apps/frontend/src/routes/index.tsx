"use client";

import { createFileRoute, redirect } from "@tanstack/react-router";
import z from "zod";
import { HomePage } from "#/features/home/home-page";

/** Legacy search params lived on `/` — keep bookmarks working. */
const legacySearchSchema = z.object({
	search: z.string().optional(),
	source: z.enum(["local", "tracker"]).optional(),
});

export const Route = createFileRoute("/")({
	component: HomePage,
	validateSearch: legacySearchSchema,
	beforeLoad: ({ search }) => {
		if (search.search?.trim() || search.source) {
			throw redirect({
				to: "/search",
				search: {
					search: search.search,
				},
			});
		}
	},
});
