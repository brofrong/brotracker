import { describe, expect, it } from "vitest";

import {
	canWaitFor,
	confettiColors,
	nextAction,
	parseCssDuration,
	rulesSummary,
	showsWatchPanel,
	type TitleWatchState,
	waitButtonState,
	type WatchlistSettings,
} from "./wait-state";

const RU: Record<string, string> = {
	"wait.rules.minResolution": "{{value}}+",
	"wait.rules.hdr": "HDR",
	"wait.rules.voice": "с озвучкой",
};

function fakeT(key: string, options?: Record<string, unknown>): string {
	const template = RU[key] ?? key;
	return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
		String(options?.[name] ?? ""),
	);
}

const DEFAULTS: WatchlistSettings = {
	checkIntervalHours: 24,
	minResolution: "1080p",
	hdrOnly: false,
	requireRussianVoice: true,
};

describe("waitButtonState", () => {
	it("offers to add when there is no watch", () => {
		expect(waitButtonState(null)).toEqual({ kind: "add" });
	});

	const cases: Array<[TitleWatchState, ReturnType<typeof waitButtonState>]> = [
		["off", { kind: "add" }],
		["waiting", { kind: "waiting" }],
		["downloading", { kind: "stage", stage: "downloading" }],
		["tracking", { kind: "stage", stage: "tracking" }],
		["paused", { kind: "stage", stage: "tracking" }],
		["completed", { kind: "stage", stage: "completed" }],
	];

	for (const [watch, expected] of cases) {
		it(`maps ${watch}`, () => {
			expect(waitButtonState({ watch })).toEqual(expected);
		});
	}
});

describe("nextAction", () => {
	it("waits from the add state", () => {
		expect(nextAction({ kind: "add" })).toBe("wait");
	});

	it("removes from the waiting state", () => {
		expect(nextAction({ kind: "waiting" })).toBe("remove");
	});

	it("does nothing for later stages", () => {
		for (const stage of ["downloading", "tracking", "completed"] as const) {
			expect(nextAction({ kind: "stage", stage })).toBe("none");
		}
	});
});

describe("rulesSummary", () => {
	it("summarises the defaults", () => {
		expect(rulesSummary(DEFAULTS, fakeT)).toBe("1080p+ · с озвучкой");
	});

	it("includes HDR and drops the voice rule when not required", () => {
		expect(
			rulesSummary(
				{
					...DEFAULTS,
					minResolution: "4K",
					hdrOnly: true,
					requireRussianVoice: false,
				},
				fakeT,
			),
		).toBe("4K+ · HDR");
	});

	it("lists every rule in order", () => {
		expect(
			rulesSummary({ ...DEFAULTS, minResolution: "4K", hdrOnly: true }, fakeT),
		).toBe("4K+ · HDR · с озвучкой");
	});
});

describe("canWaitFor", () => {
	it("allows tmdb titles with a facet and full metadata", () => {
		expect(
			canWaitFor({ titleId: "tmdb:movie:1", facet: "films", metaStatus: "ok" }),
		).toBe(true);
	});

	it("rejects non-tmdb ids", () => {
		expect(
			canWaitFor({ titleId: "rt:123", facet: "films", metaStatus: "ok" }),
		).toBe(false);
	});

	it("rejects titles without a facet", () => {
		expect(
			canWaitFor({ titleId: "tmdb:movie:1", facet: null, metaStatus: "ok" }),
		).toBe(false);
	});

	it("rejects degraded or empty metadata", () => {
		expect(
			canWaitFor({ titleId: "tmdb:tv:1", facet: "tv", metaStatus: "degraded" }),
		).toBe(false);
		expect(
			canWaitFor({ titleId: "tmdb:tv:1", facet: "tv", metaStatus: "empty" }),
		).toBe(false);
	});
});

describe("parseCssDuration", () => {
	it("parses milliseconds", () => {
		expect(parseCssDuration("410ms", 300)).toBe(410);
	});

	it("parses seconds with whitespace", () => {
		expect(parseCssDuration(" 0.25s ", 300)).toBe(250);
	});

	it("falls back on empty or garbage values", () => {
		expect(parseCssDuration("", 300)).toBe(300);
		expect(parseCssDuration("fast", 300)).toBe(300);
	});
});

describe("confettiColors", () => {
	it("keeps hex colours in token order", () => {
		const tokens: Record<string, string> = {
			"--a": "#0171E3",
			"--b": " #EB6E00 ",
			"--c": "",
			"--d": "light-dark(#000, #fff)",
			"--e": "#abc",
		};
		expect(
			confettiColors(
				(name) => tokens[name] ?? "",
				["--a", "--b", "--c", "--d", "--e"],
			),
		).toEqual(["#0171E3", "#EB6E00", "#abc"]);
	});
});

describe("showsWatchPanel", () => {
	it("shows «Следить» for a series without a watch or with a topic watch", () => {
		expect(showsWatchPanel("tv", null)).toBe(true);
		for (const watch of ["tracking", "paused", "off", "completed"] as const) {
			expect(showsWatchPanel("tv", { watch })).toBe(true);
		}
	});

	it("hides it while the series is waiting for a release", () => {
		expect(showsWatchPanel("tv", { watch: "waiting" })).toBe(false);
	});

	it("never for films", () => {
		expect(showsWatchPanel("films", null)).toBe(false);
		expect(showsWatchPanel(null, null)).toBe(false);
	});
});
