"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Section } from "@astryxdesign/core/Section";
import { Spinner } from "@astryxdesign/core/Spinner";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import {
	pixel,
	Table,
	type TableColumn,
	useTableColumnResize,
} from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
	formatBytes,
	formatEta,
	formatProgress,
	formatSpeed,
	formatTorrentState,
} from "#/utils/format";
import { getTorrentStateVariant } from "#/utils/torrent-status";
import { trpc } from "#/utils/trpc";
import {
	type QbittorentTorrent,
	subscribeToTorrentUpdates,
} from "#/utils/trpc-subscription";

type SortKey =
	| "name"
	| "state"
	| "progress"
	| "size"
	| "dlspeed"
	| "upspeed"
	| "eta"
	| "save_path";

type SortDirection = "asc" | "desc";

interface TorrentRow extends Record<string, unknown> {
	hash: string;
	name: string;
	state: string;
	progress: number;
	size: number;
	dlspeed: number;
	upspeed: number;
	eta: number;
	save_path: string;
}

const sortLabels: Record<SortKey, string> = {
	name: "Название",
	state: "Статус",
	progress: "Прогресс",
	size: "Размер",
	dlspeed: "Скорость ↓",
	upspeed: "Скорость ↑",
	eta: "ETA",
	save_path: "Путь сохранения",
};

function toTorrentRow(torrent: QbittorentTorrent): TorrentRow {
	return {
		hash: torrent.hash,
		name: torrent.name,
		state: torrent.state,
		progress: torrent.progress,
		size: torrent.size,
		dlspeed: torrent.dlspeed,
		upspeed: torrent.upspeed,
		eta: torrent.eta,
		save_path: torrent.save_path,
	};
}

export const Route = createFileRoute("/torrents")({
	component: TorrentsPage,
});

