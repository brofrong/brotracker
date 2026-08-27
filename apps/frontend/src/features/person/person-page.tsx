"use client";

import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { Badge } from "@astryxdesign/core/Badge";
import { Carousel } from "@astryxdesign/core/Carousel";
import { Center } from "@astryxdesign/core/Center";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Section } from "@astryxdesign/core/Section";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useQuery } from "@tanstack/react-query";
import { ImageOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocale } from "#/shared/i18n/locale-provider";
import { trpc } from "#/shared/lib/trpc";
import { TitleCard } from "#/shared/ui/title-card";
import { TmdbAttribution } from "#/shared/ui/tmdb-attribution";

function PersonHero({
	name,
	profileUrl,
	knownForDepartment,
	birthday,
	deathday,
	placeOfBirth,
}: {
	name: string;
	profileUrl: string | null;
	knownForDepartment: string | null;
	birthday: string | null;
	deathday: string | null;
	placeOfBirth: string | null;
}) {
	const { t } = useTranslation("person");
	const { bcp47 } = useLocale();

	const formatDate = (value: string) =>
		new Date(value).toLocaleDateString(bcp47, {
			day: "numeric",
			month: "long",
			year: "numeric",
		});

	return (
		<HStack gap={6} vAlign="center" wrap="nowrap" width="100%">
			<VStack className="shrink-0" width={208}>
				{profileUrl ? (
					<AspectRatio
						className="overflow-hidden rounded-lg shadow-md"
						fit="cover"
						ratio={2 / 3}
					>
						<img alt={name} src={profileUrl} />
					</AspectRatio>
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
				<VStack gap={2} width="100%">
					<VStack gap={1}>
						<Heading level={1}>{name}</Heading>
						<HStack gap={2} vAlign="center" wrap="wrap">
							{knownForDepartment ? (
								<Badge
									label={t(`departments.${knownForDepartment}`, {
										defaultValue: knownForDepartment,
									})}
									variant="teal"
								/>
							) : null}
							{birthday ? (
								<Text type="supporting">
									{deathday
										? t("bornDied", {
												born: formatDate(birthday),
												died: formatDate(deathday),
											})
										: t("born", { date: formatDate(birthday) })}
								</Text>
							) : null}
						</HStack>
						{placeOfBirth ? (
							<Text type="supporting">
								{t("placeOfBirth", { place: placeOfBirth })}
							</Text>
						) : null}
					</VStack>
				</VStack>
			</StackItem>
		</HStack>
	);
}

export function PersonPage({ id }: { id: string }) {
	const { t } = useTranslation("person");
	const tmdbId = Number(id);
	const { data, isLoading, isError, error } = useQuery({
		...trpc.person.get.queryOptions({ tmdbId }),
		enabled: Number.isInteger(tmdbId) && tmdbId > 0,
		refetchOnWindowFocus: false,
	});

	if (isLoading || !data) {
		return (
			<Section padding={4} variant="transparent">
				<VStack gap={5} width="100%">
					<HStack gap={6} wrap="wrap">
						<Skeleton height={312} width={208} />
						<VStack gap={2} width="100%">
							<Skeleton height={32} width={280} />
							<Skeleton height={20} width={240} />
							<Skeleton height={16} width={180} />
						</VStack>
					</HStack>
					<HStack gap={3}>
						<Skeleton height={176} width={176} />
						<Skeleton height={176} width={176} />
						<Skeleton height={176} width={176} />
					</HStack>
				</VStack>
			</Section>
		);
	}

	if (isError) {
		return (
			<Section padding={4} variant="transparent">
				<EmptyState description={error.message} title={t("loadFailed")} />
			</Section>
		);
	}

	const page = (
		<Section className="relative z-10" padding={4} variant="transparent">
			<VStack gap={4} width="100%">
				<PersonHero
					birthday={data.birthday}
					deathday={data.deathday}
					knownForDepartment={data.knownForDepartment}
					name={data.name}
					placeOfBirth={data.placeOfBirth}
					profileUrl={data.profileUrl}
				/>

				{data.biography ? (
					<VStack gap={2} width="100%">
						<Heading level={2}>{t("biographyHeading")}</Heading>
						<Text type="body">{data.biography}</Text>
					</VStack>
				) : null}

				{data.credits.length > 0 ? (
					<VStack gap={2} width="100%">
						<Heading level={2}>{t("filmographyHeading")}</Heading>
						<Carousel aria-label={t("filmographyCarouselAria")} gap={3} hasSnap>
							{data.credits.map((credit) => (
								<VStack gap={1} key={credit.titleId} width={176}>
									<TitleCard item={credit} />
									{credit.character ? (
										<Text maxLines={1} type="supporting">
											{credit.character}
										</Text>
									) : null}
								</VStack>
							))}
						</Carousel>
					</VStack>
				) : (
					<EmptyState
						description={t("filmographyEmptyDescription")}
						title={t("filmographyEmptyTitle")}
					/>
				)}

				<TmdbAttribution compact />
			</VStack>
		</Section>
	);

	return page;
}
