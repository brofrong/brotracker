"use client";

import { useAppShellMobile } from "@astryxdesign/core/AppShell";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { List, ListItem } from "@astryxdesign/core/List";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import {
	SegmentedControl,
	SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useToast } from "@astryxdesign/core/Toast";
import { detectTorrentMediaType } from "@brotracker/rutracker-ts/tracker/media-type";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	buildTitleSearchQuery,
	hasDistinctNames,
	loadSearchBy,
	type SearchBy,
	saveSearchBy,
	searchNameFor,
	splitByMatch,
} from "#/features/title/torrent-search";
import { useLocale } from "#/shared/i18n/locale-provider";
import {
	formatBytes,
	formatEta,
	formatProgress,
	formatSpeed,
} from "#/shared/lib/format";
import { transferStateLabelKey } from "#/shared/lib/transfer-status";
import { trpc } from "#/shared/lib/trpc";
import { TrackerSourceBadge } from "#/shared/ui/tracker-source-badge";

function badgeVariant(
	badge: string,
): "purple" | "blue" | "cyan" | "orange" | "neutral" {
	switch (badge) {
		case "4K":
			return "purple";
		case "1080p":
			return "blue";
		case "720p":
			return "cyan";
		case "HDR":
			return "orange";
		default:
			return "neutral";
	}
}

type TitleTorrentItem = {
	torrentId: string;
	topicUrl: string;
	title: string;
	size: number;
	seeds: number;
	leeches: number;
	qualityScore: number;
	badges: Array<"4K" | "1080p" | "720p" | "SD" | "HDR">;
	source: "local" | "tracker";
	torrentFileUrl: string;
	forumId: string;
	matches: boolean;
	transfer: {
		hash: string;
		progress: number;
		stateKind: string;
		stateLabel: string;
		downloadSpeed: number;
		etaSeconds: number;
	} | null;
};

