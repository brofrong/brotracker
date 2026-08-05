"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Carousel } from "@astryxdesign/core/Carousel";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { List, ListItem } from "@astryxdesign/core/List";
import { Section } from "@astryxdesign/core/Section";
import { Spinner } from "@astryxdesign/core/Spinner";
import { VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
	type TransferStatsData,
	TransferStatsWidget,
} from "#/features/home/transfer-stats-widget";
import { trpc } from "#/shared/lib/trpc";
import { TitleCard, type TitleCardData } from "#/shared/ui/title-card";
import { TmdbAttribution } from "#/shared/ui/tmdb-attribution";

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
		<VStack gap={3} width="100%">
			<Heading level={2}>Обновления сериалов</Heading>
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
	);
}

function DiscoverWidget({ items }: { items: TitleCardData[] }) {
	return (
		<VStack gap={3} width="100%">
			<Heading level={2}>Discover</Heading>
			<Carousel aria-label="Тренды дня" gap={3} hasSnap>
				{items.map((item) => (
					<TitleCard key={item.titleId} item={item} />
				))}
			</Carousel>
			<TmdbAttribution compact />
		</VStack>
	);
}

type ComposeWidgetDataUnion =
	| TransferStatsData
	| { items: TitleCardData[] }
	| { items: TitleWatchFeedItemData[] };

function isTransferStats(
	data: ComposeWidgetDataUnion,
): data is TransferStatsData {
	return "downloadedBytes" in data;
}

function isDiscoverFeed(
	data: ComposeWidgetDataUnion,
): data is { items: TitleCardData[] } {
	return (
		"items" in data && (data.items.length === 0 || "poster" in data.items[0])
	);
}

function isTitleWatchFeed(
	data: ComposeWidgetDataUnion,
): data is { items: TitleWatchFeedItemData[] } {
	return (
		"items" in data && (data.items.length === 0 || "kind" in data.items[0])
	);
}

export function HomePage() {
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
