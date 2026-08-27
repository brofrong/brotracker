"use client";

import { createFileRoute } from "@tanstack/react-router";
import { PersonPage } from "#/features/person/person-page";

export const Route = createFileRoute("/person/$id")({
	component: PersonRoute,
});

function PersonRoute() {
	const { id } = Route.useParams();
	return <PersonPage id={id} />;
}
