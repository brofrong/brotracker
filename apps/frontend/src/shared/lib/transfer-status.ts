import {
	Ban,
	CircleAlert,
	CircleHelp,
	Clock,
	Download,
	FileX,
	FolderInput,
	HardDrive,
	LoaderCircle,
	Pause,
	RefreshCw,
	Upload,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

export type TransferStatusIconColor =
	| "success"
	| "warning"
	| "error"
	| "accent"
	| "tertiary";

type TransferStateVisual = {
	icon: ComponentType<SVGProps<SVGSVGElement>>;
	color: TransferStatusIconColor;
};

const transferStateVisuals: Record<string, TransferStateVisual> = {
	error: { icon: CircleAlert, color: "error" },
	missingFiles: { icon: FileX, color: "error" },
	uploading: { icon: Upload, color: "success" },
	pausedUP: { icon: Pause, color: "warning" },
	stoppedUP: { icon: Pause, color: "warning" },
	queuedUP: { icon: Clock, color: "accent" },
	stalledUP: { icon: Ban, color: "warning" },
	checkingUP: { icon: RefreshCw, color: "success" },
	forcedUP: { icon: Upload, color: "success" },
	allocating: { icon: HardDrive, color: "tertiary" },
	downloading: { icon: Download, color: "accent" },
	metaDL: { icon: Download, color: "accent" },
	pausedDL: { icon: Pause, color: "warning" },
	stoppedDL: { icon: Pause, color: "warning" },
	queuedDL: { icon: Clock, color: "accent" },
	stalledDL: { icon: Ban, color: "warning" },
	checkingDL: { icon: RefreshCw, color: "accent" },
	forcedDL: { icon: Download, color: "accent" },
	checkingResumeData: { icon: LoaderCircle, color: "tertiary" },
	moving: { icon: FolderInput, color: "tertiary" },
	unknown: { icon: CircleHelp, color: "tertiary" },
};

const fallbackVisual: TransferStateVisual = {
	icon: CircleHelp,
	color: "tertiary",
};

export function getTransferStateVisual(state: string): TransferStateVisual {
	return transferStateVisuals[state] ?? fallbackVisual;
}

/** Whether the Transfer is paused/stopped (download or seeding). */
export function isTransferPaused(stateKind: string): boolean {
	return (
		stateKind === "pausedDL" ||
		stateKind === "pausedUP" ||
		stateKind === "stoppedDL" ||
		stateKind === "stoppedUP"
	);
}

function isSeedingLike(transfer: {
	progress: number;
	stateKind: string;
}): boolean {
	return (
		transfer.progress >= 1 ||
		transfer.stateKind.endsWith("UP") ||
		transfer.stateKind === "uploading"
	);
}

/** Optimistic status after stop (qBittorrent 5 uses stopped*). */
export function getOptimisticStoppedState(transfer: {
	progress: number;
	stateKind: string;
}): { stateKind: string; stateLabel: string } {
	return isSeedingLike(transfer)
		? { stateKind: "stoppedUP", stateLabel: "На паузе (готов)" }
		: { stateKind: "stoppedDL", stateLabel: "На паузе" };
}

/** Optimistic status after start. */
export function getOptimisticStartedState(transfer: {
	progress: number;
	stateKind: string;
}): { stateKind: string; stateLabel: string } {
	return isSeedingLike(transfer)
		? { stateKind: "uploading", stateLabel: "Раздача" }
		: { stateKind: "downloading", stateLabel: "Загрузка" };
}
