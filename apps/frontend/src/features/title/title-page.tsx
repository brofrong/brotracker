"use client";

import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Carousel } from "@astryxdesign/core/Carousel";
import { Center } from "@astryxdesign/core/Center";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { Lightbox } from "@astryxdesign/core/Lightbox";
import { List, ListItem } from "@astryxdesign/core/List";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Section } from "@astryxdesign/core/Section";
import {
	SegmentedControl,
	SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { useToast } from "@astryxdesign/core/Toast";
import { MediaTheme } from "@astryxdesign/core/theme";
import { detectMediaType } from "@brotracker/rutracker-ts/tracker/search-engine/rutracker/media-type";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageOff, Star } from "lucide-react";
import { type SVGProps, useState } from "react";
import {
	formatBytes,
	formatEta,
	formatProgress,
	formatSpeed,
} from "#/shared/lib/format";
import { trpc } from "#/shared/lib/trpc";
import { TitleCard } from "#/shared/ui/title-card";
import { TmdbAttribution } from "#/shared/ui/tmdb-attribution";

function formatRuntime(minutes: number): string {
	if (minutes < 60) {
		return `${minutes} мин`;
	}
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return rest === 0 ? `${hours} ч` : `${hours} ч ${rest} мин`;
}

function votesLabel(count: number): string {
	const mod10 = count % 10;
	const mod100 = count % 100;
	if (mod10 === 1 && mod100 !== 11) {
		return "оценка";
	}
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
		return "оценки";
	}
	return "оценок";
}

function ratingColor(value: number): "success" | "warning" | "error" {
	if (value >= 7) {
		return "success";
	}
	if (value >= 5) {
		return "warning";
	}
	return "error";
}

function ratingTextClass(value: number): string {
	if (value >= 7) {
		return "text-green-vivid";
	}
	if (value >= 5) {
		return "text-yellow-vivid";
	}
	return "text-red-vivid";
}

const RATING_SOURCE_LABELS: Record<string, string> = {
	tmdb: "TMDB",
	imdb: "IMDb",
	kinopoisk: "Кинопоиск",
};

const CREW_JOB_LABELS: Record<string, string> = {
	Director: "Режиссёр",
	Screenplay: "Сценарий",
	Writer: "Сценарий",
	Creator: "Создатель",
	"Executive Producer": "Продюсер",
};

function groupCrewByJob(
	crew: Array<{ name: string; job: string }>,
): Array<{ job: string; names: string[] }> {
	const groups = new Map<string, string[]>();
	for (const member of crew) {
		const job = CREW_JOB_LABELS[member.job] ?? member.job;
		const names = groups.get(job) ?? [];
		names.push(member.name);
		groups.set(job, names);
	}
	return [...groups.entries()].map(([job, names]) => ({ job, names }));
}

