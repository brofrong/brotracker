"use client";

import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
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
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import z from "zod";
import {
	SearchBar,
	type SearchSource,
} from "#/components/search/search-bar";
import {
	SearchCardTags,
	SearchResultsCards,
} from "#/components/search/search-results-cards";
import { formatBytes } from "#/utils/format";
import { trpc } from "#/utils/trpc";

const searchSchema = z.object({
	search: z.string().optional(),
	source: z.enum(["local", "tracker"]).optional(),
});

export const Route = createFileRoute("/")({
	component: App,
	validateSearch: searchSchema,
});

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
}

const columns: TableColumn<SearchRow>[] = [
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
	{
		key: "action",
		header: "",
		width: pixel(112),
		renderCell: (item) => (
			<Button
				href={item.torrentFileUrl}
				label="Скачать"
				size="sm"
				target="_blank"
				rel="noopener noreferrer"
			/>
		),
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
	}));
}

function App() {
	const navigate = useNavigate({ from: "/" });
	const { search, source } = Route.useSearch();
	const hasActiveSearch = Boolean(search?.trim() && source);
	const [viewMode, setViewMode] = useState<ViewMode>("table");
	const [columnWidths, setColumnWidths] = useState<Record<string, number>>(
		{},
	);
	const columnResize = useTableColumnResize({
		columnWidths,
		columns,
		minWidth: 64,
		onColumnResizeEnd: (updates) => {
			setColumnWidths((prev) => ({ ...prev, ...updates }));
		},
	});

	const { data, isLoading, isError, error, isFetching } = useQuery({
		...trpc.torrent.search.queryOptions({
			search,
			source,
			options: {
				sortType: "leechesCount",
				sortOrder: "descending",
			},
		}),
		enabled: hasActiveSearch,
		refetchOnWindowFocus: false,
	});

	const results = data?.results ?? [];
	const resultSource = data?.source;
	const rows = useMemo(() => toSearchRows(results), [results]);
	const isSearching = hasActiveSearch && (isLoading || isFetching);

	const handleSearch = (query: string, nextSource: SearchSource) => {
		void navigate({
			search: { search: query, source: nextSource },
			replace: true,
		});
	};

	return (
		<VStack gap={3} width="100%">
			<Section padding={4} variant="transparent">
				<SearchBar
					initialQuery={search ?? ""}
					isSearching={isSearching}
					searchingSource={source}
					onSearch={handleSearch}
				/>
			</Section>
			{isSearching ? <Spinner label="Загрузка" /> : null}
			{isError ? (
				<EmptyState description={error.message} title="Ошибка поиска" />
			) : null}
			{!isSearching && !isError && hasActiveSearch ? (
				<HStack
					gap={3}
					hAlign="between"
					paddingInline={4}
					vAlign="center"
					wrap="wrap"
				>
					<Badge
						label={
							resultSource === "local"
								? "Найдено локально"
								: "С трекера"
						}
						variant={resultSource === "local" ? "teal" : "blue"}
					/>
					{rows.length > 0 ? (
						<SegmentedControl
							label="Вид результатов"
							onChange={(value) => setViewMode(value as ViewMode)}
							size="sm"
							value={viewMode}
						>
							<SegmentedControlItem label="Таблица" value="table" />
							<SegmentedControlItem label="Карточки" value="cards" />
						</SegmentedControl>
					) : null}
				</HStack>
			) : null}
			{!isSearching && !isError && hasActiveSearch && rows.length === 0 ? (
				<EmptyState title="Ничего не найдено" />
			) : null}
			{!isSearching && !isError && rows.length > 0 && viewMode === "table" ? (
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
			{!isSearching && !isError && rows.length > 0 && viewMode === "cards" ? (
				<Section padding={4} paddingBlock={0} variant="transparent">
					<SearchResultsCards items={rows} />
				</Section>
			) : null}
		</VStack>
	);
}
