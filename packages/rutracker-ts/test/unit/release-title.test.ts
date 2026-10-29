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
		// Numeric film names: a year-looking first segment is a name, not the year.
		[
			"1917 / 1917 (Сэм Мендес / Sam Mendes) [2019, Великобритания, США, BDRip 1080p] Dub",
			["1917", "1917"],
			2019,
		],
		["1917 / 1917 / 2019 / ДБ / BDRip (1080p)", ["1917", "1917"], 2019],
		[
			"2012 / 2012 (Роланд Эммерих / Roland Emmerich) [2009, США, BDRip 1080p] Dub",
			["2012", "2012"],
			2009,
		],
		["2012 / 2012 / 2009 / ДБ / BDRip (1080p)", ["2012", "2012"], 2009],
		[
			"1984 / Nineteen Eighty-Four (Майкл Рэдфорд / Michael Radford) [1984, Великобритания, BDRip 1080p] MVO",
			["1984", "Nineteen Eighty-Four"],
			1984,
		],
		[
			"1984 / Nineteen Eighty-Four / 1984 / ПМ / BDRip (1080p)",
			["1984", "Nineteen Eighty-Four"],
			1984,
		],
		["1917.2019.1080p.BluRay.x264", ["1917"], 2019],
		// RuTor: a bracket before the (YYYY) group.
		[
			"Слово пацана. Кровь на асфальте [01-08 из 08] (2023) WEB-DL 1080p",
			["Слово пацана. Кровь на асфальте"],
			2023,
		],
		[
			"Слово пацана. Кровь на асфальте [S01] (2023) WEB-DL 1080p",
			["Слово пацана. Кровь на асфальте"],
			2023,
		],
		// A year only in a later bracket.
		[
			"Слово пацана / The Boy's Word [Сезон 1] [2023, Россия, WEB-DL 1080p]",
			["Слово пацана", "The Boy's Word"],
			2023,
		],
		// Scene name: prefer the last year, a number in the name stays.
		["Blade.Runner.2049.2017.1080p.BluRay.x264", ["Blade Runner 2049"], 2017],
		// A resolution written with "×" or ascii "x" isn't mistaken for a year.
		["Фильм / Film [1920×1080, 2026, BDRip]", ["Фильм", "Film"], 2026],
		["Фильм / Film [1920x1080, 2026, BDRip]", ["Фильм", "Film"], 2026],
	])("parses %p", (title, names, year) => {
		const result = parseReleaseTitle(title);
		expect(result.names).toEqual(names);
		expect(result.year).toBe(year);
	});
});

describe("parseReleaseTitle: season", () => {
	it.each<[string, number | null]>([
		[
			"Одни из нас / The Last of Us / Сезон: 2 / Серии: 1-7 из 7 (Крэйг Мазин) [2025, США, драма, WEB-DL 1080p] Dub + Original",
			2,
		],
		[
			"Одни из нас (2 сезон: 1-7 серии из 7) / The Last of Us / 2025 / ПМ / WEB-DL (1080p)",
			2,
		],
		["The.Last.of.Us.S02E05.1080p.WEB-DL", 2],
		["Show / Шоу / S03 / 2025 / WEB-DL (1080p)", 3],
		["Stranger Things / Season 5 [2025, WEB-DL]", 5],
		["Друзья / Friends / Сезон: 1-10 [1994-2004, BDRip]", null],
		["Одиссея / The Odyssey [2026, WEB-DL 2160p]", null],
		// A season-shaped phrase inside a *name* (not a marker position) doesn't count.
		["Сезон охоты 2 / Open Season 2 [2008, BDRip]", null],
		["Open.Season.2.2008.BDRip", null],
		// Multi-season packs have no single season.
		["Офис / The Office / S01-S04 / 2005-2008 / WEB-DL (1080p)", null],
		["Офис / The Office / S01-03 / 2005-2007 / WEB-DL (1080p)", null],
		["The.Office.S01-S04.1080p.WEB-DL", null],
		["The.Office.S01-03.1080p.WEB-DL", null],
		[
			"Офис / The Office / Сезон: 1, 2 / Серии: 1-28 из 28 [2005, WEB-DL 1080p] MVO",
			null,
		],
		["Show (Сезон 1, 2) [2020, WEB-DL]", null],
		["Show / Season 1, 2 [2020, WEB-DL]", null],
		// An episode range inside one season is still that season.
		["The.Office.S02E01-E05.1080p.WEB-DL", 2],
		// A year right after the season is not a second season.
		["Show (Сезон 1, 2025) [WEB-DL]", 1],
	])("%p -> season=%p", (title, expected) => {
		expect(parseReleaseTitle(title).season).toBe(expected);
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
		["Одиссея / The Odyssey [2026, HDCAMRip]", true],
		["Одиссея / The Odyssey [2026, Camrip]", true],
		["Одиссея / The Odyssey [2026, CAMRIP]", true],
		["Одиссея / The Odyssey [2026, TELESYNC]", true],
		["Одиссея / The Odyssey [2026, Telesync]", true],
		["Одиссея / The Odyssey [2026, TeleSynch]", true],
		["Одиссея / The Odyssey [2026, TSRip]", true],
		["Одиссея / The Odyssey (2026) HDTSRip | D", true],
		["Одиссея / The Odyssey / 2026 / ДБ / CAMRip", true],
		["Odyssey CAMRip", true],
		// Tokens inside the name don't count.
		["TS-17 / TS-17 [2024, WEB-DL]", false],
		["Camrip / Камрип [2024, WEB-DL 1080p]", false],
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
		["Одиссея / The Odyssey [2024, BDRip] Dub (Ukr) + Original", false],
		["Одиссея / The Odyssey [2024, BDRip] MVO (Eng) + Sub", false],
		["Одиссея / The Odyssey [2024, BDRip] Dub Ukr + Original", false],
		["Одиссея / The Odyssey [2024, BDRip] Dub (Ukr) + MVO", true],
		["Одиссея / The Odyssey [2024, BDRip] Dub (Rus) + Original", true],
		["Фильм / Film (2026) WEB-DL 1080p | P1", false],
		["Фильм / Film (2026) WEB-DL 1080p | P2", false],
		["Фильм / Film (2026) WEB-DL 1080p | P", true],
		["Фильм / Film (2026) WEB-DL 1080p | D", true],
		["Одиссея / The Odyssey (2026) WEB-DL 1080p | Лицензия", true],
		["Одиссея / The Odyssey [2024, BDRip] Дублированный", true],
		["Одиссея / The Odyssey [2025, BDRip] многоголосый закадровый", true],
		// Tokens inside the name don't count.
		["ПМ / PM [2024, WEB-DL] Original + Sub", false],
	])("%p -> hasRussianVoice=%p", (title, expected) => {
		expect(parseReleaseTitle(title).hasRussianVoice).toBe(expected);
	});
});