function TorrentsPage() {
	const navigate = useNavigate();
	const qbSettingsQuery = useQuery(
		trpc.settings.providers.qbittorrent.get.queryOptions(),
	);
	const isConfigured = Boolean(qbSettingsQuery.data?.isConfigured);

	const [torrents, setTorrents] = useState<QbittorentTorrent[]>([]);
	const [search, setSearch] = useState("");
	const [sortKey, setSortKey] = useState<SortKey>("name");
	const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
	const [isLoading, setIsLoading] = useState(true);
	const [isConnected, setIsConnected] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (qbSettingsQuery.isLoading) {
			return;
		}

		if (!isConfigured) {
			setIsLoading(false);
			setIsConnected(false);
			setError(null);
			setTorrents([]);
			return;
		}

		setIsLoading(true);
		const subscription = subscribeToTorrentUpdates({
			onData(data) {
				setTorrents(data);
				setIsLoading(false);
				setIsConnected(true);
				setError(null);
			},
			onError(err) {
				setIsLoading(false);
				setIsConnected(false);
				setError(err.message);
			},
		});

		return () => {
			subscription.unsubscribe();
			setIsConnected(false);
		};
	}, [isConfigured, qbSettingsQuery.isLoading]);

	const filteredTorrents = useMemo(() => {
		const query = search.trim().toLowerCase();
		const filtered = query
			? torrents.filter((torrent) => {
					const stateLabel = formatTorrentState(torrent.state).toLowerCase();
					return (
						torrent.name.toLowerCase().includes(query) ||
						torrent.save_path.toLowerCase().includes(query) ||
						stateLabel.includes(query)
					);
				})
			: torrents;

		return [...filtered].sort((left, right) => {
			let comparison = 0;

			switch (sortKey) {
				case "name":
					comparison = left.name.localeCompare(right.name, "ru");
					break;
				case "state":
					comparison = formatTorrentState(left.state).localeCompare(
						formatTorrentState(right.state),
						"ru",
					);
					break;
				case "progress":
					comparison = left.progress - right.progress;
					break;
				case "size":
					comparison = left.size - right.size;
					break;
				case "dlspeed":
					comparison = left.dlspeed - right.dlspeed;
					break;
				case "upspeed":
					comparison = left.upspeed - right.upspeed;
					break;
				case "eta":
					comparison = left.eta - right.eta;
					break;
				case "save_path":
					comparison = left.save_path.localeCompare(right.save_path, "ru");
					break;
			}

			return sortDirection === "asc" ? comparison : -comparison;
		});
	}, [torrents, search, sortKey, sortDirection]);

	const rows = useMemo(
		() => filteredTorrents.map(toTorrentRow),
		[filteredTorrents],
	);

	const toggleSort = (key: SortKey) => {
		if (sortKey === key) {
			setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
			return;
		}

		setSortKey(key);
		setSortDirection(
			key === "name" || key === "state" || key === "save_path" ? "asc" : "desc",
		);
	};

	const renderSortIcon = (key: SortKey) => {
		if (sortKey !== key) {
			return <Icon color="tertiary" icon="arrowsUpDown" size="sm" />;
		}

		return sortDirection === "asc" ? (
			<Icon icon="arrowUp" size="sm" />
		) : (
			<Icon icon="arrowDown" size="sm" />
		);
	};

	const columns = useMemo((): TableColumn<TorrentRow>[] => {
		const sortableHeader = (key: SortKey) => (
			<Button
				endContent={renderSortIcon(key)}
				label={sortLabels[key]}
				onClick={() => toggleSort(key)}
				size="sm"
				variant="ghost"
			/>
		);

		return [
			{
				key: "name",
				header: sortableHeader("name"),
				width: pixel(320),
			},
			{
				key: "state",
				header: sortableHeader("state"),
				width: pixel(140),
				renderCell: (item) => (
					<Badge
						label={formatTorrentState(item.state)}
						variant={getTorrentStateVariant(item.state)}
					/>
				),
			},
			{
				key: "progress",
				header: sortableHeader("progress"),
				width: pixel(180),
				renderCell: (item) => (
					<ProgressBar
						formatValueLabel={(value, max) => formatProgress(value / max)}
						hasValueLabel
						isLabelHidden
						label={item.name}
						value={item.progress * 100}
					/>
				),
			},
			{
				key: "size",
				header: sortableHeader("size"),
				width: pixel(100),
				align: "end",
				renderCell: (item) => (
					<Text hasTabularNumbers type="body">
						{formatBytes(item.size)}
					</Text>
				),
			},
			{
				key: "dlspeed",
				header: sortableHeader("dlspeed"),
				width: pixel(110),
				align: "end",
				renderCell: (item) => (
					<Text hasTabularNumbers type="body">
						{formatSpeed(item.dlspeed)}
					</Text>
				),
			},
			{
				key: "upspeed",
				header: sortableHeader("upspeed"),
				width: pixel(110),
				align: "end",
				renderCell: (item) => (
					<Text hasTabularNumbers type="body">
						{formatSpeed(item.upspeed)}
					</Text>
				),
			},
			{
				key: "eta",
				header: sortableHeader("eta"),
				width: pixel(80),
				align: "end",
				renderCell: (item) => (
					<Text hasTabularNumbers type="body">
						{formatEta(item.eta)}
					</Text>
				),
			},
			{
				key: "save_path",
				header: sortableHeader("save_path"),
				width: pixel(240),
			},
		];
	}, [sortKey, sortDirection]);

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

	const connectionStatus = !isConfigured
		? "neutral"
		: isConnected
			? "success"
			: error
				? "error"
				: "neutral";

	if (qbSettingsQuery.isLoading) {
		return (
			<VStack gap={3} width="100%">
				<Section padding={4} variant="transparent">
					<Heading level={1}>Торренты в qBittorrent</Heading>
				</Section>
				<Spinner label="Загрузка" />
			</VStack>
		);
	}

	if (!isConfigured) {
		return (
			<VStack gap={3} width="100%">
				<Section padding={4} variant="transparent">
					<Heading level={1}>Торренты в qBittorrent</Heading>
				</Section>
				<Section padding={4} paddingBlock={0} variant="transparent">
					<Banner
						container="section"
						status="warning"
						title="qBittorrent не настроен"
						description="Укажите URL и API key, чтобы видеть список торрентов."
						endContent={
							<Button
								label="Открыть настройки"
								variant="secondary"
								onClick={() =>
									navigate({
										to: "/settings",
										search: { section: "qbittorrent" },
									})
								}
							/>
						}
					/>
				</Section>
			</VStack>
		);
	}

	return (
		<VStack gap={3} width="100%">
			<Section padding={4} variant="transparent">
				<HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
					<Heading level={1}>Торренты в qBittorrent</Heading>
					<HStack gap={2} vAlign="center">
						<StatusDot
							label={
								isConnected
									? "Подключено"
									: error
										? "Ошибка подключения"
										: "Нет подключения"
							}
							variant={connectionStatus}
						/>
						<Text type="supporting">
							{isConnected
								? "Live (WebSocket)"
								: error
									? "Ошибка подключения"
									: "Нет подключения"}
						</Text>
					</HStack>
				</HStack>
			</Section>

			<Section
				maxWidth={448}
				padding={4}
				paddingBlock={0}
				variant="transparent"
			>
				<TextInput
					hasClear
					isLabelHidden
					label="Поиск"
					onChange={setSearch}
					placeholder="Поиск по названию, пути или статусу..."
					startIcon="search"
					value={search}
					width="100%"
				/>
			</Section>

			{isLoading ? <Spinner label="Загрузка" /> : null}

			{error ? (
				<Section padding={4} paddingBlock={0} variant="transparent">
					<Banner
						container="section"
						description={error}
						status="error"
						title="Не удалось загрузить торренты"
					/>
				</Section>
			) : null}

			{!isLoading && !error && rows.length === 0 ? (
				<EmptyState
					description={
						search.trim()
							? "Попробуйте изменить запрос или очистить фильтр."
							: undefined
					}
					title={search.trim() ? "Ничего не найдено" : "Нет активных торрентов"}
				/>
			) : null}

			{!isLoading && !error && rows.length > 0 ? (
				<Table
					columns={columns}
					data={rows}
					density="compact"
					hasHover
					idKey="hash"
					plugins={{ columnResize }}
					textOverflow="truncate"
				/>
			) : null}
		</VStack>
	);
}
