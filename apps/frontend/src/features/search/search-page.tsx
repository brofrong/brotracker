"use client";

import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { Section } from "@astryxdesign/core/Section";
import {
	SegmentedControl,
	SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { Spinner } from "@astryxdesign/core/Spinner";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import {
	pixel,
	Table,
	type TableColumn,
	useTableColumnResize,
} from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { useToast } from "@astryxdesign/core/Toast";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	DownloadTorrentDialog,
	type DownloadTorrentItem,
} from "#/features/search/download-torrent-dialog";
import {
	type SearchCardItem,
	SearchCardTags,
	SearchResultsCards,
} from "#/features/search/search-results-cards";
import { formatBytes } from "#/shared/lib/format";
import { trpc } from "#/shared/lib/trpc";
import { SearchBar } from "#/shared/ui/search-bar";

type ViewMode = "table" | "cards";

interface SearchRow extends Record<string, unknown> {
	id: string;
	cover: string | null;
	title: string;
	author: string;
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
}

interface TorrentResult {
	torrentId: string;
	title: string;
	authorId: string;
	size: number;
	seeds: number;
	leeches: number;
	downloads: number;
	date: string | Date;
	torrentFileUrl: string;
	topicUrl: string;
	imageUrl: string | null;
	hdr: "HDR" | "SDR" | null;
	resolution: "4K" | "1080p" | "720p" | "SD" | null;
	forumId: string;
}

const staticColumns: TableColumn<SearchRow>[] = [
	{
		key: "cover",
		header: "",
		width: pixel(72),
		resizable: false,
		renderCell: (item) =>
			item.cover ? (
				<AspectRatio ratio={2 / 3} fit="contain">
					<img src={item.cover} alt={item.title} />
				</AspectRatio>
			) : null,
	},
	{
		key: "title",
		header: "Название",
		width: pixel(480),
	},
	{
		key: "tags",
		header: "Теги",
		width: pixel(148),
		renderCell: (item) => <SearchCardTags item={item} />,
	},
	{
		key: "size",
		header: "Размер",
		width: pixel(88),
	},
	{
		key: "seeds",
		header: "Сиды",
		width: pixel(64),
		align: "end",
	},
	{
		key: "leeches",
		header: "Личи",
		width: pixel(64),
		align: "end",
	},
	{
		key: "downloads",
		header: "Скачивания",
		width: pixel(96),
		align: "end",
	},
	{
		key: "date",
		header: "Дата",
		width: pixel(104),
	},
];

function formatDate(value: string | Date): string {
	if (value instanceof Date) {
		return Number.isNaN(value.getTime())
			? "—"
			: value.toLocaleDateString("ru-RU");
	}
	if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
		const date = new Date(value);
		return Number.isNaN(date.getTime())
			? value
			: date.toLocaleDateString("ru-RU");
	}
	return value;
}

function toSearchRows(data: TorrentResult[] | undefined): SearchRow[] {
	return (data ?? []).map((torrent) => ({
		id: torrent.torrentId || torrent.torrentFileUrl,
		cover: torrent.imageUrl,
		title: torrent.title,
		author: torrent.authorId,
		resolution: torrent.resolution ?? null,
		hdr: torrent.hdr ?? null,
		size: formatBytes(torrent.size),
		seeds: torrent.seeds,
		leeches: torrent.leeches,
		downloads: torrent.downloads,
		date: formatDate(torrent.date),
		torrentFileUrl: torrent.torrentFileUrl,
		topicUrl: torrent.topicUrl,
		forumId: torrent.forumId,
	}));
}

