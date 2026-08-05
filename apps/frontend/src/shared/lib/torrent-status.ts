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

export type TorrentStatusIconColor =
	| "success"
	| "warning"
	| "error"
	| "accent"
	| "tertiary";

type TorrentStateVisual = {
	icon: ComponentType<SVGProps<SVGSVGElement>>;
	color: TorrentStatusIconColor;
};

const torrentStateVisuals: Record<string, TorrentStateVisual> = {
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

const fallbackVisual: TorrentStateVisual = {
	icon: CircleHelp,
	color: "tertiary",
};

export function getTorrentStateVisual(state: string): TorrentStateVisual {
	return torrentStateVisuals[state] ?? fallbackVisual;
}

/** Whether the torrent is paused/stopped (download or seeding). */
export function isTorrentPaused(stateKind: string): boolean {
	return (
		stateKind === "pausedDL" ||
		stateKind === "pausedUP" ||
		stateKind === "stoppedDL" ||
		stateKind === "stoppedUP"
	);
}

function isSeedingLike(torrent: {
	progress: number;
	stateKind: string;
}): boolean {
	return (
		torrent.progress >= 1 ||
		torrent.stateKind.endsWith("UP") ||
		torrent.stateKind === "uploading"
	);
}

/** Optimistic status after stop (qBittorrent 5 uses stopped*). */
export function getOptimisticStoppedState(torrent: {
	progress: number;
	stateKind: string;
}): { stateKind: string; stateLabel: string } {
	return isSeedingLike(torrent)
		? { stateKind: "stoppedUP", stateLabel: "На паузе (готов)" }
		: { stateKind: "stoppedDL", stateLabel: "На паузе" };
}

/** Optimistic status after start. */
export function getOptimisticStartedState(torrent: {
	progress: number;
	stateKind: string;
}): { stateKind: string; stateLabel: string } {
	return isSeedingLike(torrent)
		? { stateKind: "uploading", stateLabel: "Раздача" }
		: { stateKind: "downloading", stateLabel: "Загрузка" };
}