function FilledStarIcon(props: SVGProps<SVGSVGElement>) {
	return <Star {...props} fill="currentColor" />;
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
	facet,
}: {
	titleId: string;
	facet: "films" | "tv" | null;
}) {
	const toast = useToast();
	const queryClient = useQueryClient();
	const torrentsQuery = useQuery({
		...trpc.title.torrents.queryOptions({ id: titleId }),
		refetchOnWindowFocus: false,
		refetchInterval: (query) => {
			const items = query.state.data?.items ?? [];
			return items.some((item) => item.transfer != null) ? 5_000 : false;
		},
	});

	const addMutation = useMutation({
		...trpc.title.add.mutationOptions(),
		onSuccess: async () => {
			toast({ body: "Торрент добавлен в qBittorrent" });
			await queryClient.invalidateQueries({
				queryKey: trpc.title.torrents.queryKey({ id: titleId }),
			});
			await queryClient.invalidateQueries({
				queryKey: trpc.title.get.queryKey({ id: titleId }),
			});
		},
		onError: (error) => {
			toast({
				type: "error",
				body: error.message || "Не удалось добавить торрент",
			});
		},
	});

	const onAdd = (item: TitleTorrentItem) => {
		const kind = facet ?? detectMediaType(item.forumId);
		if (!kind) {
			toast({
				type: "error",
				body: "Не удалось определить тип (фильм/сериал)",
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

	if (torrentsQuery.isLoading) {
		return (
			<VStack gap={2} width="100%">
				<Heading level={2}>Раздачи</Heading>
				<Skeleton height={48} width="100%" />
				<Skeleton height={48} width="100%" />
			</VStack>
		);
	}

	if (torrentsQuery.isError) {
		return (
			<EmptyState
				description={torrentsQuery.error.message}
				title="Не удалось загрузить раздачи"
			/>
		);
	}

	const result = torrentsQuery.data;
	if (!result || result.status === "empty" || result.items.length === 0) {
		return (
			<EmptyState
				description="Когда появятся кандидаты на трекере или в локальном кэше — они будут здесь."
				title="Раздач пока нет"
			/>
		);
	}

	return (
		<VStack gap={2} width="100%">
			{result.status === "degraded" ? (
				<Banner
					container="section"
					description="Показан локальный кэш. Трекер временно недоступен."
					status="warning"
					title="Раздачи из кэша"
				/>
			) : null}

			<List
				density="compact"
				hasDividers
				header={<Heading level={2}>Раздачи</Heading>}
			>
				{result.items.map((item) => {
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
												label={`Прогресс ${item.title}`}
												max={100}
												value={progressPct}
												variant={done ? "success" : "accent"}
												formatValueLabel={() =>
													formatProgress(transfer.progress)
												}
											/>
											<Text hasTabularNumbers type="supporting">
												{done
													? `${transfer.stateLabel} · Готово`
													: `${transfer.stateLabel} · ${formatSpeed(transfer.downloadSpeed)} · ETA ${formatEta(transfer.etaSeconds)}`}
											</Text>
										</VStack>
									) : null}
								</VStack>
							}
							endContent={
								transfer ? null : (
									<Button
										label="Скачать"
										size="sm"
										variant="secondary"
										isDisabled={addMutation.isPending}
										onClick={() => onAdd(item)}
									/>
								)
							}
							label={item.title}
						/>
					);
				})}
			</List>
		</VStack>
	);
}

type TitleWatchView = {
	topicUrl: string;
	watch: "tracking" | "paused" | "completed" | "off";
	source: "auto-qb" | "manual";
	lastCheckedAt: string | null;
	lastChangedAt: string | null;
	lastError: string | null;
	progress: { have: number; total: number } | null;
};

function episodeProgressLabel(watch: TitleWatchView | null): string {
	if (!watch?.progress) {
		return "Прогресс серий неизвестен";
	}
	return `Серии: ${watch.progress.have} из ${watch.progress.total}`;
}

function episodeProgressVariant(
	watch: TitleWatchView | null,
): "success" | "accent" | "neutral" {
	if (!watch?.progress) {
		return "neutral";
	}
	return watch.progress.have >= watch.progress.total ? "success" : "accent";
}

