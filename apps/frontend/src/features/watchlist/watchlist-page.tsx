"use client";

import { useAppShellMobile } from "@astryxdesign/core/AppShell";
import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { Badge } from "@astryxdesign/core/Badge";
import { Center } from "@astryxdesign/core/Center";
import type { DropdownMenuOption } from "@astryxdesign/core/DropdownMenu";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { List, ListItem } from "@astryxdesign/core/List";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Section } from "@astryxdesign/core/Section";
import { Spinner } from "@astryxdesign/core/Spinner";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Text } from "@astryxdesign/core/Text";
import { useToast } from "@astryxdesign/core/Toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
	ExternalLink,
	ImageOff,
	Pause,
	Play,
	RefreshCw,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocale } from "#/shared/i18n/locale-provider";
import { formatEta, formatProgress, formatSpeed } from "#/shared/lib/format";
import { trpc } from "#/shared/lib/trpc";
import {
	formatRelativeTime,
	groupByStage,
	hasActiveDownload,
	STAGE_ORDER,
	stageOf,
	type WatchlistItem,
	type WatchlistStage,
	waitingStatus,
	waitingStatusDisplay,
} from "./watchlist-view";

type StageFilter = "all" | WatchlistStage;

const POLL_MS = 5_000;
/** Poster thumbnail width in a row (2:3, like the title page poster). */
const POSTER_WIDTH = 40;

function isStageFilter(value: string): value is StageFilter {
	return value === "all" || (STAGE_ORDER as readonly string[]).includes(value);
}

function useWatchlistActions() {
	const { t } = useTranslation("watchlist");
	const toast = useToast();
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const refresh = () =>
		Promise.all([
			queryClient.invalidateQueries({
				queryKey: trpc.title.watchlist.queryKey(),
			}),
			queryClient.invalidateQueries({ queryKey: trpc.title.get.pathKey() }),
		]);
	const onError = (error: { message: string }) => {
		toast({ type: "error", body: error.message });
	};

	const check = useMutation({
		...trpc.title.watchlistCheck.mutationOptions(),
		onSuccess: refresh,
		onError,
	});
	const remove = useMutation({
		...trpc.title.watchlistRemove.mutationOptions(),
		onSuccess: refresh,
		onError,
	});
	const setWatch = useMutation({
		...trpc.title.setWatch.mutationOptions(),
		onSuccess: refresh,
		onError,
	});

	return (item: WatchlistItem): DropdownMenuOption[] => {
		const options: DropdownMenuOption[] = [];
		const canCheck =
			item.watch === "waiting" ||
			item.watch === "tracking" ||
			item.watch === "paused";
		if (canCheck) {
			options.push({
				label: t("menu.checkNow"),
				icon: RefreshCw,
				isDisabled: check.isPending,
				onClick: () => check.mutate({ id: item.id }),
			});
		}
		options.push({
			label: t("menu.open"),
			icon: ExternalLink,
			onClick: () =>
				void navigate({ to: "/title/$id", params: { id: item.titleId } }),
		});
		if (item.watch === "tracking" || item.watch === "paused") {
			const next = item.watch === "tracking" ? "paused" : "tracking";
			options.push({
				label: item.watch === "tracking" ? t("menu.pause") : t("menu.resume"),
				icon: item.watch === "tracking" ? Pause : Play,
				isDisabled: setWatch.isPending,
				onClick: () =>
					setWatch.mutate({
						id: item.titleId,
						watch: next,
						topicUrl: item.topicUrl ?? undefined,
					}),
			});
		}
		options.push({ type: "divider" });
		options.push({
			label: t("menu.remove"),
			icon: Trash2,
			isDisabled: remove.isPending,
			onClick: () => remove.mutate({ id: item.id }),
		});
		return options;
	};
}

function metaLine(
	item: WatchlistItem,
	t: (key: string, options?: Record<string, unknown>) => string,
): string {
	const parts: string[] = [];
	if (item.kind) {
		parts.push(t(`kind.${item.kind}`));
	}
	if (item.year != null) {
		parts.push(String(item.year));
	}
	if (item.kind === "tv" && item.season != null) {
		parts.push(t("season", { season: item.season }));
	}
	return parts.join(" · ");
}

function DownloadingStatus({ item }: { item: WatchlistItem }) {
	const { t } = useTranslation("watchlist");
	const { bcp47 } = useLocale();
	const transfer = item.transfer;
	if (!transfer) {
		return <ChangedAt item={item} />;
	}
	return (
		<VStack gap={1} width="100%">
			<ProgressBar
				formatValueLabel={() => formatProgress(transfer.progress)}
				hasValueLabel
				isLabelHidden
				label={t("progressAria", { name: item.name ?? t("untitled") })}
				max={100}
				value={Math.round(transfer.progress * 100)}
			/>
			<Text hasTabularNumbers type="supporting">
				{[
					formatSpeed(transfer.downloadSpeed),
					formatEta(transfer.etaSeconds, bcp47),
				].join(" · ")}
			</Text>
		</VStack>
	);
}

function WaitingStatusLine({ item }: { item: WatchlistItem }) {
	const { t } = useTranslation("watchlist");
	const { bcp47 } = useLocale();
	const { text, variant } = waitingStatusDisplay(waitingStatus(item), t);

	const checked = item.lastCheckedAt
		? t("checkedAt", {
				time: formatRelativeTime(item.lastCheckedAt, new Date(), bcp47),
			})
		: null;

	return (
		<HStack gap={1} vAlign="center" wrap="wrap">
			<StatusDot label={text} variant={variant} />
			<Text type="supporting">{checked ? `${text} · ${checked}` : text}</Text>
		</HStack>
	);
}

