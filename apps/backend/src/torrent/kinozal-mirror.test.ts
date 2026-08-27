import { describe, expect, test } from "bun:test";
import {
	pickFastestMirror,
	type MirrorProbe,
} from "./kinozal-mirror";

describe("pickFastestMirror", () => {
	test("picks the lowest latency probe", () => {
		const probes: Array<MirrorProbe | null> = [
			{ url: "https://kinozal.me", latencyMs: 300 },
			null,
			{ url: "https://kinozal.guru", latencyMs: 120 },
			{ url: "https://kinozal.tv", latencyMs: 250 },
		];
		expect(pickFastestMirror(probes)?.url).toBe("https://kinozal.guru");
	});

	test("returns null when no mirror responded", () => {
		expect(pickFastestMirror([null, null])).toBeNull();
		expect(pickFastestMirror([])).toBeNull();
	});
});
