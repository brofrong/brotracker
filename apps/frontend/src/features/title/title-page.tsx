"use client";

import { Avatar } from "@astryxdesign/core/Avatar";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Carousel } from "@astryxdesign/core/Carousel";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { Lightbox } from "@astryxdesign/core/Lightbox";
import { List, ListItem } from "@astryxdesign/core/List";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Section } from "@astryxdesign/core/Section";
import { Selector } from "@astryxdesign/core/Selector";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useToast } from "@astryxdesign/core/Toast";
import { MediaTheme } from "@astryxdesign/core/theme";
import { detectTorrentMediaType } from "@brotracker/rutracker-ts/tracker/media-type";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { TitleHero } from "#/features/title/title-hero";
import { useLocale } from "#/shared/i18n/locale-provider";
import {
	formatBytes,
	formatEta,
	formatProgress,
	formatSpeed,
} from "#/shared/lib/format";
import { transferStateLabelKey } from "#/shared/lib/transfer-status";
import { trpc } from "#/shared/lib/trpc";
import { TitleCard } from "#/shared/ui/title-card";
import { TmdbAttribution } from "#/shared/ui/tmdb-attribution";
import { TrackerSourceBadge } from "#/shared/ui/tracker-source-badge";

function groupCrewByJob(
	crew: Array<{ name: string; job: string }>,
	translateJob: (job: string) => string,
): Array<{ job: string; names: string[] }> {
	const groups = new Map<string, string[]>();
	for (const member of crew) {
		const job = translateJob(member.job);
		const names = groups.get(job) ?? [];
		names.push(member.name);
		groups.set(job, names);
	}
	return [...groups.entries()].map(([job, names]) => ({ job, names }));
}

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
	transfer: {
		hash: string;
		progress: number;
		stateKind: string;
		stateLabel: string;
		downloadSpeed: number;
		etaSeconds: number;
	} | null;
};

function TitleTorrentsList({
	titleId,
	titleName,
	facet,
	seasons,
}: {
	titleId: string;
	titleName: string;
	facet: "films" | "tv" | null;
	seasons: number | null;
}) {
	const { t } = useTranslation("title");
	const { t: tTransfers } = useTranslation("transfers");
	const { bcp47 } = useLocale();
	const toast = useToast();
	const queryClient = useQueryClient();
	const isTv = facet === "tv";
	const seasonCount = seasons != null && seasons > 0 ? seasons : null;

	const buildTorrentsQuery = (name: string, season: number | null): string => {
		const trimmed = name.trim();
		if (!trimmed) {
			return "";
		}
		if (season == null) {
			return trimmed;
		}
		return t("torrents.seasonQuery", { name: trimmed, season });
	};

	const [season, setSeason] = useState<string | null>(
		isTv && seasonCount != null ? "1" : null,
	);
	const [queryDraft, setQueryDraft] = useState(() =>
		buildTorrentsQuery(titleName, isTv && seasonCount != null ? 1 : null),
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
		const next = buildTorrentsQuery(
			titleName,
			value != null ? Number(value) : null,
		);
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
				<List density="compact" hasDividers>
					{items.map((item) => {
						const transfer = item.transfer;
						const progressPct = transfer
							? Math.round(transfer.progress * 100)
							: 0;
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
													formatValueLabel={() =>
														formatProgress(transfer.progress)
													}
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
												label={t("torrents.download")}
												size="sm"
												variant="secondary"
												isDisabled={addMutation.isPending}
												onClick={() => onAdd(item)}
											/>
										)}
										<Button
											href={item.topicUrl}
											icon={<Icon icon="externalLink" size="sm" />}
											rel="noopener noreferrer"
											label={t("torrents.onTracker")}
											size="sm"
											target="_blank"
											variant="ghost"
										/>
									</HStack>
								}
								label={item.title}
							/>
						);
					})}
				</List>
			)}
		</VStack>
	);
}

type CastMember = {
	id: number;
	name: string;
	character: string | null;
	profileUrl: string | null;
};

function CastMemberCard({ member }: { member: CastMember }) {
	const navigate = useNavigate();
	const { t } = useTranslation("title");

	const content = (
		<VStack gap={2} hAlign="center" width={128}>
			<Avatar
				name={member.name}
				size={96}
				src={member.profileUrl ?? undefined}
				tooltip={false}
			/>
			<VStack gap={0.5} hAlign="center" width="100%">
				<Text display="block" justify="center" maxLines={2} weight="medium">
					{member.name}
				</Text>
				{member.character ? (
					<Text display="block" justify="center" maxLines={2} type="supporting">
						{member.character}
					</Text>
				) : null}
			</VStack>
		</VStack>
	);

	if (!member.id) {
		return content;
	}

	return (
		<VStack
			aria-label={t("detail.openPersonAria", { name: member.name })}
			as="button"
			className="cursor-pointer rounded-lg transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-accent"
			gap={2}
			hAlign="center"
			onClick={() =>
				void navigate({
					to: "/person/$id",
					params: { id: String(member.id) },
				})
			}
			width={128}
		>
			{content}
		</VStack>
	);
}

