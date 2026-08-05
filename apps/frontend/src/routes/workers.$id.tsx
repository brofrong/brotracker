"use client";

import { Heading } from "@astryxdesign/core/Heading";
import { Section } from "@astryxdesign/core/Section";
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/workers/$id")({
	component: WorkerDetailStubRoute,
});

function WorkerDetailStubRoute() {
	const { id } = Route.useParams();

	return (
		<Section padding={4} variant="transparent">
			<VStack gap={2} width="100%">
				<Heading level={1}>Воркер</Heading>
				<Text type="supporting">Worker detail coming · {id}</Text>
			</VStack>
		</Section>
	);
}
