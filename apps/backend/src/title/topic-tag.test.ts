import { describe, expect, test } from "bun:test";
import {
	extractTopicId,
	extractTopicIdFromTags,
	findTransferForTopic,
	TOPIC_TAG_PREFIX,
	topicTag,
	topicUrlFromId,
	torrentFileUrlFromId,
} from "./topic-tag";

describe("topicTag", () => {
	test("builds stable brotracker topic tag for namespaced id", () => {
		expect(topicTag("rutracker:12345")).toBe(
			`${TOPIC_TAG_PREFIX}rutracker:12345`,
		);
	});

	test("builds tag for kinozal id", () => {
		expect(topicTag("kinozal:99")).toBe(`${TOPIC_TAG_PREFIX}kinozal:99`);
	});
});

describe("topicUrlFromId", () => {
	test("builds RuTracker viewtopic URL", () => {
		expect(topicUrlFromId("rutracker:98765")).toBe(
			"https://rutracker.org/forum/viewtopic.php?t=98765",
		);
	});

	test("builds Kinozal details URL", () => {
		expect(topicUrlFromId("kinozal:42")).toBe(
			"https://kinozal.me/details.php?id=42",
		);
	});

	test("treats bare digits as rutracker", () => {
		expect(topicUrlFromId("123")).toBe(
			"https://rutracker.org/forum/viewtopic.php?t=123",
		);
	});
});

describe("torrentFileUrlFromId", () => {
	test("builds RuTracker dl URL", () => {
		expect(torrentFileUrlFromId("rutracker:1")).toBe(
			"https://rutracker.org/forum/dl.php?t=1",
		);
	});

	test("builds Kinozal download URL", () => {
		expect(torrentFileUrlFromId("kinozal:7")).toBe(
			"https://dl.kinozal.me/download.php?id=7",
		);
	});
});

describe("extractTopicId", () => {
	test("reads t= from viewtopic URL as rutracker namespace", () => {
		expect(
			extractTopicId("https://rutracker.org/forum/viewtopic.php?t=98765"),
		).toBe("rutracker:98765");
	});

	test("reads t= from dl.php URL", () => {
		expect(
			extractTopicId("https://rutracker.org/forum/dl.php?t=42"),
		).toBe("rutracker:42");
	});

	test("reads id= from kinozal details URL", () => {
		expect(
			extractTopicId("https://kinozal.me/details.php?id=555"),
		).toBe("kinozal:555");
	});

	test("reads id= from kinozal download URL", () => {
		expect(
			extractTopicId("https://dl.kinozal.me/download.php?id=888"),
		).toBe("kinozal:888");
	});

	test("returns null for non-topic URL", () => {
		expect(extractTopicId("https://example.com/")).toBeNull();
	});
});

describe("extractTopicIdFromTags", () => {
	test("reads namespaced rutracker tag", () => {
		expect(
			extractTopicIdFromTags("foo, brotracker:topic:rutracker:123, bar"),
		).toBe("rutracker:123");
	});

	test("reads legacy bare-digit tag as rutracker", () => {
		expect(extractTopicIdFromTags("brotracker:topic:456")).toBe("rutracker:456");
	});

	test("reads kinozal tag", () => {
		expect(extractTopicIdFromTags("brotracker:topic:kinozal:77")).toBe(
			"kinozal:77",
		);
	});
});

describe("findTransferForTopic", () => {
	test("matches live torrent by namespaced topic tag", () => {
		const transfer = findTransferForTopic("rutracker:555", [
			{
				hash: "aaa",
				progress: 0.4,
				stateKind: "downloading",
				stateLabel: "Загрузка",
				downloadSpeed: 1000,
				etaSeconds: 120,
				tags: "foo, brotracker:topic:rutracker:555, bar",
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

	test("matches legacy bare-digit tag when topic id is namespaced rutracker", () => {
		const transfer = findTransferForTopic("rutracker:555", [
			{
				hash: "legacy",
				progress: 1,
				stateKind: "uploading",
				stateLabel: "Раздача",
				downloadSpeed: 0,
				etaSeconds: 0,
				tags: "brotracker:topic:555",
			},
		]);

		expect(transfer?.hash).toBe("legacy");
	});

	test("returns null when no torrent carries the topic tag", () => {
		expect(
			findTransferForTopic("kinozal:555", [
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
