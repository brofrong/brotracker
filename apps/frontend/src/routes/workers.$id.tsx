"use client";

import { createFileRoute } from "@tanstack/react-router";
import { WorkerDetailPage } from "#/features/workers/worker-detail-page";

export const Route = createFileRoute("/workers/$id")({
	component: WorkerDetailRoute,
});

function WorkerDetailRoute() {
	const { id } = Route.useParams();
	return <WorkerDetailPage id={id} />;
}
