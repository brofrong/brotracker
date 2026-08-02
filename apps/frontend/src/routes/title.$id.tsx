"use client";

import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { List, ListItem } from "@astryxdesign/core/List";
import { Section } from "@astryxdesign/core/Section";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { trpc } from "#/utils/trpc";

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
			</VStack>
		</Section>
	);
}
