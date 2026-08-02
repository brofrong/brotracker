"use client";

import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import {
	Layout,
	LayoutContent,
	LayoutFooter,
	LayoutHeader,
} from "@astryxdesign/core/Layout";
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
import { useToast } from "@astryxdesign/core/Toast";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { HardDrive, Pause, Play, Trash2, Wifi, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { TorrentProgressBar } from "#/components/torrent-progress-bar";
import {
	formatAddedOn,
	formatBytes,
	formatEta,
	formatProgress,
	formatSpeed,
} from "#/utils/format";
import {
	getOptimisticStartedState,
	getOptimisticStoppedState,
	getTorrentStateVisual,
	isTorrentPaused,
} from "#/utils/torrent-status";
import { handleTrpcUnauthorized, trpc } from "#/utils/trpc";
import {
	type LiveTorrent,
	subscribeToTorrentUpdates,
} from "#/utils/trpc-subscription";

type SortKey =
	| "name"
	| "state"
	| "progress"
	| "size"
	| "downloadSpeed"
	| "uploadSpeed"
	| "eta"
	| "addedOn"
	| "savePath";

type SortDirection = "asc" | "desc";

interface TorrentRow extends Record<string, unknown> {
	id: string;
	name: string;
	stateKind: string;
	stateLabel: string;
	progress: number;
	size: number;
	downloadSpeed: number;
	uploadSpeed: number;
	etaSeconds: number;
	addedOn: number;
	savePath: string;
}

const sortLabels: Record<SortKey, string> = {
	name: "Название",
	state: "Статус",
	progress: "Прогресс",
	size: "Размер",
	downloadSpeed: "Скорость ↓",
	uploadSpeed: "Скорость ↑",
	eta: "ETA",
	addedOn: "Добавлен",
	savePath: "Путь сохранения",
};

function toTorrentRow(torrent: LiveTorrent): TorrentRow {
	return {
		id: torrent.id,
		name: torrent.name,
		stateKind: torrent.stateKind,
		stateLabel: torrent.stateLabel,
		progress: torrent.progress,
		size: torrent.size,
		downloadSpeed: torrent.downloadSpeed,
		uploadSpeed: torrent.uploadSpeed,
		etaSeconds: torrent.etaSeconds,
		addedOn: torrent.addedOn,
		savePath: torrent.savePath,
	};
}

interface SkeletonRow extends Record<string, unknown> {
	id: string;
	index: number;
}

const SKELETON_ROW_COUNT = 10;
/** Compact table body content height for skeleton rows. */
const ROW_CONTENT_HEIGHT = 20;

function TorrentProgressCell({
	name,
	progress,
}: {
	name: string;
	progress: number;
}) {
	const pct = Math.min(100, Math.max(0, progress * 100));
	const isComplete = pct >= 100;

	return (
		<TorrentProgressBar
			label={name}
			value={pct}
			valueLabel={formatProgress(progress)}
			variant={isComplete ? "success" : "accent"}
		/>
	);
}

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
			options?: {
				radius?: "rounded";
				center?: boolean;
				height?: number;
			},
		) => {
			const skeleton = (
				<Skeleton
					height={options?.height ?? ROW_CONTENT_HEIGHT}
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
					cell(index, 1, ROW_CONTENT_HEIGHT, {
						radius: "rounded",
						center: true,
					}),
			},
			{
				key: "progress",
				header: sortLabels.progress,
				width: pixel(180),
				renderCell: ({ index }) => cell(index, 2, "90%", { radius: "rounded" }),
			},
			{
				key: "size",
				header: sortLabels.size,
				width: pixel(100),
				align: "end",
				renderCell: ({ index }) => cell(index, 3, 64),
			},
			{
				key: "downloadSpeed",
				header: sortLabels.downloadSpeed,
				width: pixel(110),
				align: "end",
				renderCell: ({ index }) => cell(index, 4, 72),
			},
			{
				key: "uploadSpeed",
				header: sortLabels.uploadSpeed,
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
				key: "addedOn",
				header: sortLabels.addedOn,
				width: pixel(140),
				align: "end",
				renderCell: ({ index }) => cell(index, 7, 96),
			},
			{
				key: "savePath",
				header: sortLabels.savePath,
				width: pixel(240),
				renderCell: ({ index }) => cell(index, 8, "70%"),
			},
			{
				key: "actions",
				header: "Действия",
				width: pixel(96),
				align: "center",
				renderCell: ({ index }) =>
					cell(index, 9, 64, { center: true, radius: "rounded" }),
			},
		];
	}, []);

	return (
		<Table
			columns={columns}
			data={data}
			density="compact"
			dividers="grid"
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

function diskFreeIconColor(freeBytes: number): "success" | "warning" | "error" {
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
	const toast = useToast();
	const qbSettingsQuery = useQuery(
		trpc.settings.providers.qbittorrent.get.queryOptions(),
	);
	const isConfigured = Boolean(qbSettingsQuery.data?.isConfigured);

	const freeSpaceQuery = useQuery({
		...trpc.qbittorent.freeSpace.queryOptions(),
		enabled: isConfigured,
		refetchInterval: isConfigured ? 5000 : false,
	});

	const [torrents, setTorrents] = useState<LiveTorrent[]>([]);
	const [search, setSearch] = useState("");
	const [sortKey, setSortKey] = useState<SortKey>("addedOn");
	const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
	const [isLoading, setIsLoading] = useState(true);
	const [isConnected, setIsConnected] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [pendingDelete, setPendingDelete] = useState<TorrentRow | null>(null);

	const pauseMutation = useMutation({
		...trpc.qbittorent.pause.mutationOptions(),
	});
	const resumeMutation = useMutation({
		...trpc.qbittorent.resume.mutationOptions(),
	});
	const deleteMutation = useMutation({
		...trpc.qbittorent.delete.mutationOptions(),
	});

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
				if (handleTrpcUnauthorized(err)) {
					return;
				}
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
					return (
						torrent.name.toLowerCase().includes(query) ||
						torrent.savePath.toLowerCase().includes(query) ||
						torrent.stateLabel.toLowerCase().includes(query)
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
					comparison = left.stateLabel.localeCompare(right.stateLabel, "ru");
					break;
				case "progress":
					comparison = left.progress - right.progress;
					break;
				case "size":
					comparison = left.size - right.size;
					break;
				case "downloadSpeed":
					comparison = left.downloadSpeed - right.downloadSpeed;
					break;
				case "uploadSpeed":
					comparison = left.uploadSpeed - right.uploadSpeed;
					break;
				case "eta":
					comparison = left.etaSeconds - right.etaSeconds;
					break;
				case "addedOn":
					comparison = left.addedOn - right.addedOn;
					break;
				case "savePath":
					comparison = left.savePath.localeCompare(right.savePath, "ru");
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
			key === "name" || key === "state" || key === "savePath" ? "asc" : "desc",
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

	const handleTogglePause = async (item: TorrentRow) => {
		const paused = isTorrentPaused(item.stateKind);
		const snapshot = torrents;
		const next = paused
			? getOptimisticStartedState(item)
			: getOptimisticStoppedState(item);

		setTorrents((current) =>
			current.map((torrent) => {
				if (torrent.id !== item.id) {
					return torrent;
				}
				return {
					...torrent,
					stateKind: next.stateKind as LiveTorrent["stateKind"],
					stateLabel: next.stateLabel,
					downloadSpeed: paused ? torrent.downloadSpeed : 0,
					uploadSpeed: paused ? torrent.uploadSpeed : 0,
				};
			}),
		);

		try {
			if (paused) {
				await resumeMutation.mutateAsync({ id: item.id });
			} else {
				await pauseMutation.mutateAsync({ id: item.id });
			}
		} catch (err) {
			setTorrents(snapshot);
			toast({
				type: "error",
				body:
					err instanceof Error
						? err.message
						: paused
							? "Не удалось продолжить торрент"
							: "Не удалось поставить торрент на паузу",
			});
		}
	};

	const handleConfirmDelete = async () => {
		if (!pendingDelete) {
			return;
		}

		const snapshot = torrents;
		const deletingId = pendingDelete.id;
		setTorrents((current) =>
			current.filter((torrent) => torrent.id !== deletingId),
		);
		setPendingDelete(null);

		try {
			await deleteMutation.mutateAsync({ id: deletingId });
			toast({ body: "Торрент и файлы удалены" });
		} catch (err) {
			setTorrents(snapshot);
			toast({
				type: "error",
				body: err instanceof Error ? err.message : "Не удалось удалить торрент",
			});
		}
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: sortKey/sortDirection drive header icons; action handlers stay current via closure
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
				renderCell: (item) => (
					<Tooltip
						content={
							<Text
								as="div"
								className="max-w-sm whitespace-normal break-all text-surface"
								color="inherit"
								type="inherit"
							>
								{item.name}
							</Text>
						}
						placement="above"
					>
						<Text hasTruncateTooltip={false} maxLines={1} type="body">
							{item.name}
						</Text>
					</Tooltip>
				),
			},
			{
				key: "state",
				header: sortableHeader("state"),
				width: pixel(72),
				align: "center",
				renderCell: (item) => {
					const { icon, color } = getTorrentStateVisual(item.stateKind);
					return (
						<HStack hAlign="center" width="100%">
							<Tooltip content={item.stateLabel} placement="above">
								<Icon
									color={color}
									icon={icon}
									label={item.stateLabel}
									size="sm"
								/>
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
					<TorrentProgressCell name={item.name} progress={item.progress} />
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
				key: "downloadSpeed",
				header: sortableHeader("downloadSpeed"),
				width: pixel(110),
				align: "end",
				renderCell: (item) => (
					<Text hasTabularNumbers type="body">
						{formatSpeed(item.downloadSpeed)}
					</Text>
				),
			},
			{
				key: "uploadSpeed",
				header: sortableHeader("uploadSpeed"),
				width: pixel(110),
				align: "end",
				renderCell: (item) => (
					<Text hasTabularNumbers type="body">
						{formatSpeed(item.uploadSpeed)}
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
						{formatEta(item.etaSeconds)}
					</Text>
				),
			},
			{
				key: "addedOn",
				header: sortableHeader("addedOn"),
				width: pixel(140),
				align: "end",
				renderCell: (item) => (
					<Text hasTabularNumbers type="body">
						{formatAddedOn(item.addedOn)}
					</Text>
				),
			},
			{
				key: "savePath",
				header: sortableHeader("savePath"),
				width: pixel(240),
			},
			{
				key: "actions",
				header: "Действия",
				width: pixel(96),
				align: "center",
				renderCell: (item) => {
					const paused = isTorrentPaused(item.stateKind);
					const pauseLabel = paused ? "Продолжить" : "Пауза";
					return (
						<HStack gap={1} hAlign="center" width="100%">
							<IconButton
								clickAction={() => handleTogglePause(item)}
								icon={paused ? <Play size={16} /> : <Pause size={16} />}
								label={pauseLabel}
								size="sm"
								tooltip={pauseLabel}
								variant="ghost"
							/>
							<IconButton
								icon={<Trash2 size={16} />}
								label="Удалить"
								onClick={() => setPendingDelete(item)}
								size="sm"
								tooltip="Удалить торрент и файлы"
								variant="ghost"
							/>
						</HStack>
					);
				},
			},
		];
	}, [sortKey, sortDirection]);

	const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
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
					<Tooltip
						content="Свободное место на диске неизвестно"
						placement="above"
					>
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
		<>
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
								dividers="grid"
								hasHover
								idKey="id"
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
			<AlertDialog
				actionLabel="Удалить"
				cancelLabel="Отмена"
				description={
					pendingDelete
						? `«${pendingDelete.name}» будет удалён из qBittorrent вместе со скачанными файлами. Это действие нельзя отменить.`
						: ""
				}
				isActionLoading={deleteMutation.isPending}
				isOpen={pendingDelete !== null}
				onAction={handleConfirmDelete}
				onOpenChange={(open) => {
					if (!open) {
						setPendingDelete(null);
					}
				}}
				title="Удалить торрент?"
			/>
		</>
	);
}
