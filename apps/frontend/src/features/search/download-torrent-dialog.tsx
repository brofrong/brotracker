"use client";

import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import {
	SegmentedControl,
	SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useToast } from "@astryxdesign/core/Toast";
import {
	detectMediaType,
	type MediaType,
} from "@brotracker/rutracker-ts/tracker/search-engine/rutracker/media-type";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SearchCardTags } from "#/features/search/search-results-cards";
import { trpc } from "#/shared/lib/trpc";

export type DownloadTorrentItem = {
	title: string;
	size: string;
	seeds: number | string;
	leeches: number | string;
	resolution: "4K" | "1080p" | "720p" | "SD" | null;
	hdr: "HDR" | "SDR" | null;
	torrentFileUrl: string;
	forumId: string;
};

type Props = {
	item: DownloadTorrentItem | null;
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
};

export function DownloadTorrentDialog({ item, isOpen, onOpenChange }: Props) {
	const { t } = useTranslation("search");
	const toast = useToast();
	const [mediaType, setMediaType] = useState<"" | MediaType>("");

	const addMutation = useMutation({
		...trpc.qbittorent.add.mutationOptions(),
	});

	useEffect(() => {
		if (!item) {
			setMediaType("");
			return;
		}
		setMediaType(detectMediaType(item.forumId) ?? "");
	}, [item]);

	const handleDownload = async () => {
		if (!item || mediaType === "") {
			return;
		}

		try {
			await addMutation.mutateAsync({
				torrentFileUrl: item.torrentFileUrl,
				mediaType,
			});
			toast({ body: t("dialog.added") });
			onOpenChange(false);
		} catch (error) {
			toast({
				type: "error",
				body: error instanceof Error ? error.message : t("dialog.addFailed"),
			});
		}
	};

	return (
		<Dialog
			isOpen={isOpen && item !== null}
			onOpenChange={onOpenChange}
			purpose="form"
			width={480}
		>
			{item ? (
				<Layout
					header={
						<DialogHeader
							title={t("dialog.title")}
							onOpenChange={onOpenChange}
						/>
					}
					content={
						<LayoutContent>
							<VStack gap={4}>
								<VStack gap={2}>
									<Text display="block" type="body" wordBreak="break-word">
										{item.title}
									</Text>
									<Text type="supporting">
										{t("dialog.meta", {
											size: item.size,
											seeds: item.seeds,
											leeches: item.leeches,
										})}
									</Text>
									<SearchCardTags
										item={{
											resolution: item.resolution,
											hdr: item.hdr,
										}}
									/>
								</VStack>
								<SegmentedControl
									label={t("dialog.typeLabel")}
									layout="fill"
									value={mediaType}
									onChange={(value) => setMediaType(value as "" | MediaType)}
								>
									<SegmentedControlItem
										label={t("dialog.film")}
										value="films"
									/>
									<SegmentedControlItem label={t("dialog.series")} value="tv" />
								</SegmentedControl>
							</VStack>
						</LayoutContent>
					}
					footer={
						<LayoutFooter>
							<HStack gap={2} hAlign="end">
								<Button
									label={t("dialog.cancel")}
									variant="secondary"
									onClick={() => onOpenChange(false)}
								/>
								<Button
									label={t("dialog.download")}
									variant="primary"
									isDisabled={mediaType === ""}
									isLoading={addMutation.isPending}
									onClick={handleDownload}
								/>
							</HStack>
						</LayoutFooter>
					}
				/>
			) : null}
		</Dialog>
	);
}
