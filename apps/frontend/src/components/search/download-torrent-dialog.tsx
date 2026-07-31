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
import { SearchCardTags } from "#/components/search/search-results-cards";
import { trpc } from "#/utils/trpc";

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
			toast({ body: "Торрент добавлен в qBittorrent" });
			onOpenChange(false);
		} catch (error) {
			toast({
				type: "error",
				body:
					error instanceof Error
						? error.message
						: "Не удалось добавить торрент",
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
							title="Скачать в qBittorrent"
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
										{item.size} · Сиды: {item.seeds} · Личи: {item.leeches}
									</Text>
									<SearchCardTags
										item={{
											resolution: item.resolution,
											hdr: item.hdr,
										}}
									/>
								</VStack>
								<SegmentedControl
									label="Тип"
									layout="fill"
									value={mediaType}
									onChange={(value) => setMediaType(value as "" | MediaType)}
								>
									<SegmentedControlItem label="Фильм" value="films" />
									<SegmentedControlItem label="Сериал" value="tv" />
								</SegmentedControl>
							</VStack>
						</LayoutContent>
					}
					footer={
						<LayoutFooter>
							<HStack gap={2} hAlign="end">
								<Button
									label="Отмена"
									variant="secondary"
									onClick={() => onOpenChange(false)}
								/>
								<Button
									label="Скачать"
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
