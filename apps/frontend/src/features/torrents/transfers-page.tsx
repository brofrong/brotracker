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
import { useNavigate } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { HardDrive, Pause, Play, Trash2, Wifi, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocale } from "#/shared/i18n/locale-provider";
import {
	formatAddedOn,
	formatBytes,
	formatEta,
	formatProgress,
	formatSpeed,
} from "#/shared/lib/format";
import {
	getOptimisticStartedState,
	getOptimisticStoppedState,
	getTransferStateVisual,
	isTransferPaused,
} from "#/shared/lib/transfer-status";
import { handleTrpcUnauthorized, trpc } from "#/shared/lib/trpc";
import {
	type LiveTransfer,
	subscribeToTransferUpdates,
} from "#/shared/lib/trpc-subscription";
import { TransferProgressBar } from "#/shared/ui/transfer-progress-bar";

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

interface TransferRow extends Record<string, unknown> {
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

function toTransferRow(transfer: LiveTransfer): TransferRow {
	return {
		id: transfer.id,
		name: transfer.name,
		stateKind: transfer.stateKind,
		stateLabel: transfer.stateLabel,
		progress: transfer.progress,
		size: transfer.size,
		downloadSpeed: transfer.downloadSpeed,
		uploadSpeed: transfer.uploadSpeed,
		etaSeconds: transfer.etaSeconds,
		addedOn: transfer.addedOn,
		savePath: transfer.savePath,
	};
}

interface SkeletonRow extends Record<string, unknown> {
	id: string;
	index: number;
}

const SKELETON_ROW_COUNT = 10;
/** Compact table body content height for skeleton rows. */
const ROW_CONTENT_HEIGHT = 20;

function TransferProgressCell({
	name,
	progress,
}: {
	name: string;
	progress: number;
}) {
	const pct = Math.min(100, Math.max(0, progress * 100));
	const isComplete = pct >= 100;

	return (
		<TransferProgressBar
			label={name}
			value={pct}
			valueLabel={formatProgress(progress)}
			variant={isComplete ? "success" : "accent"}
		/>
	);
}

function TransfersTableSkeleton() {
	const { t } = useTranslation("transfers");

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
				header: t("columns.name"),
				width: pixel(320),
				renderCell: ({ index }) => cell(index, 0, "85%"),
			},
			{
				key: "state",
				header: t("columns.state"),
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
				header: t("columns.progress"),
				width: pixel(180),
				renderCell: ({ index }) => cell(index, 2, "90%", { radius: "rounded" }),
			},
			{
				key: "size",
				header: t("columns.size"),
				width: pixel(100),
				align: "end",
				renderCell: ({ index }) => cell(index, 3, 64),
			},
			{
				key: "downloadSpeed",
				header: t("columns.downloadSpeed"),
				width: pixel(110),
				align: "end",
				renderCell: ({ index }) => cell(index, 4, 72),
			},
			{
				key: "uploadSpeed",
				header: t("columns.uploadSpeed"),
				width: pixel(110),
				align: "end",
				renderCell: ({ index }) => cell(index, 5, 72),
			},
			{
				key: "eta",
				header: t("columns.eta"),
				width: pixel(80),
				align: "end",
				renderCell: ({ index }) => cell(index, 6, 40),
			},
			{
				key: "addedOn",
				header: t("columns.addedOn"),
				width: pixel(140),
				align: "end",
				renderCell: ({ index }) => cell(index, 7, 96),
			},
			{
				key: "savePath",
				header: t("columns.savePath"),
				width: pixel(240),
				renderCell: ({ index }) => cell(index, 8, "70%"),
			},
			{
				key: "actions",
				header: t("columns.actions"),
				width: pixel(96),
				align: "center",
				renderCell: ({ index }) =>
					cell(index, 9, 64, { center: true, radius: "rounded" }),
			},
		];
	}, [t]);

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

const GIB = 1024 ** 3;
const DISK_FREE_WARNING_GIB = 500;
const DISK_FREE_CRITICAL_GIB = 200;

