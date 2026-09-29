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
import { Link } from "@astryxdesign/core/Link";
import { Section } from "@astryxdesign/core/Section";
import {
	SegmentedControl,
	SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { HStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import {
	pixel,
	proportional,
	resolveContextActions,
	Table,
	type TableColumn,
	type TableContextAction,
	type TablePlugin,
	useTableColumnResize,
	useTableSelection,
	useTableSelectionState,
} from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useToast } from "@astryxdesign/core/Toast";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import {
	ArrowDown,
	ArrowUp,
	Clapperboard,
	HardDrive,
	Link2,
	Pause,
	Play,
	Trash2,
	Wifi,
	WifiOff,
} from "lucide-react";
import {
	type ComponentPropsWithoutRef,
	forwardRef,
	useEffect,
	useLayoutEffect,
	useMemo,
	useState,
} from "react";
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
	getTransferBucket,
	getTransferStatusDot,
	isTransferPaused,
	TRANSFER_BUCKETS,
	type TransferBucket,
	transferStateLabelKey,
} from "#/shared/lib/transfer-status";
import { handleTrpcUnauthorized, trpc } from "#/shared/lib/trpc";
import {
	type LiveTransfer,
	subscribeToTransferUpdates,
} from "#/shared/lib/trpc-subscription";
import { TransferProgressBar } from "#/shared/ui/transfer-progress-bar";
import { LinkTitleDialog, type LinkTitleTarget } from "./link-title-dialog";

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

type BucketFilter = "all" | TransferBucket;

type PauseAction = "pause" | "resume";

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
	titleId: string | null;
}

interface PendingDelete {
	ids: string[];
	/** Set for a single torrent; bulk deletes show a count instead. */
	name: string | null;
}

function toTransferRow(
	transfer: LiveTransfer,
	t: TFunction<"transfers">,
	titleId: string | null,
): TransferRow {
	return {
		id: transfer.id,
		name: transfer.name,
		stateKind: transfer.stateKind,
		stateLabel: t(transferStateLabelKey(transfer.stateKind)),
		progress: transfer.progress,
		size: transfer.size,
		downloadSpeed: transfer.downloadSpeed,
		uploadSpeed: transfer.uploadSpeed,
		etaSeconds: transfer.etaSeconds,
		addedOn: transfer.addedOn,
		savePath: transfer.savePath,
		titleId,
	};
}

interface SkeletonRow extends Record<string, unknown> {
	id: string;
	index: number;
}

const SKELETON_ROW_COUNT = 10;
/** Compact table body content height for skeleton rows. */
const ROW_CONTENT_HEIGHT = 20;

/** Column widths shared by the live table and its skeleton; name takes the rest. */
const COLUMN_WIDTHS = {
	name: proportional(1),
	state: pixel(132),
	progress: pixel(150),
	size: pixel(96),
	downloadSpeed: pixel(104),
	uploadSpeed: pixel(104),
	eta: pixel(72),
	addedOn: pixel(148),
	savePath: pixel(160),
	actions: pixel(80),
} as const;

/** Starting width of the fixed (non-name) columns plus the 36px selection column. */
const FIXED_COLUMNS_WIDTH =
	36 +
	Object.entries(COLUMN_WIDTHS).reduce(
		(sum, [key, width]) =>
			key !== "name" && width.type === "pixel" ? sum + width.value : sum,
		0,
	);
const NAME_MIN_WIDTH = 240;
/** Room for 1px grid dividers so the default layout never scrolls sideways. */
const CELL_BORDERS_SLACK = 16;

/**
 * Trailing empty column that absorbs leftover space. Every real column has a
 * pixel width, so resizing one column never squeezes its neighbours — the
 * spacer shrinks instead, and the table scrolls once it reaches zero.
 */
const SPACER_COLUMN_KEY = "spacer";
/** Checkbox column injected by the Astryx selection plugin. */
const SELECTION_COLUMN_KEY = "__xds_selection";

/** Fallback minimum when a header has not been measured yet. */
const DEFAULT_HEADER_MIN_WIDTH = 64;