function TitleWatchPanel({
	titleId,
	watch,
}: {
	titleId: string;
	watch: TitleWatchView | null;
}) {
	const toast = useToast();
	const queryClient = useQueryClient();

	const setWatchMutation = useMutation({
		...trpc.title.setWatch.mutationOptions(),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: trpc.title.get.queryKey({ id: titleId }),
			});
		},
		onError: (error) => {
			toast({
				type: "error",
				body: error.message || "Не удалось изменить follow",
			});
		},
	});

	const checkNowMutation = useMutation({
		...trpc.title.checkNow.mutationOptions(),
		onSuccess: async (result) => {
			await queryClient.invalidateQueries({
				queryKey: trpc.title.get.queryKey({ id: titleId }),
			});
			await queryClient.invalidateQueries({
				queryKey: trpc.title.torrents.queryKey({ id: titleId }),
			});

			if (result.status === "unchanged") {
				toast({ body: "Раздача не изменилась" });
			} else if (result.status === "updated") {
				toast({
					body: result.applied
						? "Раздача обновлена и подменена в qBittorrent"
						: "Раздача обновилась",
				});
			} else {
				toast({
					type: "error",
					body: result.message || "Не удалось проверить обновление",
				});
			}
		},
		onError: (error) => {
			toast({
				type: "error",
				body: error.message || "Не удалось проверить обновление",
			});
		},
	});

	const segmentValue =
		watch?.watch === "paused"
			? "paused"
			: watch?.watch === "tracking"
				? "tracking"
				: "off";

	return (
		<VStack gap={2} width="100%">
			<Heading level={2}>Follow</Heading>
			<HStack gap={3} vAlign="center" wrap="wrap">
				{segmentValue === "off" ? (
					<Button
						isLoading={setWatchMutation.isPending}
						label="Следить"
						onClick={() =>
							setWatchMutation.mutate({
								id: titleId,
								watch: "tracking",
							})
						}
						variant="secondary"
					/>
				) : (
					<SegmentedControl
						isDisabled={setWatchMutation.isPending}
						label="Статус follow"
						onChange={(value) => {
							if (value !== "tracking" && value !== "paused") {
								return;
							}
							setWatchMutation.mutate({
								id: titleId,
								watch: value,
							});
						}}
						size="sm"
						value={segmentValue}
					>
						<SegmentedControlItem label="Слежу" value="tracking" />
						<SegmentedControlItem label="Пауза" value="paused" />
					</SegmentedControl>
				)}
				<Button
					isLoading={checkNowMutation.isPending}
					label="Проверить обновление"
					onClick={() => checkNowMutation.mutate({ id: titleId })}
					variant="ghost"
				/>
			</HStack>
			{watch?.lastError ? (
				<Banner
					container="section"
					description={watch.lastError}
					status="error"
					title="Ошибка проверки"
				/>
			) : null}
			{watch?.lastCheckedAt ? (
				<Text type="supporting">
					Проверено: {new Date(watch.lastCheckedAt).toLocaleString("ru-RU")}
				</Text>
			) : null}
		</VStack>
	);
}

type TitleHeroProps = {
	titleId: string;
	titleName: string;
	facet: "films" | "tv" | null;
	meta: {
		poster: string | null;
		backdrop: string | null;
		overview: string | null;
		year: number | null;
		genres: string[];
		runtimeMinutes: number | null;
		status: string | null;
		seasons: number | null;
	};
	crewGroups: Array<{ job: string; names: string[] }>;
	ratings: Array<{
		source: string;
		status: string;
		value?: number;
		voteCount?: number | null;
	}>;
	hasRatings: boolean;
	watch: TitleWatchView | null;
	onOpenPoster: () => void;
};

