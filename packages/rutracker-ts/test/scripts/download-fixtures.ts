import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createTracker } from "../../src/tracker/tracker";
import { createFileStore } from "../../src/tracker/storage/file-store";
import { env } from "../../src/utils/env";

/** query used for search; fixtureName overrides filename when query has punctuation */
const movies: { query: string; fixtureName?: string }[] = [
	{ query: "Интерстеллар" },
	{ query: "Побег из Шоушенка" },
	{ query: "Джентльмены" },
	{ query: "Зеленая миля" },
	{ query: "Властелин колец: Возвращение короля" },
	{ query: "Остров проклятых" },
	{ query: "Бойцовский клуб" },
	// bare "1+1" matches noise; Intouchables keeps the intended film
	{ query: "1+1 Intouchables", fixtureName: "11" },
	{ query: "Форрест Гамп" },
	{ query: "Терминатор 2: Судный день" },
];

/** Keep only letters and digits (Cyrillic/Latin), drop spaces and punctuation. */
export function toFixtureName(title: string): string {
	return title.replace(/[^\p{L}\p{N}]/gu, "");
}

const outDir = join(import.meta.dir, "../fixtures/html");

await mkdir(outDir, { recursive: true });

const tracker = await createTracker("Rutracker", {
	auth: {
		login: env.username,
		password: env.password,
	},
	fileStore: createFileStore(
		join(import.meta.dir, "../../.data/rutracker-store.json"),
	),
	proxyAgent: null,
});

for (const movie of movies) {
	const filename = `${movie.fixtureName ?? toFixtureName(movie.query)}.html`;
	const path = join(outDir, filename);
	console.log(`Downloading: ${movie.query} -> ${filename}`);

	const result = await tracker._getHTML(movie.query, { category: "films" });
	if (result.isErr()) {
		console.error(`Failed: ${movie.query}`, result.error.message);
		continue;
	}

	await Bun.write(path, result.value);
	console.log(`Saved ${path} (${result.value.length} bytes)`);

	await Bun.sleep(1500);
}

console.log("Done");
