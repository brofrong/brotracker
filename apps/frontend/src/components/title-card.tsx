"use client";

import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { Center } from "@astryxdesign/core/Center";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Icon } from "@astryxdesign/core/Icon";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useNavigate } from "@tanstack/react-router";
import { ImageOff, Star } from "lucide-react";
import type { SVGProps } from "react";

export type TitleCardData = {
	titleId: string;
	name: string;
	poster: string | null;
	year: number | null;
	kind: "films" | "tv";
	rating: number | null;
};

const KIND_LABELS: Record<TitleCardData["kind"], string> = {
	films: "Фильм",
	tv: "Сериал",
};

function formatRating(rating: number): string {
	return rating.toLocaleString("ru-RU", {
		minimumFractionDigits: 1,
		maximumFractionDigits: 1,
	});
}

function FilledStarIcon(props: SVGProps<SVGSVGElement>) {
	return <Star {...props} fill="currentColor" />;
}

export function TitleCard({ item }: { item: TitleCardData }) {
	const navigate = useNavigate();

	return (
		<ClickableCard
			className="w-44 shrink-0 overflow-hidden"
			elevation="low"
			label={item.name}
			padding={0}
			onClick={() =>
				void navigate({
					to: "/title/$id",
					params: { id: item.titleId },
				})
			}
		>
			<VStack gap={0} width="100%">
				<AspectRatio fit="cover" ratio={2 / 3}>
					{item.poster ? (
						<img alt={item.name} src={item.poster} />
					) : (
						<Center height="100%" width="100%">
							<ImageOff aria-hidden size={32} strokeWidth={1.5} />
						</Center>
					)}
				</AspectRatio>
				<VStack gap={1} padding={2} width="100%">
					<Text
						className="min-h-[calc(2*var(--text-body-size)*var(--text-body-leading))]"
						display="block"
						maxLines={2}
						type="body"
					>
						{item.name}
					</Text>
					<HStack gap={1} vAlign="center">
						{item.rating != null ? (
							<>
								<Icon color="warning" icon={FilledStarIcon} size="xsm" />
								<Text hasTabularNumbers type="supporting">
									{formatRating(item.rating)}
								</Text>
								<Text type="supporting">·</Text>
							</>
						) : null}
						<Text type="supporting">
							{KIND_LABELS[item.kind]}
							{item.year != null ? ` · ${item.year}` : ""}
						</Text>
					</HStack>
				</VStack>
			</VStack>
		</ClickableCard>
	);
}
