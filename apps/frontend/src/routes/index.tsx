"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Section } from "@astryxdesign/core/Section";
import { Spinner } from "@astryxdesign/core/Spinner";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import {
	pixel,
	proportional,
	Table,
	type TableColumn,
} from "@astryxdesign/core/Table";
import { Thumbnail } from "@astryxdesign/core/Thumbnail";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import z from "zod";
import { SearchBar } from "#/components/search/search-bar";
import { formatBytes } from "#/utils/format";
import { trpc } from "#/utils/trpc";

const searchSchema = z.object({
	search: z.string().optional(),
});

export const Route = createFileRoute("/")({
	component: App,
	validateSearch: searchSchema,
});

interface SearchRow extends Record<string, unknown> {
	id: string;
	cover: string | null;
	title: string;
	author: string;
	size: string;
	seeds: number | string;
	leeches: number | string;
	downloads: number | string;
	date: string;
	torrentFileUrl: string;
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
	imageUrl: string | null;
}

const columns: TableColumn<SearchRow>[] = [
	{
		key: "cover",
		header: "",
		width: pixel(48),
		renderCell: (item) => (
			<Thumbnail
				src={item.cover ?? undefined}
				alt={item.title}
				label={item.title}
			/>
		),
	},
	{
		key: "title",
		header: "Название",
		width: proportional(3),
	},
	{
		key: "author",
		header: "Author ID",
		width: proportional(1),
	},
	{
		key: "size",
		header: "Размер",
		width: proportional(1),
	},
	{
		key: "seeds",
		header: "Сиды",
		width: proportional(1),
		align: "end",
	},
	{
		key: "leeches",
		header: "Личи",
		width: proportional(1),
		align: "end",
	},
	{
		key: "downloads",
		header: "Скачивания",
		width: proportional(1),
		align: "end",
	},
	{
		key: "date",
		header: "Дата",
		width: pixel(120),
	},
	{
		key: "action",
		header: "",
		width: pixel(120),
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
		size: formatBytes(torrent.size),
		seeds: torrent.seeds,
		leeches: torrent.leeches,
		downloads: torrent.downloads,
		date: formatDate(torrent.date),
		torrentFileUrl: torrent.torrentFileUrl,
	}));
}

function App() {
	const { search } = Route.useSearch();
	const [force, setForce] = useState(false);
	const [prevSearch, setPrevSearch] = useState(search);
	if (search !== prevSearch) {
		setPrevSearch(search);
		setForce(false);
	}

	const { data, isLoading, isError, error } = useQuery({
		...trpc.torrent.search.queryOptions({
			search,
			force,
			options: {
				category: "films",
				sortType: "leechesCount",
				sortOrder: "descending",
			},
		}),
		refetchOnWindowFocus: false,
	});

	useEffect(() => {
		if (force && !isLoading && data?.source === "tracker") {
			setForce(false);
		}
	}, [force, isLoading, data?.source]);

	const results = data?.results ?? [];
	const source = data?.source;
	const rows = useMemo(() => toSearchRows(results), [results]);

	return (
		<VStack gap={3} width="100%">
			<Section padding={4} variant="transparent">
				<SearchBar />
			</Section>
			{isLoading ? <Spinner label="Загрузка" /> : null}
			{isError ? (
				<EmptyState description={error.message} title="Ошибка поиска" />
			) : null}
			{!isLoading && !isError && data && search ? (
				<HStack gap={2} vAlign="center" paddingInline={4}>
					<Badge
						label={
							source === "local" ? "Найдено локально" : "С трекера"
						}
						variant={source === "local" ? "teal" : "blue"}
					/>
					{source === "local" && rows.length > 0 ? (
						<Button
							label="Искать на трекере"
							size="sm"
							onClick={() => setForce(true)}
						/>
					) : null}
				</HStack>
			) : null}
			{!isLoading && !isError && search && rows.length === 0 ? (
				<EmptyState title="Ничего не найдено" />
			) : null}
			{!isLoading && !isError && rows.length > 0 ? (
				<Table
					columns={columns}
					data={rows}
					density="compact"
					hasHover
					idKey="id"
					textOverflow="truncate"
				/>
			) : null}
		</VStack>
	);
}
