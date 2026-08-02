import { describe, expect, test } from "bun:test";
import {
	extractTopicId,
	findTransferForTopic,
	TOPIC_TAG_PREFIX,
	topicTag,
} from "./topic-tag";

describe("topicTag", () => {
	test("builds stable brotracker topic tag", () => {
		expect(topicTag("12345")).toBe(`${TOPIC_TAG_PREFIX}12345`);
	});
});

describe("extractTopicId", () => {
	test("reads t= from viewtopic URL", () => {
		expect(
			extractTopicId("https://rutracker.org/forum/viewtopic.php?t=98765"),
		).toBe("98765");
	});

	test("reads t= from dl.php URL", () => {
		expect(
			extractTopicId("https://rutracker.org/forum/dl.php?t=42"),
		).toBe("42");
	});

	test("returns null for non-topic URL", () => {
		expect(extractTopicId("https://example.com/")).toBeNull();
	});
});

describe("findTransferForTopic", () => {
	test("matches live torrent by topic tag among comma-separated tags", () => {
		const transfer = findTransferForTopic("555", [
			{
				hash: "aaa",
				progress: 0.4,
				stateKind: "downloading",
				stateLabel: "Загрузка",
				downloadSpeed: 1000,
				etaSeconds: 120,
				tags: "foo, brotracker:topic:555, bar",
			},
		]);

		expect(transfer).toEqual({
			hash: "aaa",
			progress: 0.4,
			stateKind: "downloading",
			stateLabel: "Загрузка",
			downloadSpeed: 1000,
			etaSeconds: 120,
		});
	});

	test("returns null when no torrent carries the topic tag", () => {
		expect(
			findTransferForTopic("555", [
				{
					hash: "bbb",
					progress: 1,
					stateKind: "uploading",
					stateLabel: "Раздача",
					downloadSpeed: 0,
					etaSeconds: 0,
					tags: "other",
				},
			]),
		).toBeNull();
	});
});
