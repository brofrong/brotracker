"use client";

import { createFileRoute } from "@tanstack/react-router";
import z from "zod";
import { TitleBrowsePage } from "#/features/title/title-browse-page";

const titleSearchSchema = z.object({
	q: z.string().optional(),
});

export const Route = createFileRoute("/title/")({
	component: TitleBrowseRoute,
	validateSearch: titleSearchSchema,
});

function TitleBrowseRoute() {
	const { q } = Route.useSearch();
	return <TitleBrowsePage q={q} />;
}