/** Natural width of a header cell's content (sort button or plain label) plus padding. */
function measureHeaderMinWidth(th: HTMLTableCellElement): number {
	const style = getComputedStyle(th);
	const padding =
		Number.parseFloat(style.paddingLeft) +
		Number.parseFloat(style.paddingRight);
	const button = th.querySelector("button");
	let content = 0;
	if (button) {
		// A narrowed column truncates the label: add back whatever is clipped.
		let clipped = 0;
		for (const el of button.querySelectorAll<HTMLElement>("*")) {
			clipped = Math.max(clipped, el.scrollWidth - el.clientWidth);
		}
		content = button.getBoundingClientRect().width + clipped;
	} else {
		const range = document.createRange();
		const walker = document.createTreeWalker(th, NodeFilter.SHOW_TEXT);
		const text = walker.nextNode();
		if (text) {
			range.selectNodeContents(text);
			content = range.getBoundingClientRect().width;
		}
	}
	return content > 0
		? Math.ceil(content + padding) + 2
		: DEFAULT_HEADER_MIN_WIDTH;
}

const TitleRouterLink = forwardRef<
	HTMLAnchorElement,
	ComponentPropsWithoutRef<"a"> & { href?: string }
>(function TitleRouterLink({ href, ...props }, ref) {
	return <RouterLink ref={ref} to={href ?? "/"} {...props} />;
});

function titleHref(titleId: string): string {
	return `/title/${encodeURIComponent(titleId)}`;
}

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

