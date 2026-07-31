// Prefer Badge for error/warning/paused states; routine downloading/uploading stay info/success.
export type TorrentStatusVariant =
	| "neutral"
	| "info"
	| "success"
	| "warning"
	| "error"
	| "purple";

const torrentStateVariants: Record<string, TorrentStatusVariant> = {
	error: "error",
	missingFiles: "error",
	uploading: "success",
	pausedUP: "warning",
	queuedUP: "purple",
	stalledUP: "warning",
	checkingUP: "success",
	forcedUP: "success",
	allocating: "neutral",
	downloading: "info",
	metaDL: "info",
	pausedDL: "warning",
	queuedDL: "purple",
	stalledDL: "warning",
	checkingDL: "info",
	forcedDL: "info",
	checkingResumeData: "neutral",
	moving: "neutral",
	unknown: "neutral",
};

export function getTorrentStateVariant(state: string): TorrentStatusVariant {
	return torrentStateVariants[state] ?? "neutral";
}
