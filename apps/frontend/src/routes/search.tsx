"use client";

import { createFileRoute } from "@tanstack/react-router";
import z from "zod";
import { SearchPage } from "#/features/search/search-page";

const searchSchema = z.object({
	search: z.string().optional(),
});

export const Route = createFileRoute("/search")({
	component: SearchRoute,
	validateSearch: searchSchema,
});

function SearchRoute() {
	const { search } = Route.useSearch();
	return <SearchPage search={search} />;
}
