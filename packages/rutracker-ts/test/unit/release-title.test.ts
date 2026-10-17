import { describe, expect, it } from "bun:test";
import { parseReleaseTitle } from "../../src/tracker/release-title";

describe("parseReleaseTitle: names and year", () => {
	it.each([
		[
			"Одиссея / The Odyssey (Кристофер Нолан / Christopher Nolan) [2026, США, WEB-DL 2160p, HDR, Dub]",
			["Одиссея", "The Odyssey"],
			2026,
		],
		[
			"Космическая одиссея / 2001: A Space Odyssey (Стэнли Кубрик / Stanley Kubrick) [1968, Великобритания, США, BDRip 1080p] MVO",
			["Космическая одиссея", "2001: A Space Odyssey"],
			1968,
		],
		[
			"Одиссея / The Odyssey / 2026 / ДБ / WEB-DL (1080p)",
			["Одиссея", "The Odyssey"],
			2026,
		],
		[
			"Космическая одиссея / 2001: A Space Odyssey / 1968 / ПМ / BDRip (1080p)",
			["Космическая одиссея", "2001: A Space Odyssey"],
			1968,
		],
		[
			"Одни из нас (2 сезон: 1-7 серии из 7) / The Last of Us / 2025 / ПМ / WEB-DL (1080p)",
			["Одни из нас", "The Last of Us"],
			2025,
		],
		[
			"Одни из нас / The Last of Us / Сезон: 2 / Серии: 1-7 из 7 (Крэйг Мазин) [2025, США, драма, WEB-DL 1080p] Dub + Original",
			["Одни из нас", "The Last of Us"],
			2025,
		],
		[
			"Одиссея / The Odyssey (2026) WEB-DLRip-AVC от DoMiNo & селезень | D",
			["Одиссея", "The Odyssey"],
			2026,
		],
		["Inception 2010 1080p", ["Inception"], 2010],
		["Padre.Pio.2022.WEB-DL.1080p.mkv", ["Padre Pio"], 2022],
		[
			"Какой-то релиз без года WEB-DL",
			["Какой-то релиз без года WEB-DL"],
			null,
		],
		[
			"Show Name / Шоу Имя / S01E05 / 2025 / WEB-DL (1080p)",
			["Show Name", "Шоу Имя"],
			2025,
		],
		[
			"Show Name / Шоу Имя / S02 / 2025 / WEB-DL (1080p)",
			["Show Name", "Шоу Имя"],
			2025,
		],
		[
			"Superman / Супермен / 1978 / ПМ / BDRip (1080p)",
			["Superman", "Супермен"],
			1978,
		],
	])("parses %p", (title, names, year) => {
		const result = parseReleaseTitle(title);
		expect(result.names).toEqual(names);
		expect(result.year).toBe(year);
	});
});

describe("parseReleaseTitle: isCamrip", () => {
	it.each([
		["Одиссея / The Odyssey (2026) CAMRip | Звук с TS", true],
		["Одиссея / The Odyssey [2026, HDCAM]", true],
		["Одиссея / The Odyssey [2026, TS] Dub", true],
		["Одиссея / The Odyssey (2026) экранка, звук отличный", true],
		["Одиссея / The Odyssey [2010, BDRip 1080p, DTS-HD MA]", false],
		["Одиссея / The Odyssey [2026, WEB-DL 1080p]", false],
	])("%p -> isCamrip=%p", (title, expected) => {
		expect(parseReleaseTitle(title).isCamrip).toBe(expected);
	});
});

describe("parseReleaseTitle: hasRussianVoice", () => {
	it.each<[string, boolean]>([
		[
			"Одиссея / The Odyssey (Кристофер Нолан / Christopher Nolan) [2026, США, WEB-DL 2160p, HDR, Dub]",
			true,
		],
		[
			"Космическая одиссея / 2001: A Space Odyssey (Стэнли Кубрик / Stanley Kubrick) [1968, Великобритания, США, BDRip 1080p] MVO",
			true,
		],
		["Одиссея / The Odyssey / 2026 / ДБ / WEB-DL (1080p)", true],
		[
			"Космическая одиссея / 2001: A Space Odyssey / 1968 / ПМ / BDRip (1080p)",
			true,
		],
		[
			"Одни из нас (2 сезон: 1-7 серии из 7) / The Last of Us / 2025 / ПМ / WEB-DL (1080p)",
			true,
		],
		[
			"Одни из нас / The Last of Us / Сезон: 2 / Серии: 1-7 из 7 (Крэйг Мазин) [2025, США, драма, WEB-DL 1080p] Dub + Original",
			true,
		],
		[
			"Одиссея / The Odyssey (2026) WEB-DLRip-AVC от DoMiNo & селезень | D",
			true,
		],
		["Одиссея / The Odyssey [2024, BDRip] Дубляж", true],
		["Одиссея / The Odyssey [2025, BDRip] Многоголосый закадровый", true],
		["Одиссея / The Odyssey [2026, WEB-DL 1080p] Original + Sub", false],
		["Одиссея / The Odyssey [2024, BDRip] AVO", false],
		["Ампм / Ampm [2024, WEB-DL]", false],
	])("%p -> hasRussianVoice=%p", (title, expected) => {
		expect(parseReleaseTitle(title).hasRussianVoice).toBe(expected);
	});
});
