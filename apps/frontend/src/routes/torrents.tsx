"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import {
	Layout,
	LayoutContent,
	LayoutFooter,
	LayoutHeader,
} from "@astryxdesign/core/Layout";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Section } from "@astryxdesign/core/Section";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { HStack } from "@astryxdesign/core/Stack";
import {
	pixel,
	Table,
	type TableColumn,
	useTableColumnResize,
} from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { HardDrive, Wifi, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	formatBytes,
	formatEta,
	formatProgress,
	formatSpeed,
	formatTorrentState,
} from "#/utils/format";
import { getTorrentStateVisual } from "#/utils/torrent-status";
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

interface SkeletonRow extends Record<string, unknown> {
	id: string;
	index: number;
}

const SKELETON_ROW_COUNT = 10;

function TorrentsTableSkeleton() {
	const data = useMemo(
		(): SkeletonRow[] =>
			Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => ({
				id: String(index),
				index,
			})),
		[],
	);

	const columns = useMemo((): TableColumn<SkeletonRow>[] => {
		const cell = (
			index: number,
			offset: number,
			width: number | string,
			options?: { radius?: "rounded"; center?: boolean },
		) => {
			const skeleton = (
				<Skeleton
					height={16}
					index={index * 8 + offset}
					radius={options?.radius}
					width={width}
				/>
			);
			return options?.center ? (
				<HStack hAlign="center" width="100%">
					{skeleton}
				</HStack>
			) : (
				skeleton
			);
		};

		return [
			{
				key: "name",
				header: sortLabels.name,
				width: pixel(320),
				renderCell: ({ index }) => cell(index, 0, "85%"),
			},
			{
				key: "state",
				header: sortLabels.state,
				width: pixel(72),
				align: "center",
				renderCell: ({ index }) =>
					cell(index, 1, 16, { radius: "rounded", center: true }),
			},
			{
				key: "progress",
				header: sortLabels.progress,
				width: pixel(180),
				renderCell: ({ index }) => cell(index, 2, "90%"),
			},
			{
				key: "size",
				header: sortLabels.size,
				width: pixel(100),
				align: "end",
				renderCell: ({ index }) => cell(index, 3, 64),
			},
			{
				key: "dlspeed",
				header: sortLabels.dlspeed,
				width: pixel(110),
				align: "end",
				renderCell: ({ index }) => cell(index, 4, 72),
			},
			{
				key: "upspeed",
				header: sortLabels.upspeed,
				width: pixel(110),
				align: "end",
				renderCell: ({ index }) => cell(index, 5, 72),
			},
			{
				key: "eta",
				header: sortLabels.eta,
				width: pixel(80),
				align: "end",
				renderCell: ({ index }) => cell(index, 6, 40),
			},
			{
				key: "save_path",
				header: sortLabels.save_path,
				width: pixel(240),
				renderCell: ({ index }) => cell(index, 7, "70%"),
			},
		];
	}, []);

	return (
		<Table
			columns={columns}
			data={data}
			density="compact"
			idKey="id"
			textOverflow="truncate"
		/>
	);
}

export const Route = createFileRoute("/torrents")({
	component: TorrentsPage,
});

const GIB = 1024 ** 3;
const DISK_FREE_WARNING_GIB = 500;
const DISK_FREE_CRITICAL_GIB = 200;

function diskFreeIconColor(
	freeBytes: number,
): "success" | "warning" | "error" {
	if (freeBytes < DISK_FREE_CRITICAL_GIB * GIB) return "error";
	if (freeBytes < DISK_FREE_WARNING_GIB * GIB) return "warning";
	return "success";
}

function diskFreeTooltip(freeBytes: number): string {
	const amount = formatBytes(freeBytes);
	if (freeBytes < DISK_FREE_CRITICAL_GIB * GIB) {
		return `Мало места на диске: свободно ${amount} (меньше 200 ГБ)`;
	}
	if (freeBytes < DISK_FREE_WARNING_GIB * GIB) {
		return `Свободное место заканчивается: ${amount} (меньше 500 ГБ)`;
	}
	return `Свободное место на диске qBittorrent: ${amount}`;
}