export function TitleTorrentsList({
	titleId,
	titleName,
	facet,
	seasons,
	originalName,
	year,
}: {
	titleId: string;
	titleName: string;
	facet: "films" | "tv" | null;
	seasons: number | null;
	originalName: string | null;
	year: number | null;
}) {
	const { t } = useTranslation("title");
	const { t: tTransfers } = useTranslation("transfers");
	const { bcp47 } = useLocale();
	const { isMobile } = useAppShellMobile();
	const toast = useToast();
	const queryClient = useQueryClient();
	const isTv = facet === "tv";
	const seasonCount = seasons != null && seasons > 0 ? seasons : null;

	const names = { name: titleName, originalName };
	const showSearchBy = hasDistinctNames(names);

	const formatSeason = (name: string, season: number) =>
		t("torrents.seasonQuery", { name, season });

	const buildQuery = (by: SearchBy, seasonValue: number | null): string =>
		buildTitleSearchQuery({
			name: searchNameFor(by, names),
			year: isTv ? null : year,
			season: seasonValue,
			formatSeason,
		});

	const [searchBy, setSearchBy] = useState<SearchBy>(() =>
		loadSearchBy(localStorage),
	);
	const [season, setSeason] = useState<string | null>(
		isTv && seasonCount != null ? "1" : null,
	);
	const [queryDraft, setQueryDraft] = useState(() =>
		buildQuery(searchBy, isTv && seasonCount != null ? 1 : null),
	);
	const [searchQuery, setSearchQuery] = useState(queryDraft);

	useEffect(() => {
		const trimmed = queryDraft.trim();
		const timer = window.setTimeout(() => {
			setSearchQuery(trimmed);
		}, 400);
		return () => window.clearTimeout(timer);
	}, [queryDraft]);

	const seasonOptions = useMemo(() => {
		if (seasonCount == null) {
			return [];
		}
		return Array.from({ length: seasonCount }, (_, index) => {
			const value = String(index + 1);
			return { value, label: t("torrents.seasonOption", { n: value }) };
		});
	}, [seasonCount, t]);

	const torrentsQuery = useQuery({
		...trpc.title.torrents.queryOptions({
			id: titleId,
			query: searchQuery || undefined,
		}),
		enabled: searchQuery.length > 0,
		refetchOnWindowFocus: false,
		refetchInterval: (query) => {
			const items = query.state.data?.items ?? [];
			return items.some((item) => item.transfer != null) ? 5_000 : false;
		},
	});

	const addMutation = useMutation({
		...trpc.title.add.mutationOptions(),
		onSuccess: async () => {
			toast({ body: t("torrents.added") });
			await queryClient.invalidateQueries({
				queryKey: trpc.title.torrents.pathKey(),
			});
			await queryClient.invalidateQueries({
				queryKey: trpc.title.get.queryKey({ id: titleId }),
			});
		},
		onError: (error) => {
			toast({
				type: "error",
				body: error.message || t("torrents.addFailed"),
			});
		},
	});

	const onSeasonChange = (value: string | null) => {
		setSeason(value);
		const next = buildQuery(searchBy, value != null ? Number(value) : null);
		setQueryDraft(next);
		setSearchQuery(next);
	};

	const onSearchByChange = (value: string) => {
		if (value !== "original" && value !== "locale") {
			return;
		}
		setSearchBy(value);
		saveSearchBy(localStorage, value);
		const next = buildQuery(value, season != null ? Number(season) : null);
		setQueryDraft(next);
		setSearchQuery(next);
	};

	const onAdd = (item: TitleTorrentItem) => {
		const kind = facet ?? detectTorrentMediaType(item.torrentId, item.forumId);
		if (!kind) {
			toast({
				type: "error",
				body: t("torrents.kindDetectFailed"),
			});
			return;
		}
		addMutation.mutate({
			torrentFileUrl: item.torrentFileUrl,
			kind,
			topicUrl: item.topicUrl,
			titleId,
		});
	};

	const controls = (
		<VStack gap={2} width="100%">
			<Heading level={2}>{t("torrents.heading")}</Heading>
			{showSearchBy ? (
				<SegmentedControl
					label={t("torrents.searchBy")}
					layout={isMobile ? "fill" : "hug"}
					onChange={onSearchByChange}
					size="sm"
					value={searchBy}
				>
					<SegmentedControlItem
						label={originalName ?? titleName}
						value="original"
					/>
					<SegmentedControlItem label={titleName} value="locale" />
				</SegmentedControl>
			) : null}
			{isTv && seasonCount != null ? (
				<Selector
					hasClear
					label={t("torrents.seasonLabel")}
					onChange={onSeasonChange}
					options={seasonOptions}
					placeholder={t("torrents.allSeasons")}
					size="sm"
					value={season ?? null}
					width={200}
				/>
			) : null}
			<TextInput
				hasClear
				label={t("torrents.queryLabel")}
				onChange={setQueryDraft}
				placeholder={t("torrents.queryPlaceholder")}
				size="sm"
				value={queryDraft}
				width="100%"
			/>
		</VStack>
	);

	if (!searchQuery) {
		return (
			<VStack gap={3} width="100%">
				{controls}
				<EmptyState
					description={t("torrents.noQueryDescription")}
					title={t("torrents.noQueryTitle")}
				/>
			</VStack>
		);
	}

	if (torrentsQuery.isLoading) {
		return (
			<VStack gap={3} width="100%">
				{controls}
				<Skeleton height={48} width="100%" />
				<Skeleton height={48} width="100%" />
			</VStack>
		);
	}

	if (torrentsQuery.isError) {
		return (
			<VStack gap={3} width="100%">
				{controls}
				<EmptyState
					description={torrentsQuery.error.message}
					title={t("torrents.loadFailed")}
				/>
			</VStack>
		);
	}

	const result = torrentsQuery.data;
	const items = result?.items ?? [];
	const { matched, others } = splitByMatch(items);

	const renderRow = (item: TitleTorrentItem) => {
		const transfer = item.transfer;
		const progressPct = transfer ? Math.round(transfer.progress * 100) : 0;
		const done = transfer != null && transfer.progress >= 0.999;

		return (
			<ListItem
				key={item.torrentId}
				description={
					<VStack gap={2} width="100%">
						<HStack gap={1} wrap="wrap">
							<TrackerSourceBadge torrentId={item.torrentId} />
							{item.badges.map((badge) => (
								<Badge
									key={badge}
									label={badge}
									variant={badgeVariant(badge)}
								/>
							))}
							<Text hasTabularNumbers type="supporting">
								{formatBytes(item.size)}
							</Text>
							<Text hasTabularNumbers type="supporting">
								↑ {item.seeds} · ↓ {item.leeches}
							</Text>
						</HStack>
						{transfer ? (
							<VStack gap={1} width="100%">
								<ProgressBar
									hasValueLabel
									isLabelHidden
									label={t("torrents.progressAria", {
										title: item.title,
									})}
									max={100}
									value={progressPct}
									variant={done ? "success" : "accent"}
									formatValueLabel={() => formatProgress(transfer.progress)}
								/>
								<Text hasTabularNumbers type="supporting">
									{done
										? t("torrents.doneStatus", {
												stateLabel: tTransfers(
													transferStateLabelKey(transfer.stateKind),
												),
											})
										: t("torrents.activeStatus", {
												stateLabel: tTransfers(
													transferStateLabelKey(transfer.stateKind),
												),
												speed: formatSpeed(transfer.downloadSpeed),
												eta: formatEta(transfer.etaSeconds, bcp47),
											})}
								</Text>
							</VStack>
						) : null}
					</VStack>
				}
				endContent={
					<HStack gap={1}>
						{transfer ? null : (
							<Button
								icon={isMobile ? <Icon icon={Download} size="sm" /> : undefined}
								isDisabled={addMutation.isPending}
								isIconOnly={isMobile}
								label={
									isMobile
										? t("torrents.downloadAria", { title: item.title })
										: t("torrents.download")
								}
								onClick={() => onAdd(item)}
								size="sm"
								variant="secondary"
							/>
						)}
						<Button
							href={item.topicUrl}
							icon={<Icon icon="externalLink" size="sm" />}
							isIconOnly={isMobile}
							rel="noopener noreferrer"
							label={t("torrents.onTracker")}
							size="sm"
							target="_blank"
							variant="ghost"
						/>
					</HStack>
				}
				label={
					isMobile ? (
						<Text maxLines={2} type="inherit">
							{item.title}
						</Text>
					) : (
						item.title
					)
				}
			/>
		);
	};

	return (
		<VStack gap={3} width="100%">
			{controls}

			{result?.status === "degraded" ? (
				<Banner
					container="section"
					description={t("torrents.degradedDescription")}
					status="warning"
					title={t("torrents.degradedTitle")}
				/>
			) : null}

			{!result || result.status === "empty" || items.length === 0 ? (
				<EmptyState
					description={t("torrents.emptyDescription")}
					title={t("torrents.emptyTitle")}
				/>
			) : (
				<VStack gap={3} width="100%">
					{matched.length === 0 ? (
						<Text type="supporting">{t("torrents.noExactMatches")}</Text>
					) : (
						<List density="compact" hasDividers>
							{matched.map(renderRow)}
						</List>
					)}
					{others.length > 0 ? (
						<Collapsible
							defaultIsOpen={false}
							trigger={
								<Text type="supporting">
									{t("torrents.otherResults", { count: others.length })}
								</Text>
							}
						>
							<List density="compact" hasDividers>
								{others.map(renderRow)}
							</List>
						</Collapsible>
					) : null}
				</VStack>
			)}
		</VStack>
	);
}
