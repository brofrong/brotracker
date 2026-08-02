"use client";

import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { List, ListItem } from "@astryxdesign/core/List";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Section } from "@astryxdesign/core/Section";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useToast } from "@astryxdesign/core/Toast";
import { detectMediaType } from "@brotracker/rutracker-ts/tracker/search-engine/rutracker/media-type";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	formatBytes,
	formatEta,
	formatProgress,
	formatSpeed,
} from "#/utils/format";
import { trpc } from "#/utils/trpc";
import { TmdbAttribution } from "#/components/tmdb-attribution";

export const Route = createFileRoute("/title/$id")({
	component: TitlePage,
});

function ratingLabel(
	rating: {
		source: string;
		status: string;
		value?: number;
		voteCount?: number | null;
	},
): string {
	if (rating.status === "ok" && rating.value != null) {
		const votes =
			rating.voteCount != null ? ` · ${rating.voteCount.toLocaleString("ru-RU")}` : "";
		return `${rating.value.toFixed(1)}${votes}`;
	}
	if (rating.status === "unconfigured") {
		return "не настроено";
	}
	return "нет данных";
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

function TitlePage() {
	const { id } = Route.useParams();
	const { data, isLoading, isError, error } = useQuery({
		...trpc.title.get.queryOptions({ id }),
		refetchOnWindowFocus: false,
	});

	if (isLoading) {
		return (
			<Section padding={4} variant="transparent">
				<HStack gap={4} wrap="wrap">
					<Skeleton height={240} width={160} />
					<VStack gap={2} width="100%">
						<Skeleton height={28} width={280} />
						<Skeleton height={16} width={200} />
						<Skeleton height={80} width="100%" />
					</VStack>
				</HStack>
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

	const { meta, metaStatus, facet, ratings } = data;
	const titleName = meta.name ?? "Без названия";

	return (
		<Section padding={4} variant="transparent">
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

				<HStack gap={5} vAlign="start" wrap="wrap" width="100%">
					{meta.poster ? (
						<VStack width={160}>
							<AspectRatio fit="cover" ratio={2 / 3}>
								<img alt={titleName} src={meta.poster} />
							</AspectRatio>
						</VStack>
					) : (
						<Skeleton height={240} width={160} />
					)}

					<VStack gap={3} width="100%">
						<VStack gap={1}>
							<Heading level={1}>{titleName}</Heading>
							<HStack gap={2} wrap="wrap">
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
									<Text type="supporting">{meta.runtimeMinutes} мин</Text>
								) : null}
								{facet === "tv" && meta.status ? (
									<Text type="supporting">{meta.status}</Text>
								) : null}
								{facet === "tv" && meta.seasons != null ? (
									<Text type="supporting">
										Сезонов: {meta.seasons}
									</Text>
								) : null}
							</HStack>
						</VStack>

						{meta.genres.length > 0 ? (
							<Text type="supporting">{meta.genres.join(" · ")}</Text>
						) : null}

						{meta.overview ? (
							<Text type="body">{meta.overview}</Text>
						) : null}

						{meta.crew.length > 0 ? (
							<VStack gap={1}>
								<Text type="supporting">Съёмочная группа</Text>
								<Text type="body">
									{meta.crew
										.map((member) => `${member.name} (${member.job})`)
										.join(", ")}
								</Text>
							</VStack>
						) : null}

						<HStack gap={4} wrap="wrap">
							{ratings.map((rating) => (
								<VStack gap={1} key={rating.source}>
									<Text type="supporting">
										{rating.source === "tmdb"
											? "TMDB"
											: rating.source === "imdb"
												? "IMDb"
												: "Кинопоиск"}
									</Text>
									<Text hasTabularNumbers type="body">
										{ratingLabel(rating)}
									</Text>
								</VStack>
							))}
						</HStack>
					</VStack>
				</HStack>

				{meta.cast.length > 0 ? (
					<List
						density="compact"
						hasDividers
						header={<Heading level={2}>Актёры</Heading>}
					>
						{meta.cast.map((member) => (
							<ListItem
								key={`${member.name}-${member.character ?? ""}`}
								description={member.character ?? undefined}
								label={member.name}
								startContent={
									<Avatar
										name={member.name}
										size="md"
										src={member.profileUrl ?? undefined}
									/>
								}
							/>
						))}
					</List>
				) : null}

				<TitleTorrentsList facet={facet} titleId={id} />

				{metaStatus === "ok" || metaStatus === "degraded" ? (
					<TmdbAttribution compact />
				) : null}
			</VStack>
		</Section>
	);
}