function TransferStatusCell({
	stateKind,
	stateLabel,
}: {
	stateKind: string;
	stateLabel: string;
}) {
	const { variant, isPulsing } = getTransferStatusDot(stateKind);
	return (
		<HStack gap={2} vAlign="center">
			<StatusDot isPulsing={isPulsing} label={stateLabel} variant={variant} />
			<Text hasTruncateTooltip={false} maxLines={1} type="body">
				{stateLabel}
			</Text>
		</HStack>
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
				width: COLUMN_WIDTHS.name,
				renderCell: ({ index }) => cell(index, 0, "85%"),
			},
			{
				key: "state",
				header: t("columns.state"),
				width: COLUMN_WIDTHS.state,
				renderCell: ({ index }) => cell(index, 1, 88),
			},
			{
				key: "progress",
				header: t("columns.progress"),
				width: COLUMN_WIDTHS.progress,
				renderCell: ({ index }) => cell(index, 2, "90%", { radius: "rounded" }),
			},
			{
				key: "size",
				header: t("columns.size"),
				width: COLUMN_WIDTHS.size,
				align: "end",
				renderCell: ({ index }) => cell(index, 3, 64),
			},
			{
				key: "downloadSpeed",
				header: t("columns.downloadSpeed"),
				width: COLUMN_WIDTHS.downloadSpeed,
				align: "end",
				renderCell: ({ index }) => cell(index, 4, 72),
			},
			{
				key: "uploadSpeed",
				header: t("columns.uploadSpeed"),
				width: COLUMN_WIDTHS.uploadSpeed,
				align: "end",
				renderCell: ({ index }) => cell(index, 5, 72),
			},
			{
				key: "eta",
				header: t("columns.eta"),
				width: COLUMN_WIDTHS.eta,
				align: "end",
				renderCell: ({ index }) => cell(index, 6, 40),
			},
			{
				key: "addedOn",
				header: t("columns.addedOn"),
				width: COLUMN_WIDTHS.addedOn,
				align: "end",
				renderCell: ({ index }) => cell(index, 7, 96),
			},
			{
				key: "savePath",
				header: t("columns.savePath"),
				width: COLUMN_WIDTHS.savePath,
				renderCell: ({ index }) => cell(index, 8, "70%"),
			},
			{
				key: "actions",
				header: t("columns.actions"),
				width: COLUMN_WIDTHS.actions,
				align: "center",
				renderCell: ({ index }) =>
					cell(index, 9, 56, { center: true, radius: "rounded" }),
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

	const transferLinksQuery = useQuery({
		...trpc.title.transferLinks.queryOptions(),
		enabled: isConfigured,
		refetchInterval: isConfigured ? 30_000 : false,
	});

	const [transfers, setTransfers] = useState<LiveTransfer[]>([]);
	const [search, setSearch] = useState("");
	const [bucketFilter, setBucketFilter] = useState<BucketFilter>("all");
	const [sortKey, setSortKey] = useState<SortKey>("addedOn");
	const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
	const [isLoading, setIsLoading] = useState(true);
	const [isConnected, setIsConnected] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(
		null,
	);
	const [linkTarget, setLinkTarget] = useState<LinkTitleTarget | null>(null);
	const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
		() => new Set(),
	);

	const pauseMutation = useMutation({
		...trpc.qbittorent.pause.mutationOptions(),
	});
	const pauseManyMutation = useMutation({
		...trpc.qbittorent.pauseMany.mutationOptions(),
	});
	const pauseAllMutation = useMutation({
		...trpc.qbittorent.pauseAll.mutationOptions(),
	});
	const resumeMutation = useMutation({
		...trpc.qbittorent.resume.mutationOptions(),
	});
	const resumeManyMutation = useMutation({
		...trpc.qbittorent.resumeMany.mutationOptions(),
	});
	const resumeAllMutation = useMutation({
		...trpc.qbittorent.resumeAll.mutationOptions(),
	});
	const deleteMutation = useMutation({
		...trpc.qbittorent.delete.mutationOptions(),
	});
	const deleteManyMutation = useMutation({
		...trpc.qbittorent.deleteMany.mutationOptions(),
	});

	const freeSpaceOnDisk = freeSpaceQuery.data?.freeSpaceOnDisk ?? null;
	const titleLinks = transferLinksQuery.data?.links;

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

	// Drop selected ids that are no longer in qBittorrent.
	useEffect(() => {
		setSelectedKeys((current) => {
			if (current.size === 0) {
				return current;
			}
			const liveIds = new Set(transfers.map((transfer) => transfer.id));
			const next = new Set([...current].filter((id) => liveIds.has(id)));
			return next.size === current.size ? current : next;
		});
	}, [transfers]);

	const allRows = useMemo(
		() =>
			transfers.map((transfer) =>
				toTransferRow(transfer, t, titleLinks?.[transfer.id] ?? null),
			),
		[transfers, t, titleLinks],
	);

	const searchedRows = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!query) {
			return allRows;
		}
		return allRows.filter(
			(row) =>
				row.name.toLowerCase().includes(query) ||
				row.savePath.toLowerCase().includes(query) ||
				row.stateLabel.toLowerCase().includes(query),
		);
	}, [allRows, search]);

	const bucketCounts = useMemo(() => {
		const counts: Record<TransferBucket, number> = {
			downloading: 0,
			seeding: 0,
			paused: 0,
			error: 0,
		};
		for (const row of searchedRows) {
			counts[getTransferBucket(row.stateKind)] += 1;
		}
		return counts;
	}, [searchedRows]);

	const rows = useMemo(() => {
		const filtered =
			bucketFilter === "all"
				? searchedRows
				: searchedRows.filter(
						(row) => getTransferBucket(row.stateKind) === bucketFilter,
					);

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
	}, [searchedRows, bucketFilter, sortKey, sortDirection, bcp47]);

	const totals = useMemo(
		() =>
			transfers.reduce(
				(acc, transfer) => ({
					downloadSpeed: acc.downloadSpeed + transfer.downloadSpeed,
					uploadSpeed: acc.uploadSpeed + transfer.uploadSpeed,
				}),
				{ downloadSpeed: 0, uploadSpeed: 0 },
			),
		[transfers],
	);

	const { selectionConfig } = useTableSelectionState<TransferRow>({
		data: rows,
		idKey: "id",
		selectedKeys,
		setSelectedKeys,
	});
	const selection = useTableSelection<TransferRow>({
		...selectionConfig,
		getRowLabel: (item) => item.name,
	});
	const selectedIds = [...selectedKeys];

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

	/**
	 * Optimistically pause/resume `ids` (or every torrent), then call qBittorrent;
	 * rolls back to the snapshot and toasts on failure.
	 */
	const runPauseAction = async (action: PauseAction, ids: string[] | "all") => {
		const snapshot = transfers;
		const targets = ids === "all" ? null : new Set(ids);

		setTransfers((current) =>
			current.map((transfer) => {
				if (targets && !targets.has(transfer.id)) {
					return transfer;
				}
				const stateKind =
					action === "pause"
						? getOptimisticStoppedState(transfer)
						: getOptimisticStartedState(transfer);
				return {
					...transfer,
					stateKind: stateKind as LiveTransfer["stateKind"],
					...(action === "pause" ? { downloadSpeed: 0, uploadSpeed: 0 } : {}),
				};
			}),
		);

		try {
			if (ids === "all") {
				await (action === "pause"
					? pauseAllMutation.mutateAsync()
					: resumeAllMutation.mutateAsync());
			} else if (ids.length === 1 && ids[0]) {
				await (action === "pause"
					? pauseMutation.mutateAsync({ id: ids[0] })
					: resumeMutation.mutateAsync({ id: ids[0] }));
			} else {
				await (action === "pause"
					? pauseManyMutation.mutateAsync({ ids })
					: resumeManyMutation.mutateAsync({ ids }));
			}
		} catch (err) {
			setTransfers(snapshot);
			const fallback =
				ids === "all"
					? action === "pause"
						? t("pauseAllFailed")
						: t("resumeAllFailed")
					: ids.length > 1
						? action === "pause"
							? t("selection.pauseFailed")
							: t("selection.resumeFailed")
						: action === "pause"
							? t("pauseFailed")
							: t("resumeFailed");
			toast({
				type: "error",
				body: err instanceof Error ? err.message : fallback,
			});
		}
	};

	const handleTogglePause = (item: TransferRow) =>
		runPauseAction(isTransferPaused(item.stateKind) ? "resume" : "pause", [
			item.id,
		]);

	const handleConfirmDelete = async () => {
		if (!pendingDelete) {
			return;
		}

		const { ids } = pendingDelete;
		const snapshot = transfers;
		const deleting = new Set(ids);
		setTransfers((current) =>
			current.filter((transfer) => !deleting.has(transfer.id)),
		);
		setSelectedKeys((current) => {
			const next = new Set([...current].filter((id) => !deleting.has(id)));
			return next.size === current.size ? current : next;
		});
		setPendingDelete(null);

		try {
			if (ids.length === 1 && ids[0]) {
				await deleteMutation.mutateAsync({ id: ids[0] });
				toast({ body: t("deleted") });
			} else {
				await deleteManyMutation.mutateAsync({ ids });
				toast({ body: t("selection.deleted", { count: ids.length }) });
			}
		} catch (err) {
			setTransfers(snapshot);
			toast({
				type: "error",
				body:
					err instanceof Error
						? err.message
						: ids.length > 1
							? t("selection.deleteFailed")
							: t("deleteFailed"),
			});
		}
	};

	const requestDeleteSelected = () => {
		if (selectedIds.length > 0) {
			setPendingDelete({ ids: selectedIds, name: null });
		}
	};

	const openTitle = (titleId: string) =>
		void navigate({ to: "/title/$id", params: { id: titleId } });

	const rowActions = (item: TransferRow): TableContextAction[] => {
		// Right-clicking a row that is part of a multi-selection acts on the selection.
		if (selectedKeys.size > 1 && selectedKeys.has(item.id)) {
			const count = selectedKeys.size;
			return [
				{
					id: "pause-selected",
					label: t("menu.pauseSelected", { count }),
					icon: <Icon color="warning" icon={Pause} size="sm" />,
					onSelect: () => void runPauseAction("pause", selectedIds),
					group: "transfer",
				},
				{
					id: "resume-selected",
					label: t("menu.resumeSelected", { count }),
					icon: <Icon color="success" icon={Play} size="sm" />,
					onSelect: () => void runPauseAction("resume", selectedIds),
					group: "transfer",
				},
				{
					id: "delete-selected",
					label: t("menu.deleteSelected", { count }),
					icon: <Icon color="error" icon={Trash2} size="sm" />,
					onSelect: requestDeleteSelected,
					group: "danger",
				},
			];
		}

		const paused = isTransferPaused(item.stateKind);
		const titleId = item.titleId;
		return [
			{
				id: "toggle-pause",
				label: paused ? t("resume") : t("pause"),
				icon: paused ? (
					<Icon color="success" icon={Play} size="sm" />
				) : (
					<Icon color="warning" icon={Pause} size="sm" />
				),
				onSelect: () => void handleTogglePause(item),
				group: "transfer",
			},
			...(titleId
				? [
						{
							id: "open-title",
							label: t("menu.openTitle"),
							icon: <Icon icon={Clapperboard} size="sm" />,
							onSelect: () => openTitle(titleId),
							group: "title",
						},
					]
				: []),
			{
				id: "link-title",
				label: titleId ? t("menu.relinkTitle") : t("menu.linkTitle"),
				icon: <Icon icon={Link2} size="sm" />,
				onSelect: () => setLinkTarget({ hash: item.id, name: item.name }),
				group: "title",
			},
			{
				id: "delete",
				label: t("delete"),
				icon: <Icon color="error" icon={Trash2} size="sm" />,
				onSelect: () => setPendingDelete({ ids: [item.id], name: item.name }),
				group: "danger",
			},
		];
	};

	const rowContextMenu: TablePlugin<TransferRow> = {
		transformBodyCell: (props, column, item) =>
			// The checkbox and spacer cells stay plain: the menu wrapper adds cell
			// padding, which pushes the checkbox off-centre.
			column.key === SELECTION_COLUMN_KEY || column.key === SPACER_COLUMN_KEY
				? props
				: {
						...props,
						contextMenuActions: () => [
							...resolveContextActions(props.contextMenuActions),
							...rowActions(item),
						],
					},
	};

	const [tableElement, setTableElement] = useState<HTMLTableElement | null>(
		null,
	);
	const [viewportWidth, setViewportWidth] = useState(0);
	const [headerMinWidths, setHeaderMinWidths] = useState<
		Record<string, number>
	>({});
	const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

	// Track the visible width of the table's scroll container so the name
	// column can fill the screen until the user resizes it.
	useEffect(() => {
		const viewport = tableElement?.parentElement;
		if (!viewport) {
			return;
		}
		const observer = new ResizeObserver(([entry]) => {
			if (entry) {
				setViewportWidth(entry.contentRect.width);
			}
		});
		observer.observe(viewport);
		return () => observer.disconnect();
	}, [tableElement]);

	// A column can't be resized narrower than its header button.
	// biome-ignore lint/correctness/useExhaustiveDependencies: header text changes with the locale (t)
	useLayoutEffect(() => {
		if (!tableElement) {
			return;
		}
		const mins: Record<string, number> = {};
		for (const th of tableElement.querySelectorAll<HTMLTableCellElement>(
			"th[data-column-key]",
		)) {
			const key = th.getAttribute("data-column-key");
			if (key && key !== SPACER_COLUMN_KEY && key !== SELECTION_COLUMN_KEY) {
				mins[key] = measureHeaderMinWidth(th);
			}
		}
		setHeaderMinWidths(mins);
	}, [tableElement, t]);

	const nameWidth = Math.max(
		NAME_MIN_WIDTH,
		headerMinWidths.name ?? 0,
		Math.floor(viewportWidth - FIXED_COLUMNS_WIDTH - CELL_BORDERS_SLACK),
	);

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
				width: pixel(nameWidth),
				renderCell: (item) => {
					const nameTooltip = (
						<Text
							as="div"
							className="max-w-sm whitespace-normal break-all text-surface"
							color="inherit"
							type="inherit"
						>
							{item.name}
						</Text>
					);
					return (
						<Tooltip content={nameTooltip} placement="above">
							{item.titleId ? (
								<Link
									as={TitleRouterLink}
									href={titleHref(item.titleId)}
									maxLines={1}
									type="body"
								>
									{item.name}
								</Link>
							) : (
								<Text hasTruncateTooltip={false} maxLines={1} type="body">
									{item.name}
								</Text>
							)}
						</Tooltip>
					);
				},
			},
			{
				key: "state",
				header: sortableHeader("state"),
				width: COLUMN_WIDTHS.state,
				renderCell: (item) => (
					<TransferStatusCell
						stateKind={item.stateKind}
						stateLabel={item.stateLabel}
					/>
				),
			},
			{
				key: "progress",
				header: sortableHeader("progress"),
				width: COLUMN_WIDTHS.progress,
				renderCell: (item) => (
					<TransferProgressCell name={item.name} progress={item.progress} />
				),
			},
			{
				key: "size",
				header: sortableHeader("size"),
				width: COLUMN_WIDTHS.size,
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
				width: COLUMN_WIDTHS.downloadSpeed,
				align: "end",
				renderCell: (item) => (
					<Text
						color={item.downloadSpeed > 0 ? "primary" : "secondary"}
						hasTabularNumbers
						type="body"
					>
						{formatSpeed(item.downloadSpeed)}
					</Text>
				),
			},
			{
				key: "uploadSpeed",
				header: sortableHeader("uploadSpeed"),
				width: COLUMN_WIDTHS.uploadSpeed,
				align: "end",
				renderCell: (item) => (
					<Text
						color={item.uploadSpeed > 0 ? "primary" : "secondary"}
						hasTabularNumbers
						type="body"
					>
						{formatSpeed(item.uploadSpeed)}
					</Text>
				),
			},
			{
				key: "eta",
				header: sortableHeader("eta"),
				width: COLUMN_WIDTHS.eta,
				align: "end",
				renderCell: (item) => (
					<Text hasTabularNumbers type="body">
						{formatEta(item.etaSeconds, bcp47)}
					</Text>
				),
			},
			{
				key: "addedOn",
				header: sortableHeader("addedOn"),
				width: COLUMN_WIDTHS.addedOn,
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
				width: COLUMN_WIDTHS.savePath,
			},
			{
				key: "actions",
				header: t("columns.actions"),
				width: COLUMN_WIDTHS.actions,
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
										<Icon color="success" icon={Play} size="sm" />
									) : (
										<Icon color="warning" icon={Pause} size="sm" />
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
								onClick={() =>
									setPendingDelete({ ids: [item.id], name: item.name })
								}
								size="sm"
								tooltip={t("deleteTooltip")}
								variant="ghost"
							/>
						</HStack>
					);
				},
			},
			{
				key: SPACER_COLUMN_KEY,
				header: null,
				width: proportional(1, { minWidth: 0 }),
				renderCell: () => null,
			},
		];
	}, [sortKey, sortDirection, sortLabels, t, bcp47, nameWidth]);

	// The resize plugin reads per-column minimums from the declared pixel
	// widths of the columns it is given, so hand it the measured header widths.
	const resizeColumns = useMemo(
		() =>
			columns.map((column) =>
				column.key === SPACER_COLUMN_KEY
					? column
					: {
							...column,
							width: pixel(
								headerMinWidths[column.key] ?? DEFAULT_HEADER_MIN_WIDTH,
							),
						},
			),
		[columns, headerMinWidths],
	);

	const columnResize = useTableColumnResize<TransferRow>({
		columnWidths,
		// The config is typed for untyped rows; it only reads keys and widths.
		columns: resizeColumns as unknown as TableColumn<Record<string, unknown>>[],
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
		<LayoutHeader className="bg-body" hasDivider padding={3}>
			<HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
				<Heading level={1}>{t("title")}</Heading>
				{isConfigured ? (
					<HStack gap={3} vAlign="center" wrap="wrap">
						<SegmentedControl
							label={t("filters.label")}
							onChange={(value) => setBucketFilter(value as BucketFilter)}
							size="sm"
							value={bucketFilter}
						>
							<SegmentedControlItem
								label={`${t("filters.all")} ${searchedRows.length}`}
								value="all"
							/>
							{TRANSFER_BUCKETS.map((bucket) => (
								<SegmentedControlItem
									key={bucket}
									label={`${t(`filters.${bucket}`)} ${bucketCounts[bucket]}`}
									value={bucket}
								/>
							))}
						</SegmentedControl>
						<TextInput
							hasClear
							isLabelHidden
							label={t("searchLabel")}
							onChange={setSearch}
							placeholder={t("searchPlaceholder")}
							size="sm"
							startIcon="search"
							value={search}
							width={280}
						/>
					</HStack>
				) : null}
			</HStack>
		</LayoutHeader>
	);

	const diskUnknown = t("disk.unknown");
	const freeSpaceTooltip =
		freeSpaceOnDisk != null ? diskFreeTooltip(freeSpaceOnDisk, t) : diskUnknown;

	const selectionBar = (
		<HStack gap={2} vAlign="center">
			<Text hasTabularNumbers type="supporting">
				{t("selection.selected", { count: selectedKeys.size })}
			</Text>
			<Button
				label={t("selection.pause")}
				onClick={() => void runPauseAction("pause", selectedIds)}
				size="sm"
				icon={<Icon color="warning" icon={Pause} size="sm" />}
				variant="ghost"
			/>
			<Button
				label={t("selection.resume")}
				onClick={() => void runPauseAction("resume", selectedIds)}
				size="sm"
				icon={<Icon color="success" icon={Play} size="sm" />}
				variant="ghost"
			/>
			<Button
				label={t("selection.delete")}
				onClick={requestDeleteSelected}
				size="sm"
				icon={<Icon color="error" icon={Trash2} size="sm" />}
				variant="ghost"
			/>
			<Button
				label={t("selection.clear")}
				onClick={() => setSelectedKeys(new Set())}
				size="sm"
				variant="ghost"
			/>
		</HStack>
	);

	const summary = (
		<HStack gap={3} vAlign="center">
			<Text hasTabularNumbers type="supporting">
				{t("summary.count", { count: transfers.length })}
			</Text>
			<Tooltip content={t("summary.downloadSpeed")} placement="above">
				<HStack gap={1} vAlign="center">
					<Icon
						color="accent"
						icon={ArrowDown}
						label={t("summary.downloadSpeed")}
						size="sm"
					/>
					<Text hasTabularNumbers type="supporting">
						{formatSpeed(totals.downloadSpeed)}
					</Text>
				</HStack>
			</Tooltip>
			<Tooltip content={t("summary.uploadSpeed")} placement="above">
				<HStack gap={1} vAlign="center">
					<Icon
						color="success"
						icon={ArrowUp}
						label={t("summary.uploadSpeed")}
						size="sm"
					/>
					<Text hasTabularNumbers type="supporting">
						{formatSpeed(totals.uploadSpeed)}
					</Text>
				</HStack>
			</Tooltip>
		</HStack>
	);

	const pageFooter = (
		<LayoutFooter className="bg-body" hasDivider padding={3}>
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
								clickAction={() => runPauseAction("pause", "all")}
								icon={<Icon color="warning" icon={Pause} size="sm" />}
								label={t("pauseAll")}
								size="sm"
								tooltip={t("pauseAll")}
								variant="ghost"
							/>
							<IconButton
								clickAction={() => runPauseAction("resume", "all")}
								icon={<Icon color="success" icon={Play} size="sm" />}
								label={t("resumeAll")}
								size="sm"
								tooltip={t("resumeAll")}
								variant="ghost"
							/>
						</HStack>
					) : null}
					{isConfigured
						? selectedKeys.size > 0
							? selectionBar
							: summary
						: null}
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

	const isFiltered = search.trim().length > 0 || bucketFilter !== "all";

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
									isFiltered ? t("emptyFilteredDescription") : undefined
								}
								title={isFiltered ? t("emptyFilteredTitle") : t("emptyTitle")}
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
								plugins={{ selection, columnResize, rowContextMenu }}
								ref={setTableElement}
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
						? pendingDelete.name !== null
							? t("deleteDialog.description", { name: pendingDelete.name })
							: t("selection.deleteDialogDescription", {
									count: pendingDelete.ids.length,
								})
						: ""
				}
				isActionLoading={
					deleteMutation.isPending || deleteManyMutation.isPending
				}
				isOpen={pendingDelete !== null}
				onAction={handleConfirmDelete}
				onOpenChange={(open) => {
					if (!open) {
						setPendingDelete(null);
					}
				}}
				title={
					pendingDelete && pendingDelete.name === null
						? t("selection.deleteDialogTitle")
						: t("deleteDialog.title")
				}
			/>
			<LinkTitleDialog
				onOpenChange={(open) => {
					if (!open) {
						setLinkTarget(null);
					}
				}}
				target={linkTarget}
			/>
		</>
	);
}
