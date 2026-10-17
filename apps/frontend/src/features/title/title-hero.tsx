"use client";

import { useAppShellMobile } from "@astryxdesign/core/AppShell";
import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Center } from "@astryxdesign/core/Center";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import {
	SegmentedControl,
	SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { useToast } from "@astryxdesign/core/Toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImageOff, Star } from "lucide-react";
import { type SVGProps, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppLocale } from "#/shared/i18n/locale";
import { useLocale } from "#/shared/i18n/locale-provider";
import { trpc } from "#/shared/lib/trpc";
import { WaitButton } from "./wait-button";
import { showsWatchPanel, type TitleWatchState } from "./wait-state";

const MOBILE_POSTER_WIDTH = 96;
const DESKTOP_POSTER_WIDTH = 208;
const OVERVIEW_CLAMP_LINES = 3;

function formatRuntime(
	minutes: number,
	t: (key: string, options?: Record<string, unknown>) => string,
): string {
	if (minutes < 60) {
		return t("runtime.minutesOnly", { minutes });
	}
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return rest === 0
		? t("runtime.hoursOnly", { hours })
		: t("runtime.hoursMinutes", { hours, minutes: rest });
}

/** Picks common.votes.one/few/many: Slavic rules for ru, one vs many for en. */
function votesWord(
	count: number,
	locale: AppLocale,
	t: (key: string) => string,
): string {
	if (locale === "en") {
		return count === 1 ? t("votes.one") : t("votes.many");
	}
	const mod10 = count % 10;
	const mod100 = count % 100;
	if (mod10 === 1 && mod100 !== 11) {
		return t("votes.one");
	}
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
		return t("votes.few");
	}
	return t("votes.many");
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

function FilledStarIcon(props: SVGProps<SVGSVGElement>) {
	return <Star {...props} fill="currentColor" />;
}

type TitleWatchView = {
	id: string;
	topicUrl: string | null;
	kind: "films" | "tv" | null;
	watch: TitleWatchState;
	source: "auto-qb" | "manual";
	season: number | null;
	waitingOutcome:
		| "no-releases"
		| "only-camrip"
		| "below-resolution"
		| "no-hdr"
		| "no-voice"
		| "search-failed"
		| null;
	waitingOutcomeDetail: string | null;
	lastCheckedAt: string | null;
	lastChangedAt: string | null;
	lastError: string | null;
	progress: { have: number; total: number } | null;
};

function episodeProgressLabel(
	watch: TitleWatchView | null,
	t: (key: string, options?: Record<string, unknown>) => string,
): string {
	if (!watch?.progress) {
		return t("detail.episodeProgressUnknown");
	}
	return t("detail.episodeProgress", {
		have: watch.progress.have,
		total: watch.progress.total,
	});
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
	const { t } = useTranslation("title");
	const { bcp47 } = useLocale();
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
				body: error.message || t("watch.setFailed"),
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
				queryKey: trpc.title.torrents.pathKey(),
			});

			if (result.status === "unchanged") {
				toast({ body: t("watch.unchanged") });
			} else if (result.status === "updated") {
				toast({
					body: result.applied ? t("watch.updatedApplied") : t("watch.updated"),
				});
			} else {
				toast({
					type: "error",
					body: result.message || t("watch.checkFailed"),
				});
			}
		},
		onError: (error) => {
			toast({
				type: "error",
				body: error.message || t("watch.checkFailed"),
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
			<Heading level={2}>{t("watch.heading")}</Heading>
			<HStack gap={3} vAlign="center" wrap="wrap">
				{segmentValue === "off" ? (
					<Button
						isLoading={setWatchMutation.isPending}
						label={t("watch.follow")}
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
						label={t("watch.statusLabel")}
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
						<SegmentedControlItem
							label={t("watch.tracking")}
							value="tracking"
						/>
						<SegmentedControlItem label={t("watch.paused")} value="paused" />
					</SegmentedControl>
				)}
				<Button
					isLoading={checkNowMutation.isPending}
					label={t("watch.checkNow")}
					onClick={() => checkNowMutation.mutate({ id: titleId })}
					variant="ghost"
				/>
			</HStack>
			{watch?.lastError ? (
				<Banner
					container="section"
					description={watch.lastError}
					status="error"
					title={t("watch.checkErrorTitle")}
				/>
			) : null}
			{watch?.lastCheckedAt ? (
				<Text type="supporting">
					{t("watch.lastChecked", {
						datetime: new Date(watch.lastCheckedAt).toLocaleString(bcp47),
					})}
				</Text>
			) : null}
		</VStack>
	);
}

export type TitleHeroProps = {
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
		originalName: string | null;
		alternativeNames: string[];
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
	/** «Жду» is offered only for TMDB titles with full metadata (see canWaitFor). */
	canWait: boolean;
	onOpenPoster: () => void;
};

export function TitleHero({
	titleId,
	titleName,
	facet,
	meta,
	crewGroups,
	ratings,
	hasRatings,
	watch,
	canWait,
	onOpenPoster,
}: TitleHeroProps) {
	const { t } = useTranslation("title");
	const { t: tCommon } = useTranslation("common");
	const { locale, bcp47 } = useLocale();
	const { isMobile } = useAppShellMobile();
	const [isOverviewExpanded, setIsOverviewExpanded] = useState(false);
	const progressLabel = episodeProgressLabel(watch, t);

	const showOriginalName =
		meta.originalName != null &&
		meta.originalName.trim().length > 0 &&
		meta.originalName.toLowerCase() !== titleName.toLowerCase();
	const showAlsoKnownAs = meta.alternativeNames.length > 0;

	const poster = (width: number) => (
		<VStack className="shrink-0" width={width}>
			{meta.poster ? (
				<VStack
					aria-label={t("detail.openPosterAria", { title: titleName })}
					as="button"
					className="cursor-pointer"
					onClick={onOpenPoster}
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
	);

	const badges = (
		<HStack gap={2} vAlign="center" wrap="wrap">
			{facet ? (
				<Badge
					label={facet === "films" ? t("detail.film") : t("detail.series")}
					variant="teal"
				/>
			) : null}
			{meta.year != null ? <Text type="supporting">{meta.year}</Text> : null}
			{facet === "films" && meta.runtimeMinutes != null ? (
				<Text type="supporting">
					{formatRuntime(meta.runtimeMinutes, tCommon)}
				</Text>
			) : null}
			{facet === "tv" && meta.status ? (
				<Text type="supporting">{meta.status}</Text>
			) : null}
			{facet === "tv" && meta.seasons != null ? (
				<Text type="supporting">
					{t("detail.seasonsCount", { count: meta.seasons })}
				</Text>
			) : null}
			{facet === "tv" ? (
				<HStack gap={1} vAlign="center">
					<StatusDot
						label={progressLabel}
						variant={episodeProgressVariant(watch)}
					/>
					<Text type="supporting">{progressLabel}</Text>
				</HStack>
			) : null}
		</HStack>
	);

	const namesBlock =
		showOriginalName || showAlsoKnownAs ? (
			<VStack gap={0.5}>
				{showOriginalName ? (
					<Text type="supporting">
						{t("detail.originalName")}: {meta.originalName}
					</Text>
				) : null}
				{showAlsoKnownAs ? (
					<Text type="supporting">
						{t("detail.alsoKnownAs")}: {meta.alternativeNames.join(" · ")}
					</Text>
				) : null}
			</VStack>
		) : null;

	const genresText =
		meta.genres.length > 0 ? (
			<Text type="supporting">{meta.genres.join(" · ")}</Text>
		) : null;

	const crewBlock =
		crewGroups.length > 0 ? (
			<VStack gap={1}>
				<Text type="supporting">{t("detail.crewHeading")}</Text>
				{crewGroups.map((group) => (
					<Text key={group.job} type="body">
						<Text color="secondary" type="inherit">
							{group.job}:{" "}
						</Text>
						{group.names.join(", ")}
					</Text>
				))}
			</VStack>
		) : null;

	const ratingsBlock = hasRatings ? (
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
							{rating.voteCount != null
								? t("detail.ratingWithVotes", {
										source: t(`detail.ratingSources.${rating.source}`, {
											defaultValue: rating.source,
										}),
										count: rating.voteCount.toLocaleString(bcp47),
										votesWord: votesWord(rating.voteCount, locale, tCommon),
									})
								: t(`detail.ratingSources.${rating.source}`, {
										defaultValue: rating.source,
									})}
						</Text>
					</VStack>
				) : null,
			)}
		</HStack>
	) : null;

	const watchBlock = showsWatchPanel(facet, watch) ? (
		<TitleWatchPanel titleId={titleId} watch={watch} />
	) : null;

	const waitBlock = canWait ? (
		<WaitButton isFullWidth={isMobile} titleId={titleId} watch={watch} />
	) : null;

	if (isMobile) {
		return (
			<VStack gap={3} width="100%">
				<HStack gap={3} vAlign="end" wrap="nowrap" width="100%">
					{poster(MOBILE_POSTER_WIDTH)}
					<StackItem className="min-w-0" size="fill">
						<VStack gap={1}>
							<Heading level={1}>{titleName}</Heading>
							{badges}
							{genresText}
						</VStack>
					</StackItem>
				</HStack>

				{namesBlock}

				{waitBlock}

				{ratingsBlock}

				{meta.overview ? (
					<VStack gap={1}>
						<Text
							maxLines={isOverviewExpanded ? 0 : OVERVIEW_CLAMP_LINES}
							type="body"
						>
							{meta.overview}
						</Text>
						<Button
							aria-expanded={isOverviewExpanded}
							label={
								isOverviewExpanded ? t("detail.showLess") : t("detail.showMore")
							}
							onClick={() => setIsOverviewExpanded((expanded) => !expanded)}
							size="sm"
							variant="ghost"
						/>
					</VStack>
				) : null}

				{crewBlock}

				{watchBlock}
			</VStack>
		);
	}

	return (
		<HStack gap={6} vAlign="center" wrap="nowrap" width="100%">
			{poster(DESKTOP_POSTER_WIDTH)}

			<StackItem className="min-w-0" size="fill">
				<VStack gap={3} width="100%">
					<VStack gap={1}>
						<Heading level={1}>{titleName}</Heading>
						{badges}
						{namesBlock}
						{genresText}
					</VStack>

					{waitBlock}

					{meta.overview ? <Text type="body">{meta.overview}</Text> : null}

					{crewBlock}

					{ratingsBlock}

					{watchBlock}
				</VStack>
			</StackItem>
		</HStack>
	);
}
