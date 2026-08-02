"use client";

import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { Section } from "@astryxdesign/core/Section";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Spinner } from "@astryxdesign/core/Spinner";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import z from "zod";
import { formatBytes, formatSpeed } from "#/utils/format";
import { trpc } from "#/utils/trpc";
import { TmdbAttribution } from "#/components/tmdb-attribution";

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

type DiscoverCardData = {
	titleId: string;
	name: string;
	poster: string | null;
	year: number | null;
	kind: "films" | "tv";
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

function DiscoverWidget({ items }: { items: DiscoverCardData[] }) {
	const navigate = useNavigate();

	return (
		<VStack gap={3} width="100%">
			<Heading level={2}>Discover</Heading>
			<Grid columns={{ minWidth: 140, max: 6 }} gap={3} width="100%">
				{items.map((item) => (
					<ClickableCard
						key={item.titleId}
						elevation="low"
						label={item.name}
						padding={0}
						width="100%"
						onClick={() =>
							void navigate({
								to: "/title/$id",
								params: { id: item.titleId },
							})
						}
					>
						<VStack gap={2} width="100%">
							<AspectRatio fit="cover" ratio={2 / 3}>
								{item.poster ? (
									<img alt={item.name} src={item.poster} />
								) : (
									<Skeleton height="100%" width="100%" />
								)}
							</AspectRatio>
							<VStack gap={0} width="100%">
								<Text display="block" type="body" wordBreak="break-word">
									{item.name}
								</Text>
								{item.year != null ? (
									<Text type="supporting">{item.year}</Text>
								) : null}
							</VStack>
						</VStack>
					</ClickableCard>
				))}
			</Grid>
			<TmdbAttribution compact />
		</VStack>
	);
}

function isTransferStats(
	data: TransferStatsData | { items: DiscoverCardData[] },
): data is TransferStatsData {
	return "downloadedBytes" in data;
}

function isDiscoverFeed(
	data: TransferStatsData | { items: DiscoverCardData[] },
): data is { items: DiscoverCardData[] } {
	return "items" in data;
}

function HomePage() {
	const navigate = useNavigate();
	const transferQuery = useQuery({
		...trpc.home.compose.queryOptions({
			widgets: [{ key: "transfer", widget: "transferStats" }],
		}),
		refetchOnWindowFocus: false,
	});
	const discoverQuery = useQuery({
		...trpc.home.compose.queryOptions({
			widgets: [{ key: "discover", widget: "discoverFeed" }],
		}),
		refetchOnWindowFocus: false,
	});

	const transfer = transferQuery.data?.widgets.transfer;
	const discover = discoverQuery.data?.widgets.discover;

	return (
		<Section padding={4} variant="transparent">
			<VStack gap={6} width="100%">
				<Heading level={1}>Главная</Heading>

				{transferQuery.isLoading ? <Spinner label="Загрузка статистики" /> : null}

				{transferQuery.isError ? (
					<EmptyState
						description={transferQuery.error.message}
						title="Не удалось загрузить статистику"
					/>
				) : null}

				{!transferQuery.isLoading &&
				!transferQuery.isError &&
				transfer?.status === "unavailable" ? (
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

				{!transferQuery.isLoading &&
				!transferQuery.isError &&
				transfer?.status === "empty" ? (
					<EmptyState
						description="Статистика появится после первой передачи данных."
						title="Нет данных о передаче"
					/>
				) : null}

				{!transferQuery.isLoading &&
				!transferQuery.isError &&
				transfer?.status === "ok" &&
				isTransferStats(transfer.data) ? (
					<TransferStatsWidget stats={transfer.data} />
				) : null}

				{discoverQuery.isLoading ? <Spinner label="Загрузка Discover" /> : null}

				{!discoverQuery.isLoading &&
				!discoverQuery.isError &&
				discover?.status === "unavailable" ? (
					<Banner
						container="section"
						description="Добавьте TMDB API key в настройках, чтобы видеть подборку. Остальная главная работает как обычно."
						endContent={
							<Button
								label="Открыть настройки"
								onClick={() =>
									void navigate({
										to: "/settings",
										search: { section: "tmdb" },
									})
								}
								variant="secondary"
							/>
						}
						status="warning"
						title="Discover недоступен"
					/>
				) : null}

				{!discoverQuery.isLoading &&
				!discoverQuery.isError &&
				discover?.status === "empty" ? (
					<EmptyState
						description="TMDB не вернул тренды."
						title="Discover пуст"
					/>
				) : null}

				{!discoverQuery.isLoading &&
				!discoverQuery.isError &&
				discover?.status === "ok" &&
				isDiscoverFeed(discover.data) ? (
					<DiscoverWidget items={discover.data.items} />
				) : null}
			</VStack>
		</Section>
	);
}
