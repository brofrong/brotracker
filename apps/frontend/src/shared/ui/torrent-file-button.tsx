"use client";

import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { useToast } from "@astryxdesign/core/Toast";
import { useMutation } from "@tanstack/react-query";
import { FileDown } from "lucide-react";
import { useTranslation } from "react-i18next";

import { saveTorrentFile, torrentFileName } from "#/shared/lib/torrent-file";
import { trpc } from "#/shared/lib/trpc";

/** Icon button that saves the release's `.torrent` file to the computer. */
export function TorrentFileButton({
	torrentFileUrl,
	title,
}: {
	torrentFileUrl: string;
	title: string;
}) {
	const { t } = useTranslation("common");
	const toast = useToast();
	const mutation = useMutation({
		...trpc.torrent.downloadFile.mutationOptions(),
		onSuccess: ({ base64 }) => {
			saveTorrentFile(base64, torrentFileName(title));
		},
		onError: (error) => {
			toast({
				type: "error",
				body: error.message || t("torrentFile.failed"),
			});
		},
	});

	return (
		<IconButton
			icon={<Icon icon={FileDown} size="sm" />}
			isLoading={mutation.isPending}
			label={t("torrentFile.aria", { title })}
			onClick={() => mutation.mutate({ torrentFileUrl })}
			size="sm"
			tooltip={t("torrentFile.tooltip")}
			variant="ghost"
		/>
	);
}