function ChangedAt({ item }: { item: WatchlistItem }) {
	const { t } = useTranslation("watchlist");
	const { bcp47 } = useLocale();
	if (!item.lastChangedAt) {
		return null;
	}
	return (
		<Text type="supporting">
			{t("changedAt", {
				time: formatRelativeTime(item.lastChangedAt, new Date(), bcp47),
			})}
		</Text>
	);
}

function TrackingStatus({ item }: { item: WatchlistItem }) {
	const { t } = useTranslation("watchlist");
	const { bcp47 } = useLocale();
	const parts: string[] = [];
	if (item.episodes) {
		parts.push(t("episodes", item.episodes));
	}
	if (item.lastChangedAt) {
		parts.push(
			t("changedAt", {
				time: formatRelativeTime(item.lastChangedAt, new Date(), bcp47),
			}),
		);
	}
	const isPaused = item.watch === "paused";
	if (parts.length === 0 && !isPaused) {
		return null;
	}
	return (
		<HStack gap={1} vAlign="center" wrap="wrap">
			{isPaused ? (
				<StatusDot label={t("menu.pause")} variant="neutral" />
			) : null}
			<Text hasTabularNumbers type="supporting">
				{(isPaused ? [t("menu.pause"), ...parts] : parts).join(" · ")}
			</Text>
		</HStack>
	);
}

function StatusLine({
	item,
	stage,
}: {
	item: WatchlistItem;
	stage: WatchlistStage;
}) {
	switch (stage) {
		case "downloading":
			return <DownloadingStatus item={item} />;
		case "waiting":
			return <WaitingStatusLine item={item} />;
		case "tracking":
			return <TrackingStatus item={item} />;
		default:
			return <ChangedAt item={item} />;
	}
}

function Poster({ name, src }: { name: string; src: string | null }) {
	return (
		<VStack className="shrink-0" width={POSTER_WIDTH}>
			<AspectRatio
				className="overflow-hidden rounded-md bg-muted"
				fit="cover"
				ratio={2 / 3}
			>
				{src ? (
					<img alt={name} src={src} />
				) : (
					<Center height="100%" width="100%">
						<Icon color="secondary" icon={ImageOff} size="sm" />
					</Center>
				)}
			</AspectRatio>
		</VStack>
	);
}

function WatchlistRow({
	item,
	menuItems,
	isMobile,
}: {
	item: WatchlistItem;
	menuItems: DropdownMenuOption[];
	isMobile: boolean;
}) {
	const { t } = useTranslation("watchlist");
	const name = item.name ?? t("untitled");
	const meta = metaLine(item, t);

	return (
		<ListItem
			description={
				<VStack gap={1} width="100%">
					{meta ? <Text type="supporting">{meta}</Text> : null}
					<StatusLine item={item} stage={stageOf(item)} />
				</VStack>
			}
			endContent={
				<MoreMenu items={menuItems} label={t("menu.label")} size="sm" />
			}
			label={
				isMobile ? (
					<Text maxLines={2} type="inherit">
						{name}
					</Text>
				) : (
					name
				)
			}
			startContent={<Poster name={name} src={item.poster} />}
		/>
	);
}

export function WatchlistPage() {
	const { t } = useTranslation("watchlist");
	const { isMobile } = useAppShellMobile();
	const [filter, setFilter] = useState<StageFilter>("all");
	const menuFor = useWatchlistActions();

	const query = useQuery({
		...trpc.title.watchlist.queryOptions(),
		refetchInterval: (current) =>
			hasActiveDownload(current.state.data ?? []) ? POLL_MS : false,
	});

	const items = query.data ?? [];
	const groups = groupByStage(items);
	const visibleStages = STAGE_ORDER.filter(
		(stage) =>
			(filter === "all" || filter === stage) && groups[stage].length > 0,
	);

	return (
		<Section padding={4} variant="transparent">
			<VStack gap={4} width="100%">
				<Heading level={1}>{t("heading")}</Heading>

				{query.isLoading ? <Spinner label={t("loading")} /> : null}

				{query.isError ? (
					<EmptyState
						description={query.error.message}
						title={t("loadFailed")}
					/>
				) : null}

				{query.isSuccess && items.length === 0 ? (
					<EmptyState title={t("empty")} />
				) : null}

				{items.length > 0 ? (
					<>
						<HStack isScrollable width="100%">
							<TabList
								aria-label={t("filter.label")}
								onChange={(value) => {
									if (isStageFilter(value)) {
										setFilter(value);
									}
								}}
								size={isMobile ? "sm" : "md"}
								value={filter}
							>
								<Tab
									endContent={
										<Badge label={String(items.length)} variant="neutral" />
									}
									label={t("filter.all")}
									value="all"
								/>
								{STAGE_ORDER.map((stage) => (
									<Tab
										endContent={
											<Badge
												label={String(groups[stage].length)}
												variant="neutral"
											/>
										}
										key={stage}
										label={t(`stage.${stage}`)}
										value={stage}
									/>
								))}
							</TabList>
						</HStack>

						{visibleStages.length === 0 ? (
							<EmptyState title={t("emptyFilter")} />
						) : (
							<VStack gap={4} width="100%">
								{visibleStages.map((stage) => (
									<List
										density="compact"
										hasDividers
										header={<Heading level={2}>{t(`stage.${stage}`)}</Heading>}
										key={stage}
									>
										{groups[stage].map((item) => (
											<WatchlistRow
												isMobile={isMobile}
												item={item}
												key={item.id}
												menuItems={menuFor(item)}
											/>
										))}
									</List>
								))}
							</VStack>
						)}
					</>
				) : null}
			</VStack>
		</Section>
	);
}