export function SearchPage({ search }: { search?: string }) {
	const navigate = useNavigate({ from: "/search" });
	const hasActiveSearch = Boolean(search?.trim());
	const toast = useToast();
	const [viewMode, setViewMode] = useState<ViewMode>("table");
	const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
	const [downloadItem, setDownloadItem] = useState<DownloadTorrentItem | null>(
		null,
	);
	const [isDownloadOpen, setIsDownloadOpen] = useState(false);

	const openDownload = useCallback((row: SearchCardItem) => {
		setDownloadItem({
			title: row.title,
			size: row.size,
			seeds: row.seeds,
			leeches: row.leeches,
			resolution: row.resolution,
			hdr: row.hdr,
			torrentFileUrl: row.torrentFileUrl,
			forumId: row.forumId,
		});
		setIsDownloadOpen(true);
	}, []);

	const columns = useMemo<TableColumn<SearchRow>[]>(
		() => [
			...staticColumns,
			{
				key: "action",
				header: "",
				width: pixel(208),
				renderCell: (item) => (
					<HStack gap={1}>
						<Button
							label="Скачать"
							size="sm"
							onClick={() => openDownload(item)}
						/>
						<Button
							href={item.topicUrl}
							icon={<Icon icon="externalLink" size="sm" />}
							isExternalLink
							label="На трекере"
							size="sm"
							target="_blank"
							variant="secondary"
						/>
					</HStack>
				),
			},
		],
		[openDownload],
	);

	const columnResize = useTableColumnResize({
		columnWidths,
		columns,
		minWidth: 64,
		onColumnResizeEnd: (updates) => {
			setColumnWidths((prev) => ({ ...prev, ...updates }));
		},
	});

	const localQuery = useQuery({
		...trpc.torrent.search.queryOptions({ search }),
		enabled: hasActiveSearch,
		refetchOnWindowFocus: false,
	});

	const refreshQuery = useQuery({
		...trpc.torrent.searchRefresh.queryOptions({
			search,
			options: { sortType: "leechesCount", sortOrder: "descending" },
		}),
		enabled: hasActiveSearch,
		refetchOnWindowFocus: false,
		retry: false,
	});

	const recentQuery = useQuery({
		...trpc.torrent.recent.queryOptions({ limit: 50 }),
		enabled: !hasActiveSearch,
		refetchOnWindowFocus: false,
	});

	useEffect(() => {
		if (!refreshQuery.isError) return;
		toast({
			type: "error",
			body:
				refreshQuery.error.message || "Не удалось получить данные с трекера",
			uniqueID: "search-refresh-error",
			collisionBehavior: "ignore",
		});
	}, [refreshQuery.isError, refreshQuery.error, toast]);

	const displayData = hasActiveSearch
		? refreshQuery.isSuccess
			? refreshQuery.data
			: localQuery.data
		: recentQuery.data;
	const rows = useMemo(() => toSearchRows(displayData?.results), [displayData]);

	const showInitialSpinner = hasActiveSearch
		? localQuery.isLoading && !localQuery.data && !refreshQuery.isSuccess
		: recentQuery.isLoading && !recentQuery.data;
	const showTrackerIndicator =
		hasActiveSearch && refreshQuery.isFetching && !showInitialSpinner;
	const showLocalError = hasActiveSearch
		? localQuery.isError && !refreshQuery.isSuccess && !refreshQuery.isFetching
		: recentQuery.isError;
	const showEmpty =
		!showInitialSpinner &&
		!showLocalError &&
		rows.length === 0 &&
		(hasActiveSearch ? !refreshQuery.isFetching : recentQuery.isSuccess);
	const showResultsChrome =
		!showInitialSpinner && !showLocalError && rows.length > 0;

	const handleSearch = (query: string) => {
		void navigate({ search: { search: query }, replace: true });
	};

	const errorMessage = hasActiveSearch
		? localQuery.error?.message
		: recentQuery.error?.message;
	const badgeLabel = hasActiveSearch
		? `Найдено: ${rows.length}`
		: "Последние релизы";
	const emptyTitle = hasActiveSearch ? "Ничего не найдено" : "Пока ничего нет";
	const emptyDescription = hasActiveSearch
		? undefined
		: "Сделайте поиск — результаты попадут в кэш";

	return (
		<VStack gap={3} width="100%">
			<Section padding={4} variant="transparent">
				<VStack gap={3} width="100%">
					<VStack gap={1} width="100%">
						<Heading level={1}>Поиск</Heading>
						<Text type="supporting">Поиск по трекеру</Text>
					</VStack>
					<SearchBar
						initialQuery={search ?? ""}
						isSearching={showInitialSpinner}
						onSearch={handleSearch}
					/>
				</VStack>
			</Section>
			{showTrackerIndicator ? (
				<HStack gap={2} paddingInline={4} vAlign="center">
					<Spinner aria-label="Ищем на трекере" size="sm" />
					<Text type="supporting">Ищем на трекере…</Text>
				</HStack>
			) : null}
			{showInitialSpinner ? <Spinner label="Загрузка" /> : null}
			{showLocalError ? (
				<EmptyState description={errorMessage} title="Ошибка поиска" />
			) : null}
			{showResultsChrome ? (
				<HStack
					gap={3}
					hAlign="between"
					paddingInline={4}
					vAlign="center"
					wrap="wrap"
				>
					<Badge
						label={badgeLabel}
						variant={hasActiveSearch ? "teal" : "blue"}
					/>
					<SegmentedControl
						label="Вид результатов"
						onChange={(value) => setViewMode(value as ViewMode)}
						size="sm"
						value={viewMode}
					>
						<SegmentedControlItem label="Таблица" value="table" />
						<SegmentedControlItem label="Карточки" value="cards" />
					</SegmentedControl>
				</HStack>
			) : null}
			{showEmpty ? (
				<EmptyState description={emptyDescription} title={emptyTitle} />
			) : null}
			{showResultsChrome && viewMode === "table" ? (
				<Table
					columns={columns}
					data={rows}
					density="balanced"
					dividers="columns"
					hasHover
					idKey="id"
					plugins={{ columnResize }}
					textOverflow="wrap"
				/>
			) : null}
			{showResultsChrome && viewMode === "cards" ? (
				<Section padding={4} paddingBlock={0} variant="transparent">
					<SearchResultsCards items={rows} onDownload={openDownload} />
				</Section>
			) : null}
			<DownloadTorrentDialog
				item={downloadItem}
				isOpen={isDownloadOpen}
				onOpenChange={(open) => {
					setIsDownloadOpen(open);
					if (!open) {
						setDownloadItem(null);
					}
				}}
			/>
		</VStack>
	);
}
