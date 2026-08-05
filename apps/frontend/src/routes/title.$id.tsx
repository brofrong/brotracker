"use client";

import { createFileRoute } from "@tanstack/react-router";
import { TitlePage } from "#/features/title/title-page";

export const Route = createFileRoute("/title/$id")({
	component: TitleRoute,
});

function TitleRoute() {
	const { id } = Route.useParams();
	return <TitlePage id={id} />;
}
