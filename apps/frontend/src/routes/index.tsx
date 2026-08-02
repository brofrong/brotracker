"use client";

import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { List, ListItem } from "@astryxdesign/core/List";
import { Section } from "@astryxdesign/core/Section";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Spinner } from "@astryxdesign/core/Spinner";
import { VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import z from "zod";
import {
	type TransferStatsData,
	TransferStatsWidget,
} from "#/components/home/transfer-stats-widget";
import { TmdbAttribution } from "#/components/tmdb-attribution";
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

type DiscoverCardData = {
	titleId: string;
	name: string;
	poster: string | null;
	year: number | null;
	kind: "films" | "tv";
};

type TitleWatchEventKind =
	| "torrent-updated"
	| "progress-changed"
	| "completed"
	| "check-failed";

type TitleWatchFeedItemData = {
	id: string;
	titleId: string;
	kind: TitleWatchEventKind;
	message: string | null;
	createdAt: string;
};

const TITLE_WATCH_EVENT_LABELS: Record<TitleWatchEventKind, string> = {
	"torrent-updated": "Раздача обновилась",
	"progress-changed": "Прогресс обновился",
	completed: "Все серии скачаны",
	"check-failed": "Ошибка проверки",
};

function titleWatchEventVariant(
	kind: TitleWatchEventKind,
): "success" | "error" | "accent" {
	if (kind === "check-failed") return "error";
	if (kind === "progress-changed") return "accent";
	return "success";
}

function formatEventTimestamp(createdAt: string): string {
	return new Date(createdAt).toLocaleString("ru-RU", {
		day: "2-digit",
		month: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function TitleWatchFeedWidget({ items }: { items: TitleWatchFeedItemData[] }) {
	const navigate = useNavigate();

	return (
		<Card elevation="low" padding={0} width="100%">
			<VStack gap={0} width="100%">
				<VStack gap={0} paddingBlock={5} paddingInline={5}>
					<Heading level={2}>Обновления сериалов</Heading>
				</VStack>
				<List hasDividers>
					{items.map((item) => (
						<ListItem
							key={item.id}
							description={item.message ?? formatEventTimestamp(item.createdAt)}
							endContent={
								item.message ? (
									<Text type="supporting">
										{formatEventTimestamp(item.createdAt)}
									</Text>
								) : null
							}
							label={TITLE_WATCH_EVENT_LABELS[item.kind]}
							onClick={() =>
								void navigate({
									to: "/title/$id",
									params: { id: item.titleId },
								})
							}
							startContent={
								<StatusDot
									label={TITLE_WATCH_EVENT_LABELS[item.kind]}
									variant={titleWatchEventVariant(item.kind)}
								/>
							}
						/>
					))}
				</List>
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

type ComposeWidgetDataUnion =
	| TransferStatsData
	| { items: DiscoverCardData[] }
	| { items: TitleWatchFeedItemData[] };

function isTransferStats(
	data: ComposeWidgetDataUnion,
): data is TransferStatsData {
	return "downloadedBytes" in data;
}

function isDiscoverFeed(
	data: ComposeWidgetDataUnion,
): data is { items: DiscoverCardData[] } {
	return (
		"items" in data && (data.items.length === 0 || "poster" in data.items[0])
	);
}

function isTitleWatchFeed(
	data: ComposeWidgetDataUnion,
): data is { items: TitleWatchFeedItemData[] } {
	return (
		"items" in data &&
		(data.items.length === 0 || "kind" in data.items[0])
	);
}

function HomePage() {
	const navigate = useNavigate();
	const transferQuery = useQuery({
		...trpc.home.compose.queryOptions({
			widgets: [{ key: "transfer", widget: "transferStats" }],
		}),
		refetchOnWindowFocus: false,
		refetchInterval: 5000,
	});
	const discoverQuery = useQuery({
		...trpc.home.compose.queryOptions({
			widgets: [{ key: "discover", widget: "discoverFeed" }],
		}),
		refetchOnWindowFocus: false,
	});
	const feedQuery = useQuery({
		...trpc.home.compose.queryOptions({
			widgets: [{ key: "feed", widget: "titleWatchFeed" }],
		}),
		refetchOnWindowFocus: false,
	});

	const transfer = transferQuery.data?.widgets.transfer;
	const discover = discoverQuery.data?.widgets.discover;
	const feed = feedQuery.data?.widgets.feed;

	return (
		<Section padding={4} variant="transparent">
			<VStack gap={6} width="100%">
				<Heading level={1}>Главная</Heading>

				{transferQuery.isLoading ? (
					<Spinner label="Загрузка статистики" />
				) : null}

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
					<TransferStatsWidget
						stats={transfer.data}
						updatedAt={transferQuery.dataUpdatedAt}
					/>
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

				{feedQuery.isLoading ? (
					<Spinner label="Загрузка ленты обновлений" />
				) : null}

				{!feedQuery.isLoading && feedQuery.isError ? (
					<EmptyState
						description={feedQuery.error.message}
						title="Не удалось загрузить ленту обновлений"
					/>
				) : null}

				{!feedQuery.isLoading &&
				!feedQuery.isError &&
				feed?.status === "empty" ? (
					<EmptyState
						description="Добавьте сериал в слежение на странице тайтла, чтобы видеть здесь обновления раздач."
						title="Пока нет обновлений"
					/>
				) : null}

				{!feedQuery.isLoading &&
				!feedQuery.isError &&
				feed?.status === "ok" &&
				isTitleWatchFeed(feed.data) ? (
					<TitleWatchFeedWidget items={feed.data.items} />
				) : null}
			</VStack>
		</Section>
	);
}
