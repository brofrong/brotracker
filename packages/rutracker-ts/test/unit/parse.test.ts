import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
	formatDate,
	formatSize,
} from "../../src/tracker/search-engine/rutracker/format";
import { parseResponse } from "../../src/tracker/search-engine/rutracker/parse";
import type { SearchResult } from "../../src/tracker/tracker-interface";

const htmlDir = join(import.meta.dir, "../fixtures/html");

async function loadFixture(name: string) {
	return Bun.file(join(htmlDir, name)).text();
}

function expectValidResult(result: SearchResult) {
	expect(result.torrentId).toMatch(/^\d+$/);
	expect(result.forumId).toMatch(/^\d+$/);
	expect(result.category.length).toBeGreaterThan(0);
	expect(result.title.length).toBeGreaterThan(0);
	expect(result.authorId).toMatch(/^-?\d+$/);
	expect(result.size).toBeGreaterThan(0);
	expect(result.torrentFileUrl).toMatch(
		/^https:\/\/rutracker\.org\/forum\/dl\.php\?t=\d+$/,
	);
	expect(result.topicUrl).toMatch(
		/^https:\/\/rutracker\.org\/forum\/viewtopic\.php\?t=\d+$/,
	);
	expect(Number.isFinite(result.seeds)).toBe(true);
	expect(Number.isFinite(result.leeches)).toBe(true);
	expect(Number.isFinite(result.downloads)).toBe(true);
	expect(result.date).toBeInstanceOf(Date);
	expect(Number.isNaN(result.date.getTime())).toBe(false);
	expect(["HDR", "SDR", null]).toContain(result.hdr);
	expect(["4K", "1080p", "720p", "SD", null]).toContain(result.resolution);
}

test("parse size", () => {
	expect(formatSize("27.69 GB ↓")).toBe(27.69 * 1024 * 1024 * 1024);
	expect(formatSize("1.46 GB ↓")).toBe(1.46 * 1024 * 1024 * 1024);
});

test("parse date abbreviations", () => {
	const d = formatDate("29-Май-15");
	expect(d.getFullYear()).toBe(2015);
	expect(d.getMonth()).toBe(4);
	expect(d.getDate()).toBe(29);

	expect(formatDate("3-Окт-10").getMonth()).toBe(9);
	expect(formatDate("11-Апр-20").getMonth()).toBe(3);
	expect(formatDate("7-Июн-09").getMonth()).toBe(5);
});

test("parse У Марго проблемы с деньгами fixture", async () => {
	const html = await loadFixture("У Марго проблемы с деньгами.html");
	const page = parseResponse(html);

	expect(page.isOk()).toBe(true);
	if (!page.isOk()) return;

	expect(page.value.totalResults).toBe(5);
	expect(page.value.results.length).toBe(5);

	const first = page.value.results[0];
	if (!first) throw new Error("No results");

	expectValidResult(first);
	expect(first.torrentId).toBe("6847857");
	expect(first.forumId).toBe("1803");
	expect(first.category).toBe(
		"Новинки и сериалы в стадии показа (HD Video)",
	);
	expect(first.title).toBe(
		"У Марго проблемы с деньгами / Margo's Got Money Troubles / Сезон: 1 / Серии: 1-8 из 8 (Дирбла Уолш, Кейт Херрон, Элис Сибрайт) [2026, США, Драма, комедия, экранизация, WEB-DL 1080p] Dub (Whiskey Sound) + 4 х MVO + DVO + Original (Eng) + Sub (Rus, Eng)",
	);
	expect(first.authorId).toBe("53967422");
	expect(first.size).toBe(29736763232);
	expect(first.date.getTime()).toBe(1779654710 * 1000);
	expect(first.torrentFileUrl).toBe(
		"https://rutracker.org/forum/dl.php?t=6847857",
	);
	expect(first.topicUrl).toBe(
		"https://rutracker.org/forum/viewtopic.php?t=6847857",
	);
	expect(first.seeds).toBe(91);
	expect(first.leeches).toBe(48);
	expect(first.downloads).toBe(2253);
	expect(first.resolution).toBe("1080p");
});

