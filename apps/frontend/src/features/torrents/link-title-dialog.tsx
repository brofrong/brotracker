"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { Spinner } from "@astryxdesign/core/Spinner";
import { VStack } from "@astryxdesign/core/Stack";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Thumbnail } from "@astryxdesign/core/Thumbnail";
import { useToast } from "@astryxdesign/core/Toast";
import { skipToken, useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { queryClient, trpc } from "#/shared/lib/trpc";
import type { TitleCardData } from "#/shared/ui/title-card";
import { guessTitleQuery } from "./guess-title-query";

const SEARCH_DEBOUNCE_MS = 350;

export type LinkTitleTarget = { hash: string; name: string };

type Props = {
	target: LinkTitleTarget | null;
	onOpenChange: (open: boolean) => void;
};

/** Search TMDB and link a qBittorrent Transfer to the picked Title. */
export function LinkTitleDialog({ target, onOpenChange }: Props) {
	const { t } = useTranslation("transfers");
	const toast = useToast();
	const [input, setInput] = useState("");
	const [query, setQuery] = useState("");

	useEffect(() => {
		const initial = target ? guessTitleQuery(target.name) : "";
		setInput(initial);
		setQuery(initial);
	}, [target]);

	useEffect(() => {
		const timer = setTimeout(() => setQuery(input.trim()), SEARCH_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [input]);

	const searchQuery = useQuery(
		trpc.title.search.queryOptions(
			target && query ? { query, cursor: 1 } : skipToken,
		),
	);

	const linkMutation = useMutation({
		...trpc.title.linkTransfer.mutationOptions(),
		onSuccess: () =>
			queryClient.invalidateQueries({
				queryKey: trpc.title.transferLinks.queryKey(),
			}),
	});

	const handlePick = async (item: TitleCardData) => {
		if (!target) {
			return;
		}
		try {
			await linkMutation.mutateAsync({
				hash: target.hash,
				titleId: item.titleId,
			});
			toast({ body: t("link.linked", { name: item.name }) });
			onOpenChange(false);
		} catch (err) {
			toast({
				type: "error",
				body: err instanceof Error ? err.message : t("link.linkFailed"),
			});
		}
	};

	const items = searchQuery.data?.items ?? [];

	return (
		<Dialog
			isOpen={target !== null}
			maxHeight="80vh"
			onOpenChange={onOpenChange}
			width={560}
		>
			{target ? (
				<Layout
					content={
						<LayoutContent>
							<VStack gap={3} width="100%">
								<TextInput
									hasClear
									isLabelHidden
									label={t("link.searchLabel")}
									onChange={setInput}
									placeholder={t("link.searchPlaceholder")}
									startIcon="search"
									value={input}
								/>
								{searchQuery.isFetching && items.length === 0 ? (
									<Spinner label={t("link.loading")} />
								) : null}
								{searchQuery.isError ? (
									<Banner
										container="section"
										description={searchQuery.error.message}
										status="error"
										title={t("link.searchFailed")}
									/>
								) : null}
								{searchQuery.isSuccess && items.length === 0 ? (
									<EmptyState title={t("link.empty")} />
								) : null}
								{items.length > 0 ? (
									<List density="compact" hasDividers>
										{items.map((item) => (
											<ListItem
												description={[
													item.kind === "films"
														? t("link.film")
														: t("link.series"),
													item.year,
												]
													.filter(Boolean)
													.join(" · ")}
												isDisabled={linkMutation.isPending}
												key={item.titleId}
												label={item.name}
												onClick={() => void handlePick(item)}
												startContent={
													<Thumbnail
														alt={item.name}
														src={item.poster ?? undefined}
													/>
												}
											/>
										))}
									</List>
								) : null}
							</VStack>
						</LayoutContent>
					}
					header={
						<DialogHeader
							onOpenChange={onOpenChange}
							subtitle={target.name}
							title={t("link.dialogTitle")}
						/>
					}
				/>
			) : null}
		</Dialog>
	);
}
