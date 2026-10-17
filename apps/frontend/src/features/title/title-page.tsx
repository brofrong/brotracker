"use client";

import { Avatar } from "@astryxdesign/core/Avatar";
import { Banner } from "@astryxdesign/core/Banner";
import { Carousel } from "@astryxdesign/core/Carousel";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Lightbox } from "@astryxdesign/core/Lightbox";
import { Section } from "@astryxdesign/core/Section";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { MediaTheme } from "@astryxdesign/core/theme";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TitleHero } from "#/features/title/title-hero";
import { TitleTorrentsList } from "#/features/title/title-torrents";
import { trpc } from "#/shared/lib/trpc";
import { TitleCard } from "#/shared/ui/title-card";
import { TmdbAttribution } from "#/shared/ui/tmdb-attribution";

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