function TitleHero({
	titleId,
	titleName,
	facet,
	meta,
	crewGroups,
	ratings,
	hasRatings,
	watch,
	onOpenPoster,
}: TitleHeroProps) {
	return (
		<HStack gap={6} vAlign="center" wrap="nowrap" width="100%">
			<VStack className="shrink-0" width={208}>
				{meta.poster ? (
					<VStack
						aria-label={`Открыть постер: ${titleName}`}
						as="button"
						className="cursor-pointer"
						onClick={onOpenPoster}
						type="button"
						width="100%"
					>
						<AspectRatio
							className="overflow-hidden rounded-lg shadow-md"
							fit="cover"
							ratio={2 / 3}
						>
							<img alt={titleName} src={meta.poster} />
						</AspectRatio>
					</VStack>
				) : (
					<AspectRatio
						className="overflow-hidden rounded-lg shadow-md"
						fit="cover"
						ratio={2 / 3}
					>
						<Center height="100%" width="100%">
							<ImageOff aria-hidden size={48} strokeWidth={1.5} />
						</Center>
					</AspectRatio>
				)}
			</VStack>

			<StackItem className="min-w-0" size="fill">
				<VStack gap={3} width="100%">
					<VStack gap={1}>
						<Heading level={1}>{titleName}</Heading>
						<HStack gap={2} vAlign="center" wrap="wrap">
							{facet ? (
								<Badge
									label={facet === "films" ? "Фильм" : "Сериал"}
									variant="teal"
								/>
							) : null}
							{meta.year != null ? (
								<Text type="supporting">{meta.year}</Text>
							) : null}
							{facet === "films" && meta.runtimeMinutes != null ? (
								<Text type="supporting">
									{formatRuntime(meta.runtimeMinutes)}
								</Text>
							) : null}
							{facet === "tv" && meta.status ? (
								<Text type="supporting">{meta.status}</Text>
							) : null}
							{facet === "tv" && meta.seasons != null ? (
								<Text type="supporting">Сезонов: {meta.seasons}</Text>
							) : null}
							{facet === "tv" ? (
								<HStack gap={1} vAlign="center">
									<StatusDot
										label={episodeProgressLabel(watch)}
										variant={episodeProgressVariant(watch)}
									/>
									<Text type="supporting">{episodeProgressLabel(watch)}</Text>
								</HStack>
							) : null}
						</HStack>
						{meta.genres.length > 0 ? (
							<Text type="supporting">{meta.genres.join(" · ")}</Text>
						) : null}
					</VStack>

					{meta.overview ? <Text type="body">{meta.overview}</Text> : null}

					{crewGroups.length > 0 ? (
						<VStack gap={1}>
							<Text type="supporting">Съёмочная группа</Text>
							{crewGroups.map((group) => (
								<Text key={group.job} type="body">
									<Text color="secondary" type="inherit">
										{group.job}:{" "}
									</Text>
									{group.names.join(", ")}
								</Text>
							))}
						</VStack>
					) : null}

					{hasRatings ? (
						<HStack gap={5} wrap="wrap">
							{ratings.map((rating) =>
								rating.status === "ok" && rating.value != null ? (
									<VStack gap={0.5} key={rating.source}>
										<HStack gap={1} vAlign="center">
											<Icon
												color={ratingColor(rating.value)}
												icon={FilledStarIcon}
												size="sm"
											/>
											<Text
												className={ratingTextClass(rating.value)}
												hasTabularNumbers
												size="2xl"
												weight="bold"
											>
												{rating.value.toFixed(1)}
											</Text>
										</HStack>
										<Text type="supporting">
											{RATING_SOURCE_LABELS[rating.source] ?? rating.source}
											{rating.voteCount != null
												? ` · ${rating.voteCount.toLocaleString("ru-RU")} ${votesLabel(rating.voteCount)}`
												: ""}
										</Text>
									</VStack>
								) : null,
							)}
						</HStack>
					) : null}

					{facet === "tv" ? (
						<TitleWatchPanel titleId={titleId} watch={watch} />
					) : null}
				</VStack>
			</StackItem>
		</HStack>
	);
}

export function TitlePage({ id }: { id: string }) {
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
				<EmptyState description={error.message} title="Не удалось загрузить" />
			</Section>
		);
	}

	if (!data) {
		return null;
	}

	const { meta, metaStatus, facet, ratings, watch } = data;
	const titleName = meta.name ?? "Без названия";
	const crewGroups = groupCrewByJob(meta.crew);
	const hasRatings = ratings.some((rating) => rating.status === "ok");

	const page = (
		<Section className="relative z-10" padding={4} variant="transparent">
			<VStack gap={4} width="100%">
				{metaStatus === "degraded" ? (
					<Banner
						container="section"
						description="TMDB временно недоступен. Карточка открыта, метаданные появятся позже."
						status="warning"
						title="Метаданные недоступны"
					/>
				) : null}

				{metaStatus === "empty" ? (
					<Banner
						container="section"
						description="У этой карточки ещё нет привязки к TMDB."
						status="info"
						title="Пустая карточка"
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
						<Heading level={2}>Актёры</Heading>
						<Carousel aria-label="Актёры" gap={3} hasSnap>
							{meta.cast.map((member) => (
								<VStack
									gap={2}
									hAlign="center"
									key={`${member.name}-${member.character ?? ""}`}
									width={128}
								>
									<Avatar
										name={member.name}
										size={96}
										src={member.profileUrl ?? undefined}
										tooltip={false}
									/>
									<VStack gap={0.5} hAlign="center" width="100%">
										<Text
											display="block"
											justify="center"
											maxLines={2}
											weight="medium"
										>
											{member.name}
										</Text>
										{member.character ? (
											<Text
												display="block"
												justify="center"
												maxLines={2}
												type="supporting"
											>
												{member.character}
											</Text>
										) : null}
									</VStack>
								</VStack>
							))}
						</Carousel>
					</VStack>
				) : null}

				<TitleTorrentsList facet={facet} titleId={id} />

				{meta.similar.length > 0 ? (
					<VStack gap={3} width="100%">
						<Heading level={2}>Похожие</Heading>
						<Carousel aria-label="Похожие тайтлы" gap={3} hasSnap>
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
				aria-hidden
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
