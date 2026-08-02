"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Section } from "@astryxdesign/core/Section";
import { Spinner } from "@astryxdesign/core/Spinner";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import z from "zod";
import { formatBytes, formatSpeed } from "#/utils/format";
import { trpc } from "#/utils/trpc";

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
					source: search.source,
				},
			});
		}
	},
});

type TransferStatsData = {
	downloadedBytes: number;
	uploadedBytes: number;
	downloadSpeed?: number;
	uploadSpeed?: number;
	freeSpaceBytes?: number;
	ratio?: number;
};

function TransferStatsWidget({ stats }: { stats: TransferStatsData }) {
	return (
		<Card elevation="low" padding={5} width="100%">
			<VStack gap={4} width="100%">
				<Heading level={2}>Статистика передачи</Heading>
				<HStack gap={6} wrap="wrap">
					<VStack gap={1}>
						<Text type="supporting">↓ Скачано</Text>
						<Text hasTabularNumbers size="lg" type="body">
							{formatBytes(stats.downloadedBytes)}
						</Text>
						{stats.downloadSpeed != null ? (
							<Text hasTabularNumbers type="supporting">
								{formatSpeed(stats.downloadSpeed)}
							</Text>
						) : null}
					</VStack>
					<VStack gap={1}>
						<Text type="supporting">↑ Отдано</Text>
						<Text hasTabularNumbers size="lg" type="body">
							{formatBytes(stats.uploadedBytes)}
						</Text>
						{stats.uploadSpeed != null ? (
							<Text hasTabularNumbers type="supporting">
								{formatSpeed(stats.uploadSpeed)}
							</Text>
						) : null}
					</VStack>
					{stats.ratio != null ? (
						<VStack gap={1}>
							<Text type="supporting">Ratio</Text>
							<Text hasTabularNumbers size="lg" type="body">
								{stats.ratio.toFixed(2)}
							</Text>
						</VStack>
					) : null}
					{stats.freeSpaceBytes != null ? (
						<VStack gap={1}>
							<Text type="supporting">Свободно на диске</Text>
							<Text hasTabularNumbers size="lg" type="body">
								{formatBytes(stats.freeSpaceBytes)}
							</Text>
						</VStack>
					) : null}
				</HStack>
			</VStack>
		</Card>
	);
}

function HomePage() {
	const navigate = useNavigate();
	const { data, isLoading, isError, error } = useQuery({
		...trpc.home.compose.queryOptions({
			widgets: [{ key: "transfer", widget: "transferStats" }],
		}),
		refetchOnWindowFocus: false,
	});

	const transfer = data?.widgets.transfer;

	return (
		<Section padding={4} variant="transparent">
			<VStack gap={4} width="100%">
				<Heading level={1}>Главная</Heading>

				{isLoading ? <Spinner label="Загрузка" /> : null}

				{isError ? (
					<EmptyState
						description={error.message}
						title="Не удалось загрузить главную"
					/>
				) : null}

				{!isLoading && !isError && transfer?.status === "unavailable" ? (
					<Banner
						container="section"
						description="Укажите URL и API key qBittorrent в настройках, чтобы видеть статистику."
						endContent={
							<Button
								label="Открыть настройки"
								onClick={() =>
									void navigate({
										to: "/settings",
										search: { section: "qbittorrent" },
									})
								}
								variant="secondary"
							/>
						}
						status="warning"
						title="qBittorrent недоступен"
					/>
				) : null}

				{!isLoading && !isError && transfer?.status === "empty" ? (
					<EmptyState
						description="Статистика появится после первой передачи данных."
						title="Нет данных о передаче"
					/>
				) : null}

				{!isLoading && !isError && transfer?.status === "ok" ? (
					<TransferStatsWidget stats={transfer.data} />
				) : null}
			</VStack>
		</Section>
	);
}
