import { readFileSync } from "fs";
import { join } from "path";

const htmlFile = readFileSync(join(__dirname, "categories-html.txt"), "utf-8");

// Парсим HTML и извлекаем значения для категорий
function extractCategoryValues(html: string, optgroupLabel: string): string[] {
	const values: string[] = [];

	// Находим начало optgroup с нужным label
	const optgroupRegex = new RegExp(
		`<optgroup label="[^"]*${optgroupLabel}[^"]*">([\\s\\S]*?)</optgroup>`,
		"i",
	);

	const match = html.match(optgroupRegex);
	if (!match || !match[1]) {
		return values;
	}

	const optgroupContent = match[1];

	// Извлекаем все value из option элементов
	const optionRegex = /<option[^>]*value="(\d+)"[^>]*>/g;
	let optionMatch: RegExpExecArray | null;

	// biome-ignore lint/suspicious/noAssignInExpressions: needed for regex exec loop
	while ((optionMatch = optionRegex.exec(optgroupContent)) !== null) {
		const value = optionMatch[1];
		if (value) {
			values.push(value);
		}
	}

	return values;
}

// Извлекаем значения для фильмов (из optgroup "Кино, Видео и ТВ")
const filmValues = extractCategoryValues(htmlFile, "Кино, Видео и ТВ");

// Извлекаем значения для сериалов (из optgroup "Сериалы")
const seriesValues = extractCategoryValues(htmlFile, "Сериалы");

console.log("Фильмы:");
console.log(filmValues.join(","));
console.log("\nСериалы:");
console.log(seriesValues.join(","));