function TorrentsPage() {
	const navigate = useNavigate();
	const qbSettingsQuery = useQuery(
		trpc.settings.providers.qbittorrent.get.queryOptions(),
	);
	const isConfigured = Boolean(qbSettingsQuery.data?.isConfigured);

	const freeSpaceQuery = useQuery({
		...trpc.qbittorent.freeSpace.queryOptions(),
		enabled: isConfigured,
		refetchInterval: isConfigured ? 5000 : false,
	});

	const [torrents, setTorrents] = useState<QbittorentTorrent[]>([]);
	const [search, setSearch] = useState("");
	const [sortKey, setSortKey] = useState<SortKey>("name");
	const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
	const [isLoading, setIsLoading] = useState(true);
	const [isConnected, setIsConnected] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const freeSpaceOnDisk = freeSpaceQuery.data?.freeSpaceOnDisk ?? null;

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
				width: pixel(72),
				align: "center",
				renderCell: (item) => {
					const label = formatTorrentState(item.state);
					const { icon, color } = getTorrentStateVisual(item.state);
					return (
						<HStack hAlign="center" width="100%">
							<Tooltip content={label} placement="above">
								<Icon color={color} icon={icon} label={label} size="sm" />
							</Tooltip>
						</HStack>
					);
				},
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

	const connectionLabel = !isConfigured
		? "Нет подключения"
		: isConnected
			? "Live (WebSocket)"
			: error
				? "Ошибка подключения"
				: "Нет подключения";

	const connectionTooltip = !isConfigured
		? "qBittorrent не настроен — live-обновления недоступны."
		: isConnected
			? "Активное WebSocket-подключение: список торрентов обновляется в реальном времени."
			: error
				? "WebSocket оборвался. Статусы не обновляются — проверьте бэкенд и qBittorrent."
				: "Ожидание WebSocket-подключения для live-обновлений.";

	const connectionIconColor =
		connectionStatus === "success"
			? "success"
			: connectionStatus === "error"
				? "error"
				: "tertiary";

	const pageHeader = (
		<LayoutHeader className="bg-body" hasDivider padding={4}>
			<HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
				<Heading level={1}>Торренты в qBittorrent</Heading>
				{isConfigured ? (
					<TextInput
						hasClear
						isLabelHidden
						label="Поиск"
						onChange={setSearch}
						placeholder="Поиск по названию, пути или статусу..."
						startIcon="search"
						value={search}
						width={320}
					/>
				) : null}
			</HStack>
		</LayoutHeader>
	);

	const pageFooter = (
		<LayoutFooter className="bg-body" hasDivider padding={4}>
			<HStack gap={4} hAlign="between" vAlign="center" wrap="wrap">
				{freeSpaceOnDisk != null ? (
					<Tooltip content={diskFreeTooltip(freeSpaceOnDisk)} placement="above">
						<HStack gap={1.5} vAlign="center">
							<Icon
								color={diskFreeIconColor(freeSpaceOnDisk)}
								icon={HardDrive}
								label={diskFreeTooltip(freeSpaceOnDisk)}
								size="sm"
							/>
							<Text hasTabularNumbers type="supporting">
								{formatBytes(freeSpaceOnDisk)}
							</Text>
						</HStack>
					</Tooltip>
				) : (
					<Tooltip content="Свободное место на диске неизвестно" placement="above">
						<Icon
							color="tertiary"
							icon={HardDrive}
							label="Свободное место на диске неизвестно"
							size="sm"
						/>
					</Tooltip>
				)}
				<Tooltip content={connectionTooltip} placement="above">
					<Icon
						color={connectionIconColor}
						icon={isConnected ? Wifi : WifiOff}
						label={connectionLabel}
						size="sm"
					/>
				</Tooltip>
			</HStack>
		</LayoutFooter>
	);

	if (qbSettingsQuery.isLoading) {
		return (
			<Layout
				content={
					<LayoutContent padding={0}>
						<TorrentsTableSkeleton />
					</LayoutContent>
				}
				footer={pageFooter}
				header={pageHeader}
				height="fill"
			/>
		);
	}

	if (!isConfigured) {
		return (
			<Layout
				content={
					<LayoutContent>
						<Section padding={4} paddingBlock={0} variant="transparent">
							<Banner
								container="section"
								description="Укажите URL и API key, чтобы видеть список торрентов."
								endContent={
									<Button
										label="Открыть настройки"
										onClick={() =>
											navigate({
												to: "/settings",
												search: { section: "qbittorrent" },
											})
										}
										variant="secondary"
									/>
								}
								status="warning"
								title="qBittorrent не настроен"
							/>
						</Section>
					</LayoutContent>
				}
				footer={pageFooter}
				header={pageHeader}
				height="fill"
			/>
		);
	}

	return (
		<Layout
			content={
				<LayoutContent padding={0}>
					{isLoading ? <TorrentsTableSkeleton /> : null}

					{error ? (
						<Section padding={4} variant="transparent">
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
							title={
								search.trim() ? "Ничего не найдено" : "Нет активных торрентов"
							}
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
				</LayoutContent>
			}
			footer={pageFooter}
			header={pageHeader}
			height="fill"
		/>
	);
}