const movieFixtures: {
	file: string;
	titleNeedle: RegExp;
	totalResults: number;
	first: {
		torrentId: string;
		forumId: string;
		category: string;
		authorId: string;
		seeds: number;
		leeches: number;
		downloads: number;
		sizeBytes: number;
		dateUnix: number;
	};
}[] = [
	{
		file: "Интерстеллар.html",
		titleNeedle: /Интерстеллар|Interstellar/i,
		totalResults: 25,
		first: {
			torrentId: "5014745",
			forumId: "2093",
			category: "Фильмы 2011-2015",
			authorId: "13980964",
			seeds: 72,
			leeches: 2,
			downloads: 224896,
			sizeBytes: 1571250176,
			dateUnix: 1432932772,
		},
	},
	{
		file: "ПобегизШоушенка.html",
		titleNeedle: /Побег из Шоушенка|Shawshank/i,
		totalResults: 51,
		first: {
			torrentId: "3186952",
			forumId: "2221",
			category: "Фильмы 1991-2000",
			authorId: "7047815",
			seeds: 19,
			leeches: 0,
			downloads: 158904,
			sizeBytes: 1566353408,
			dateUnix: 1286054328,
		},
	},
	{
		file: "Джентльмены.html",
		titleNeedle: /Джентльмены|Gentlemen/i,
		totalResults: 91,
		first: {
			torrentId: "5873327",
			forumId: "2200",
			category: "Фильмы 2016-2020",
			authorId: "8679101",
			seeds: 268,
			leeches: 12,
			downloads: 190129,
			sizeBytes: 2336627604,
			dateUnix: 1586586733,
		},
	},
	{
		file: "Зеленаямиля.html",
		titleNeedle: /Зелёная миля|Green Mile/i,
		totalResults: 42,
		first: {
			torrentId: "3211716",
			forumId: "2221",
			category: "Фильмы 1991-2000",
			authorId: "8937813",
			seeds: 6,
			leeches: 2,
			downloads: 131664,
			sizeBytes: 1571633152,
			dateUnix: 1287331810,
		},
	},
	{
		file: "ВластелинколецВозвращениекороля.html",
		titleNeedle: /Властелин колец|Return of the King/i,
		totalResults: 29,
		first: {
			torrentId: "5310634",
			forumId: "2091",
			category: "Фильмы 2001-2005",
			authorId: "23968065",
			seeds: 297,
			leeches: 13,
			downloads: 171702,
			sizeBytes: 11030073959,
			dateUnix: 1479094074,
		},
	},
	{
		file: "Островпроклятых.html",
		titleNeedle: /Остров проклятых|Shutter Island/i,
		totalResults: 34,
		first: {
			torrentId: "4524967",
			forumId: "2092",
			category: "Фильмы 2006-2010",
			authorId: "7047815",
			seeds: 122,
			leeches: 2,
			downloads: 229265,
			sizeBytes: 1566412800,
			dateUnix: 1378064897,
		},
	},
	{
		file: "Бойцовскийклуб.html",
		titleNeedle: /Бойцовский клуб|Fight Club/i,
		totalResults: 65,
		first: {
			torrentId: "4212145",
			forumId: "2221",
			category: "Фильмы 1991-2000",
			authorId: "20407743",
			seeds: 134,
			leeches: 2,
			downloads: 185044,
			sizeBytes: 3159187671,
			dateUnix: 1349900137,
		},
	},
	{
		file: "11.html",
		titleNeedle: /1\+1|Intouchables|Неприкасаемые/i,
		totalResults: 20,
		first: {
			torrentId: "4081476",
			forumId: "2093",
			category: "Фильмы 2011-2015",
			authorId: "7047815",
			seeds: 136,
			leeches: 5,
			downloads: 453008,
			sizeBytes: 1561291195,
			dateUnix: 1338678161,
		},
	},
	{
		file: "ФоррестГамп.html",
		titleNeedle: /Форрест Гамп|Forrest Gump/i,
		totalResults: 51,
		first: {
			torrentId: "3836653",
			forumId: "2221",
			category: "Фильмы 1991-2000",
			authorId: "7047815",
			seeds: 36,
			leeches: 0,
			downloads: 154074,
			sizeBytes: 1566279680,
			dateUnix: 1322341959,
		},
	},
	{
		file: "Терминатор2Судныйдень.html",
		titleNeedle: /Терминатор 2|Judgment Day/i,
		totalResults: 143,
		first: {
			torrentId: "1912465",
			forumId: "313",
			category: "Зарубежное кино (HD Video)",
			authorId: "227280",
			seeds: 96,
			leeches: 19,
			downloads: 52310,
			sizeBytes: 12530751025,
			dateUnix: 1244400834,
		},
	},
];

