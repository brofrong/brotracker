import { describe, expect, test } from "bun:test";
import {
	createInMemoryWatchEventStore,
	type TitleWatchEvent,
} from "./title-watch-event";

function event(partial: Partial<TitleWatchEvent> = {}): TitleWatchEvent {
	return {
		id: "evt-1",
		titleId: "tmdb:tv:1",
		topicUrl: "https://rutracker.org/forum/viewtopic.php?t=55",
		kind: "torrent-updated",
		message: null,
		previousSize: null,
		newSize: null,
		createdAt: "2026-08-02T10:00:00.000Z",
		...partial,
	};
}

describe("createInMemoryWatchEventStore", () => {
	test("listRecent returns empty array when no events were appended", async () => {
		const store = createInMemoryWatchEventStore();
		expect(await store.listRecent(10)).toEqual([]);
	});

	test("listRecent returns appended events newest first", async () => {
		const store = createInMemoryWatchEventStore();

		await store.append(
			event({ id: "evt-1", createdAt: "2026-08-02T10:00:00.000Z" }),
		);
		await store.append(
			event({ id: "evt-2", createdAt: "2026-08-02T12:00:00.000Z" }),
		);
		await store.append(
			event({ id: "evt-3", createdAt: "2026-08-02T11:00:00.000Z" }),
		);

		const recent = await store.listRecent(10);
		expect(recent.map((e) => e.id)).toEqual(["evt-2", "evt-3", "evt-1"]);
	});

	test("listRecent respects the limit", async () => {
		const store = createInMemoryWatchEventStore();

		await store.append(
			event({ id: "evt-1", createdAt: "2026-08-02T10:00:00.000Z" }),
		);
		await store.append(
			event({ id: "evt-2", createdAt: "2026-08-02T12:00:00.000Z" }),
		);
		await store.append(
			event({ id: "evt-3", createdAt: "2026-08-02T11:00:00.000Z" }),
		);

		const recent = await store.listRecent(2);
		expect(recent.map((e) => e.id)).toEqual(["evt-2", "evt-3"]);
	});
});
