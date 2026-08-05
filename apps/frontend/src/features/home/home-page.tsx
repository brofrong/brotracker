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
import { useTranslation } from "react-i18next";
import {
	type TransferStatsData,
	TransferStatsWidget,
} from "#/features/home/transfer-stats-widget";
import { useLocale } from "#/shared/i18n/locale-provider";
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

const TITLE_WATCH_EVENT_KEYS: Record<TitleWatchEventKind, string> = {
	"torrent-updated": "titleWatchFeed.events.torrentUpdated",
	"progress-changed": "titleWatchFeed.events.progressChanged",
	completed: "titleWatchFeed.events.completed",
	"check-failed": "titleWatchFeed.events.checkFailed",
};

function titleWatchEventVariant(
	kind: TitleWatchEventKind,
): "success" | "error" | "accent" {
	if (kind === "check-failed") return "error";
	if (kind === "progress-changed") return "accent";
	return "success";
}

function formatEventTimestamp(createdAt: string, bcp47: string): string {
	return new Date(createdAt).toLocaleString(bcp47, {
		day: "2-digit",
		month: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function TitleWatchFeedWidget({ items }: { items: TitleWatchFeedItemData[] }) {
	const navigate = useNavigate();
	const { t } = useTranslation("home");
	const { bcp47 } = useLocale();

	return (
		<VStack gap={3} width="100%">
			<Heading level={2}>{t("titleWatchFeed.heading")}</Heading>
			<List hasDividers>
				{items.map((item) => {
					const label = t(TITLE_WATCH_EVENT_KEYS[item.kind]);
					return (
						<ListItem
							key={item.id}
							description={
								item.message ?? formatEventTimestamp(item.createdAt, bcp47)
							}
							endContent={
								item.message ? (
									<Text type="supporting">
										{formatEventTimestamp(item.createdAt, bcp47)}
									</Text>
								) : null
							}
							label={label}
							onClick={() =>
								void navigate({
									to: "/title/$id",
									params: { id: item.titleId },
								})
							}
							startContent={
								<StatusDot
									label={label}
									variant={titleWatchEventVariant(item.kind)}
								/>
							}
						/>
					);
				})}
			</List>
		</VStack>
	);
}

function DiscoverWidget({ items }: { items: TitleCardData[] }) {
	const { t } = useTranslation("home");

	return (
		<VStack gap={3} width="100%">
			<Heading level={2}>{t("discover.heading")}</Heading>
			<Carousel aria-label={t("discover.carouselAria")} gap={3} hasSnap>
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
	const { t } = useTranslation("home");
	const { t: tCommon } = useTranslation("common");
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
				<Heading level={1}>{t("title")}</Heading>

				{transferQuery.isLoading ? (
					<Spinner label={t("transferStats.loading")} />
				) : null}

				{transferQuery.isError ? (
					<EmptyState
						description={transferQuery.error.message}
						title={t("transferStats.loadFailed")}
					/>
				) : null}

				{!transferQuery.isLoading &&
				!transferQuery.isError &&
				transfer?.status === "unavailable" ? (
					<Banner
						container="section"
						description={t("transferStats.qbUnavailableDescription")}
						endContent={
							<Button
								label={tCommon("openSettings")}
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
						title={t("transferStats.qbUnavailableTitle")}
					/>
				) : null}

				{!transferQuery.isLoading &&
				!transferQuery.isError &&
				transfer?.status === "empty" ? (
					<EmptyState
						description={t("transferStats.emptyDescription")}
						title={t("transferStats.emptyTitle")}
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

				{discoverQuery.isLoading ? (
					<Spinner label={t("discover.loading")} />
				) : null}

				{!discoverQuery.isLoading &&
				!discoverQuery.isError &&
				discover?.status === "unavailable" ? (
					<Banner
						container="section"
						description={t("discover.unavailableDescription")}
						endContent={
							<Button
								label={tCommon("openSettings")}
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
						title={t("discover.unavailableTitle")}
					/>
				) : null}

				{!discoverQuery.isLoading &&
				!discoverQuery.isError &&
				discover?.status === "empty" ? (
					<EmptyState
						description={t("discover.emptyDescription")}
						title={t("discover.emptyTitle")}
					/>
				) : null}

				{!discoverQuery.isLoading &&
				!discoverQuery.isError &&
				discover?.status === "ok" &&
				isDiscoverFeed(discover.data) ? (
					<DiscoverWidget items={discover.data.items} />
				) : null}

				{feedQuery.isLoading ? (
					<Spinner label={t("titleWatchFeed.loading")} />
				) : null}

				{!feedQuery.isLoading && feedQuery.isError ? (
					<EmptyState
						description={feedQuery.error.message}
						title={t("titleWatchFeed.loadFailed")}
					/>
				) : null}

				{!feedQuery.isLoading &&
				!feedQuery.isError &&
				feed?.status === "empty" ? (
					<EmptyState
						description={t("titleWatchFeed.emptyDescription")}
						title={t("titleWatchFeed.emptyTitle")}
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
