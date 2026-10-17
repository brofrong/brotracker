export type TitleWatchState =
	| "waiting"
	| "downloading"
	| "tracking"
	| "paused"
	| "completed"
	| "off";

export type WatchlistSettings = {
	checkIntervalHours: number;
	minResolution: "720p" | "1080p" | "4K";
	hdrOnly: boolean;
	requireRussianVoice: boolean;
};

export type WaitStage = "downloading" | "tracking" | "completed";

export type WaitButtonState =
	| { kind: "add" }
	| { kind: "waiting" }
	| { kind: "stage"; stage: WaitStage };

export function waitButtonState(
	watch: { watch: TitleWatchState } | null,
): WaitButtonState {
	switch (watch?.watch) {
		case "waiting":
			return { kind: "waiting" };
		case "downloading":
			return { kind: "stage", stage: "downloading" };
		case "tracking":
		case "paused":
			return { kind: "stage", stage: "tracking" };
		case "completed":
			return { kind: "stage", stage: "completed" };
		default:
			return { kind: "add" };
	}
}

export type WaitAction = "wait" | "remove" | "none";

/** What tapping the «Жду» control does: add → wait, waiting → remove, stages are read-only. */
export function nextAction(state: WaitButtonState): WaitAction {
	switch (state.kind) {
		case "add":
			return "wait";
		case "waiting":
			return "remove";
		default:
			return "none";
	}
}

/** "1080p+ · с озвучкой", "4K+ · HDR" — keys live under the `title` namespace. */
export function rulesSummary(
	settings: WatchlistSettings,
	t: (key: string, options?: Record<string, unknown>) => string,
): string {
	const parts = [
		t("wait.rules.minResolution", { value: settings.minResolution }),
	];
	if (settings.hdrOnly) {
		parts.push(t("wait.rules.hdr"));
	}
	if (settings.requireRussianVoice) {
		parts.push(t("wait.rules.voice"));
	}
	return parts.join(" · ");
}

/**
 * The series «Следить» panel. Hidden while the series waits for a release:
 * «Жду» owns that row, and following now would attach a topic behind its back.
 */
export function showsWatchPanel(
	facet: "films" | "tv" | null,
	watch: { watch: TitleWatchState } | null,
): boolean {
	return facet === "tv" && watch?.watch !== "waiting";
}

/** «Жду» needs a TMDB title whose metadata loaded fully (the backend refuses otherwise). */
export function canWaitFor(input: {
	titleId: string;
	facet: "films" | "tv" | null;
	metaStatus: string;
}): boolean {
	return (
		input.titleId.startsWith("tmdb:") &&
		input.facet != null &&
		input.metaStatus === "ok"
	);
}

/** CSS time ("410ms", "0.25s") → milliseconds; `fallbackMs` when unparseable. */
export function parseCssDuration(value: string, fallbackMs: number): number {
	const match = /^(\d*\.?\d+)(ms|s)$/.exec(value.trim());
	if (!match) {
		return fallbackMs;
	}
	const amount = Number(match[1]);
	return match[2] === "s" ? amount * 1000 : amount;
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** canvas-confetti only understands hex; keep the tokens that resolve to one. */
export function confettiColors(
	token: (name: string) => string,
	names: readonly string[],
): string[] {
	return names
		.map((name) => token(name).trim())
		.filter((value) => HEX_COLOR.test(value));
}