describe("parse movie search fixtures", () => {
	for (const fixture of movieFixtures) {
		test(fixture.file, async () => {
			const html = await loadFixture(fixture.file);
			const page = parseResponse(html);
			expect(page.isOk()).toBe(true);
			if (!page.isOk()) return;

			expect(page.value.totalResults).toBe(fixture.totalResults);
			expect(page.value.results.length).toBeGreaterThan(0);

			for (const row of page.value.results) {
				expectValidResult(row);
			}

			const matching = page.value.results.filter((r) =>
				fixture.titleNeedle.test(r.title),
			);
			expect(matching.length).toBeGreaterThan(0);

			const first = page.value.results[0];
			if (!first) throw new Error("No results");

			expect(first.torrentId).toBe(fixture.first.torrentId);
			expect(first.forumId).toBe(fixture.first.forumId);
			expect(first.category).toBe(fixture.first.category);
			expect(first.authorId).toBe(fixture.first.authorId);
			expect(first.seeds).toBe(fixture.first.seeds);
			expect(first.leeches).toBe(fixture.first.leeches);
			expect(first.downloads).toBe(fixture.first.downloads);
			expect(first.size).toBe(fixture.first.sizeBytes);
			expect(first.date.getTime()).toBe(fixture.first.dateUnix * 1000);
			expect(first.torrentFileUrl).toBe(
				`https://rutracker.org/forum/dl.php?t=${fixture.first.torrentId}`,
			);
			expect(first.topicUrl).toBe(
				`https://rutracker.org/forum/viewtopic.php?t=${fixture.first.torrentId}`,
			);
			expect(fixture.titleNeedle.test(first.title)).toBe(true);
		});
	}
});

test("category falls back to forumId when title is missing", () => {
	const html = `
		<div id="search-results">
			<table id="tor-tbl"><tbody>
				<tr id="trs-tr-1" data-topic_id="1" class="hl-tr">
					<td id="1" class="t-ico"></td>
					<td></td>
					<td class="f-name-col"><div class="f-name"><a href="tracker.php?f=2093"></a></div></td>
					<td><a class="tLink" href="viewtopic.php?t=1">Title</a></td>
					<td class="u-name-col"><a href="tracker.php?pid=42">x</a></td>
					<td class="tor-size" data-ts_text="100"><a class="tr-dl" href="dl.php?t=1">100 B</a></td>
					<td data-ts_text="1"><b class="seedmed">1</b></td>
					<td class="leechmed">0</td>
					<td class="number-format">1</td>
					<td data-ts_text="1000"><p>1-Янв-70</p></td>
				</tr>
			</tbody></table>
		</div>
		Результатов поиска: 1
	`;
	const page = parseResponse(html);
	expect(page.isOk()).toBe(true);
	if (!page.isOk()) return;
	expect(page.value.results[0]?.forumId).toBe("2093");
	expect(page.value.results[0]?.category).toBe("2093");
	expect(page.value.results[0]?.authorId).toBe("42");
	expect(page.value.totalResults).toBe(1);
});

test("skips broken rows instead of failing the whole page", () => {
	const html = `
		<div id="search-results">
			<table id="tor-tbl"><tbody>
				<tr data-topic_id="1" class="hl-tr">
					<td></td><td></td>
					<td class="f-name-col"><a href="tracker.php?f=1">Cat</a></td>
					<td><!-- no title link --></td>
					<td class="u-name-col"><a href="tracker.php?pid=1">a</a></td>
					<td class="tor-size" data-ts_text="10"></td>
					<td data-ts_text="1"><b class="seedmed">1</b></td>
					<td class="leechmed">0</td>
					<td class="number-format">1</td>
					<td data-ts_text="1000"><p>1-Янв-70</p></td>
				</tr>
				<tr data-topic_id="2" class="hl-tr">
					<td></td><td></td>
					<td class="f-name-col"><a href="tracker.php?f=2">Films</a></td>
					<td><a class="tLink" href="viewtopic.php?t=2">Good Row</a></td>
					<td class="u-name-col"><a href="tracker.php?pid=9">a</a></td>
					<td class="tor-size" data-ts_text="20"><a class="tr-dl" href="dl.php?t=2">20 B</a></td>
					<td data-ts_text="5"><b class="seedmed">5</b></td>
					<td class="leechmed">1</td>
					<td class="number-format">3</td>
					<td data-ts_text="2000"><p>1-Янв-70</p></td>
				</tr>
			</tbody></table>
		</div>
		Результатов поиска: 2
	`;
	const page = parseResponse(html);
	expect(page.isOk()).toBe(true);
	if (!page.isOk()) return;
	expect(page.value.results.length).toBe(1);
	expect(page.value.results[0]?.torrentId).toBe("2");
	expect(page.value.results[0]?.title).toBe("Good Row");
	expect(page.value.totalResults).toBe(2);
});
