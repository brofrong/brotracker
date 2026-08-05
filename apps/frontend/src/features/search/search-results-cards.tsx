"use client";

import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { Grid } from "@astryxdesign/core/Grid";
import { Icon } from "@astryxdesign/core/Icon";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { ImageOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TrackerSourceBadge } from "#/shared/ui/tracker-source-badge";

export type SearchCardItem = {
	id: string;
	torrentId: string;
	cover: string | null;
	title: string;
	resolution: "4K" | "1080p" | "720p" | "SD" | null;
	hdr: "HDR" | "SDR" | null;
	size: string;
	seeds: number | string;
	leeches: number | string;
	downloads: number | string;
	date: string;
	torrentFileUrl: string;
	topicUrl: string;
	forumId: string;
};

export type SearchCardTagsItem = Pick<SearchCardItem, "resolution" | "hdr"> &
	Partial<Pick<SearchCardItem, "torrentId">>;

function resolutionVariant(
	resolution: SearchCardItem["resolution"],
): "purple" | "blue" | "cyan" | "neutral" {
	switch (resolution) {
		case "4K":
			return "purple";
		case "1080p":
			return "blue";
		case "720p":
			return "cyan";
		default:
			return "neutral";
	}
}

function SearchCardTags({ item }: { item: SearchCardTagsItem }) {
	return (
		<HStack gap={1} wrap="wrap">
			{item.torrentId ? (
				<TrackerSourceBadge torrentId={item.torrentId} />
			) : null}
			{item.resolution ? (
				<Badge
					label={item.resolution}
					variant={resolutionVariant(item.resolution)}
				/>
			) : null}
			{item.hdr ? (
				<Badge
					label={item.hdr}
					variant={item.hdr === "HDR" ? "orange" : "neutral"}
				/>
			) : null}
		</HStack>
	);
}

function SearchCard({
	item,
	onDownload,
}: {
	item: SearchCardItem;
	onDownload: (item: SearchCardItem) => void;
}) {
	const { t } = useTranslation("search");

	return (
		<Card padding={0} elevation="low" height="100%">
			<VStack gap={0} height="100%">
				<AspectRatio ratio={2 / 3} fit="contain">
					{item.cover ? (
						<img src={item.cover} alt={item.title} />
					) : (
						<Center height="100%" width="100%">
							<ImageOff aria-hidden size={32} strokeWidth={1.5} />
						</Center>
					)}
				</AspectRatio>
				<VStack gap={2} padding={3}>
					<Text display="block" type="body" wordBreak="break-word">
						{item.title}
					</Text>
					<SearchCardTags item={item} />
					<HStack gap={3} wrap="wrap">
						<HStack gap={1} vAlign="center">
							<Icon color="success" icon="arrowUp" size="sm" />
							<Text hasTabularNumbers type="supporting">
								{item.seeds}
							</Text>
						</HStack>
						<HStack gap={1} vAlign="center">
							<Icon color="warning" icon="arrowDown" size="sm" />
							<Text hasTabularNumbers type="supporting">
								{item.leeches}
							</Text>
						</HStack>
						<Text hasTabularNumbers type="supporting">
							↓ {item.downloads}
						</Text>
						<Text type="supporting">{item.size}</Text>
						<Text type="supporting">{item.date}</Text>
					</HStack>
					<VStack gap={2} width="100%">
						<Button
							label={t("download")}
							size="sm"
							variant="primary"
							width="100%"
							onClick={() => onDownload(item)}
						/>
						<Button
							href={item.topicUrl}
							icon={<Icon icon="externalLink" size="sm" />}
							isExternalLink
							label={t("onForum")}
							size="sm"
							target="_blank"
							variant="secondary"
							width="100%"
						/>
					</VStack>
				</VStack>
			</VStack>
		</Card>
	);
}

type SearchResultsCardsProps = {
	items: SearchCardItem[];
	onDownload: (item: SearchCardItem) => void;
};

export function SearchResultsCards({
	items,
	onDownload,
}: SearchResultsCardsProps) {
	return (
		<Grid columns={{ minWidth: 260, max: 4 }} gap={3} width="100%">
			{items.map((item) => (
				<SearchCard key={item.id} item={item} onDownload={onDownload} />
			))}
		</Grid>
	);
}

export { resolutionVariant, SearchCardTags };