function diskFreeIconColor(freeBytes: number): "success" | "warning" | "error" {
	if (freeBytes < DISK_FREE_CRITICAL_GIB * GIB) return "error";
	if (freeBytes < DISK_FREE_WARNING_GIB * GIB) return "warning";
	return "success";
}

function diskFreeTooltip(freeBytes: number, t: TFunction<"transfers">): string {
	const amount = formatBytes(freeBytes);
	if (freeBytes < DISK_FREE_CRITICAL_GIB * GIB) {
		return t("disk.critical", { amount });
	}
	if (freeBytes < DISK_FREE_WARNING_GIB * GIB) {
		return t("disk.warning", { amount });
	}
	return t("disk.ok", { amount });
}

export function TransfersPage() {
	const navigate = useNavigate();
	const toast = useToast();
	const { t } = useTranslation("transfers");
	const { t: tCommon } = useTranslation("common");
	const { bcp47 } = useLocale();
	const qbSettingsQuery = useQuery(
		trpc.settings.providers.qbittorrent.get.queryOptions(),
	);
	const isConfigured = Boolean(qbSettingsQuery.data?.isConfigured);

	const freeSpaceQuery = useQuery({
		...trpc.qbittorent.freeSpace.queryOptions(),
		enabled: isConfigured,
		refetchInterval: isConfigured ? 5000 : false,
	});

	const [transfers, setTransfers] = useState<LiveTransfer[]>([]);
	const [search, setSearch] = useState("");
	const [sortKey, setSortKey] = useState<SortKey>("addedOn");
	const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
	const [isLoading, setIsLoading] = useState(true);
	const [isConnected, setIsConnected] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [pendingDelete, setPendingDelete] = useState<TransferRow | null>(null);

	const pauseMutation = useMutation({
		...trpc.qbittorent.pause.mutationOptions(),
	});
	const pauseAllMutation = useMutation({
		...trpc.qbittorent.pauseAll.mutationOptions(),
	});
	const resumeMutation = useMutation({
		...trpc.qbittorent.resume.mutationOptions(),
	});
	const resumeAllMutation = useMutation({
		...trpc.qbittorent.resumeAll.mutationOptions(),
	});
	const deleteMutation = useMutation({
		...trpc.qbittorent.delete.mutationOptions(),
	});

	const freeSpaceOnDisk = freeSpaceQuery.data?.freeSpaceOnDisk ?? null;

	const sortLabels = useMemo(
		(): Record<SortKey, string> => ({
			name: t("columns.name"),
			state: t("columns.state"),
			progress: t("columns.progress"),
			size: t("columns.size"),
			downloadSpeed: t("columns.downloadSpeed"),
			uploadSpeed: t("columns.uploadSpeed"),
			eta: t("columns.eta"),
			addedOn: t("columns.addedOn"),
			savePath: t("columns.savePath"),
		}),
		[t],
	);

	useEffect(() => {
		if (qbSettingsQuery.isLoading) {
			return;
		}

		if (!isConfigured) {
			setIsLoading(false);
			setIsConnected(false);
			setError(null);
			setTransfers([]);
			return;
		}

		setIsLoading(true);
		const subscription = subscribeToTransferUpdates({
			onData(data) {
				setTransfers(data);
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

	const filteredTransfers = useMemo(() => {
		const query = search.trim().toLowerCase();
		const filtered = query
			? transfers.filter((transfer) => {
					return (
						transfer.name.toLowerCase().includes(query) ||
						transfer.savePath.toLowerCase().includes(query) ||
						transfer.stateLabel.toLowerCase().includes(query)
					);
				})
			: transfers;

		return [...filtered].sort((left, right) => {
			let comparison = 0;

			switch (sortKey) {
				case "name":
					comparison = left.name.localeCompare(right.name, bcp47);
					break;
				case "state":
					comparison = left.stateLabel.localeCompare(right.stateLabel, bcp47);
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
					comparison = left.savePath.localeCompare(right.savePath, bcp47);
					break;
			}

			return sortDirection === "asc" ? comparison : -comparison;
		});
	}, [transfers, search, sortKey, sortDirection, bcp47]);

	const rows = useMemo(
		() => filteredTransfers.map(toTransferRow),
		[filteredTransfers],
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

	const handleTogglePause = async (item: TransferRow) => {
		const paused = isTransferPaused(item.stateKind);
		const snapshot = transfers;
		const next = paused
			? getOptimisticStartedState(item)
			: getOptimisticStoppedState(item);

		setTransfers((current) =>
			current.map((transfer) => {
				if (transfer.id !== item.id) {
					return transfer;
				}
				return {
					...transfer,
					stateKind: next.stateKind as LiveTransfer["stateKind"],
					stateLabel: t(next.stateLabelKey),
					downloadSpeed: paused ? transfer.downloadSpeed : 0,
					uploadSpeed: paused ? transfer.uploadSpeed : 0,
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
			setTransfers(snapshot);
			toast({
				type: "error",
				body:
					err instanceof Error
						? err.message
						: paused
							? t("resumeFailed")
							: t("pauseFailed"),
			});
		}
	};

	const handleConfirmDelete = async () => {
		if (!pendingDelete) {
			return;
		}

		const snapshot = transfers;
		const deletingId = pendingDelete.id;
		setTransfers((current) =>
			current.filter((transfer) => transfer.id !== deletingId),
		);
		setPendingDelete(null);

		try {
			await deleteMutation.mutateAsync({ id: deletingId });
			toast({ body: t("deleted") });
		} catch (err) {
			setTransfers(snapshot);
			toast({
				type: "error",
				body: err instanceof Error ? err.message : t("deleteFailed"),
			});
		}
	};

	const handlePauseAll = async () => {
		const snapshot = transfers;
		setTransfers((current) =>
			current.map((transfer) => {
				const next = getOptimisticStoppedState(transfer);
				return {
					...transfer,
					stateKind: next.stateKind as LiveTransfer["stateKind"],
					stateLabel: t(next.stateLabelKey),
					downloadSpeed: 0,
					uploadSpeed: 0,
				};
			}),
		);

		try {
			await pauseAllMutation.mutateAsync();
		} catch (err) {
			setTransfers(snapshot);
			toast({
				type: "error",
				body: err instanceof Error ? err.message : t("pauseAllFailed"),
			});
		}
	};

	const handleResumeAll = async () => {
		const snapshot = transfers;
		setTransfers((current) =>
			current.map((transfer) => {
				const next = getOptimisticStartedState(transfer);
				return {
					...transfer,
					stateKind: next.stateKind as LiveTransfer["stateKind"],
					stateLabel: t(next.stateLabelKey),
				};
			}),
		);

		try {
			await resumeAllMutation.mutateAsync();
		} catch (err) {
			setTransfers(snapshot);
			toast({
				type: "error",
				body: err instanceof Error ? err.message : t("resumeAllFailed"),
			});
		}
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: sortKey/sortDirection drive header icons; action handlers stay current via closure
	const columns = useMemo((): TableColumn<TransferRow>[] => {
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
					const { icon, color } = getTransferStateVisual(item.stateKind);
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
					<TransferProgressCell name={item.name} progress={item.progress} />
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
						{formatAddedOn(item.addedOn, bcp47)}
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
				header: t("columns.actions"),
				width: pixel(96),
				align: "center",
				renderCell: (item) => {
					const paused = isTransferPaused(item.stateKind);
					const actionLabel = paused ? t("resume") : t("pause");
					return (
						<HStack gap={1} hAlign="center" width="100%">
							<IconButton
								clickAction={() => handleTogglePause(item)}
								icon={
									paused ? (
										<Icon color="warning" icon={Pause} size="sm" />
									) : (
										<Icon color="success" icon={Play} size="sm" />
									)
								}
								label={actionLabel}
								size="sm"
								tooltip={actionLabel}
								variant="ghost"
							/>
							<IconButton
								icon={<Icon color="error" icon={Trash2} size="sm" />}
								label={t("delete")}
								onClick={() => setPendingDelete(item)}
								size="sm"
								tooltip={t("deleteTooltip")}
								variant="ghost"
							/>
						</HStack>
					);
				},
			},
		];
	}, [sortKey, sortDirection, sortLabels, t, bcp47]);

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
		? t("connection.none")
		: isConnected
			? t("connection.live")
			: error
				? t("connection.error")
				: t("connection.none");

	const connectionTooltip = !isConfigured
		? t("connection.notConfiguredTooltip")
		: isConnected
			? t("connection.liveTooltip")
			: error
				? t("connection.errorTooltip")
				: t("connection.waitingTooltip");

	const connectionIconColor =
		connectionStatus === "success"
			? "success"
			: connectionStatus === "error"
				? "error"
				: "tertiary";

	const pageHeader = (
		<LayoutHeader className="bg-body" hasDivider padding={4}>
			<HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
				<Heading level={1}>{t("title")}</Heading>
				{isConfigured ? (
					<TextInput
						hasClear
						isLabelHidden
						label={t("searchLabel")}
						onChange={setSearch}
						placeholder={t("searchPlaceholder")}
						startIcon="search"
						value={search}
						width={320}
					/>
				) : null}
			</HStack>
		</LayoutHeader>
	);

	const diskUnknown = t("disk.unknown");
	const freeSpaceTooltip =
		freeSpaceOnDisk != null ? diskFreeTooltip(freeSpaceOnDisk, t) : diskUnknown;

	const pageFooter = (
		<LayoutFooter className="bg-body" hasDivider padding={4}>
			<HStack gap={4} hAlign="between" vAlign="center" wrap="wrap">
				<HStack gap={3} vAlign="center">
					{freeSpaceOnDisk != null ? (
						<Tooltip content={freeSpaceTooltip} placement="above">
							<HStack gap={1.5} vAlign="center">
								<Icon
									color={diskFreeIconColor(freeSpaceOnDisk)}
									icon={HardDrive}
									label={freeSpaceTooltip}
									size="sm"
								/>
								<Text hasTabularNumbers type="supporting">
									{formatBytes(freeSpaceOnDisk)}
								</Text>
							</HStack>
						</Tooltip>
					) : (
						<Tooltip content={diskUnknown} placement="above">
							<Icon
								color="tertiary"
								icon={HardDrive}
								label={diskUnknown}
								size="sm"
							/>
						</Tooltip>
					)}
					{isConfigured ? (
						<HStack gap={1} vAlign="center">
							<IconButton
								clickAction={handlePauseAll}
								icon={<Icon color="warning" icon={Pause} size="sm" />}
								label={t("pauseAll")}
								size="sm"
								tooltip={t("pauseAll")}
								variant="ghost"
							/>
							<IconButton
								clickAction={handleResumeAll}
								icon={<Icon color="success" icon={Play} size="sm" />}
								label={t("resumeAll")}
								size="sm"
								tooltip={t("resumeAll")}
								variant="ghost"
							/>
						</HStack>
					) : null}
				</HStack>
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
						<TransfersTableSkeleton />
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
								description={t("notConfiguredDescription")}
								endContent={
									<Button
										label={tCommon("openSettings")}
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
								title={t("notConfiguredTitle")}
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
						{isLoading ? <TransfersTableSkeleton /> : null}

						{error ? (
							<Section padding={4} variant="transparent">
								<Banner
									container="section"
									description={error}
									status="error"
									title={t("loadFailed")}
								/>
							</Section>
						) : null}

						{!isLoading && !error && rows.length === 0 ? (
							<EmptyState
								description={
									search.trim() ? t("emptyFilteredDescription") : undefined
								}
								title={
									search.trim() ? t("emptyFilteredTitle") : t("emptyTitle")
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
				actionLabel={t("deleteDialog.action")}
				cancelLabel={t("deleteDialog.cancel")}
				description={
					pendingDelete
						? t("deleteDialog.description", { name: pendingDelete.name })
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
				title={t("deleteDialog.title")}
			/>
		</>
	);
}