export function TitlePage({ id }: { id: string }) {
	const { t } = useTranslation("title");
	const [isPosterOpen, setIsPosterOpen] = useState(false);
	const { data, isLoading, isError, error } = useQuery({
		...trpc.title.get.queryOptions({ id }),
		refetchOnWindowFocus: false,
	});

	if (isLoading) {
		return (
			<Section padding={4} variant="transparent">
				<VStack gap={5} width="100%">
					<HStack gap={6} wrap="wrap">
						<Skeleton height={312} width={208} />
						<VStack gap={2} width="100%">
							<Skeleton height={32} width={280} />
							<Skeleton height={20} width={240} />
							<Skeleton height={16} width={180} />
							<Skeleton height={80} width="100%" />
							<Skeleton height={24} width={200} />
						</VStack>
					</HStack>
					<HStack gap={3}>
						<Skeleton height={96} width={96} />
						<Skeleton height={96} width={96} />
						<Skeleton height={96} width={96} />
						<Skeleton height={96} width={96} />
						<Skeleton height={96} width={96} />
					</HStack>
				</VStack>
			</Section>
		);
	}

	if (isError) {
		return (
			<Section padding={4} variant="transparent">
				<EmptyState
					description={error.message}
					title={t("detail.loadFailed")}
				/>
			</Section>
		);
	}

	if (!data) {
		return null;
	}

	const { meta, metaStatus, facet, ratings, watch } = data;
	const titleName = meta.name ?? t("detail.untitled");
	const crewGroups = groupCrewByJob(meta.crew, (job) =>
		t(`detail.crewJobs.${job}`, { defaultValue: job }),
	);
	const hasRatings = ratings.some((rating) => rating.status === "ok");

	const page = (
		<Section className="relative z-10" padding={4} variant="transparent">
			<VStack gap={4} width="100%">
				{metaStatus === "degraded" ? (
					<Banner
						container="section"
						description={t("detail.metaDegradedDescription")}
						status="warning"
						title={t("detail.metaDegradedTitle")}
					/>
				) : null}

				{metaStatus === "empty" ? (
					<Banner
						container="section"
						description={t("detail.metaEmptyDescription")}
						status="info"
						title={t("detail.metaEmptyTitle")}
					/>
				) : null}

				<TitleHero
					crewGroups={crewGroups}
					facet={facet}
					hasRatings={hasRatings}
					meta={meta}
					onOpenPoster={() => setIsPosterOpen(true)}
					ratings={ratings}
					titleId={id}
					titleName={titleName}
					watch={watch}
				/>

				{meta.poster ? (
					<Lightbox
						hasZoom
						isOpen={isPosterOpen}
						media={{ alt: titleName, src: meta.poster }}
						onOpenChange={setIsPosterOpen}
					/>
				) : null}

				{meta.cast.length > 0 ? (
					<VStack gap={2} width="100%">
						<Heading level={2}>{t("detail.castHeading")}</Heading>
						<Carousel aria-label={t("detail.castCarouselAria")} gap={3} hasSnap>
							{meta.cast.map((member) => (
								<CastMemberCard
									key={`${member.name}-${member.character ?? ""}`}
									member={member}
								/>
							))}
						</Carousel>
					</VStack>
				) : null}

				<TitleTorrentsList
					key={id}
					facet={facet}
					seasons={meta.seasons}
					titleId={id}
					titleName={titleName}
				/>

				{meta.similar.length > 0 ? (
					<VStack gap={3} width="100%">
						<Heading level={2}>{t("detail.similarHeading")}</Heading>
						<Carousel
							aria-label={t("detail.similarCarouselAria")}
							gap={3}
							hasSnap
						>
							{meta.similar.map((item) => (
								<TitleCard key={item.titleId} item={item} />
							))}
						</Carousel>
					</VStack>
				) : null}

				{metaStatus === "ok" || metaStatus === "degraded" ? (
					<TmdbAttribution compact />
				) : null}
			</VStack>
		</Section>
	);

	if (!meta.backdrop) {
		return page;
	}

	return (
		<>
			<img
				alt=""
				aria-hidden
				className="pointer-events-none fixed inset-0 z-0 size-full object-cover object-top brightness-50"
				src={meta.backdrop}
			/>
			<VStack
				aria-hidden
				className="pointer-events-none fixed inset-0 z-0 bg-overlay opacity-100"
			/>
			<svg
				aria-hidden="true"
				className="pointer-events-none fixed inset-0 z-0 size-full opacity-50 mix-blend-overlay"
			>
				<filter id="title-backdrop-grain">
					<feTurbulence
						baseFrequency="0.85"
						numOctaves={4}
						stitchTiles="stitch"
						type="fractalNoise"
					/>
				</filter>
				<rect filter="url(#title-backdrop-grain)" height="100%" width="100%" />
			</svg>
			<MediaTheme mode="dark">{page}</MediaTheme>
		</>
	);
}
