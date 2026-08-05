import { checkHDR, checkResolution } from "../rutracker/format";

export { checkHDR, checkResolution };

const multipliers: Record<string, number> = {
	GB: 1024 ** 3,
	MB: 1024 ** 2,
	KB: 1024,
	B: 1,
	ГБ: 1024 ** 3,
	МБ: 1024 ** 2,
	КБ: 1024,
	Б: 1,
};

/** Kinozal size strings look like `40.61 ГБ` or `300 МБ`. */
export function formatSize(size: string): number {
	const match = size.match(/([\d.]+)\s*(GB|MB|KB|B|ГБ|МБ|КБ|Б)/i);
	if (!match) return 0;
	const value = Number.parseFloat(match[1] ?? "0");
	const unit = match[2]?.toUpperCase() ?? "B";
	return value * (multipliers[unit] ?? 1);
}

const months: Record<string, number> = {
	янв: 0,
	фев: 1,
	мар: 2,
	апр: 3,
	май: 4,
	июн: 5,
	июл: 6,
	авг: 7,
	сен: 8,
	окт: 9,
	ноя: 10,
	дек: 11,
};

/**
 * Kinozal dates look like `29.07.2026 в 18:41` or `сегодня в 12:30`.
 */
export function formatDate(date: string, now = new Date()): Date {
	const trimmed = date.trim();
	const todayMatch = trimmed.match(/сегодня\s+в\s+(\d{1,2}):(\d{2})/i);
	if (todayMatch) {
		const [, hours, minutes] = todayMatch;
		return new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate(),
			Number(hours),
			Number(minutes),
		);
	}

	const yesterdayMatch = trimmed.match(/вчера\s+в\s+(\d{1,2}):(\d{2})/i);
	if (yesterdayMatch) {
		const [, hours, minutes] = yesterdayMatch;
		const d = new Date(now);
		d.setDate(d.getDate() - 1);
		return new Date(
			d.getFullYear(),
			d.getMonth(),
			d.getDate(),
			Number(hours),
			Number(minutes),
		);
	}

	const absoluteMatch = trimmed.match(
		/(\d{1,2})\.(\d{1,2})\.(\d{4})\s+в\s+(\d{1,2}):(\d{2})/,
	);
	if (absoluteMatch) {
		const [, day, month, year, hours, minutes] = absoluteMatch;
		return new Date(
			Number(year),
			Number(month) - 1,
			Number(day),
			Number(hours),
			Number(minutes),
		);
	}

	const abbrevMatch = trimmed.match(/(\d{1,2})-([А-Яа-я]+)-(\d{2})/);
	if (abbrevMatch) {
		const [, day, monthText, year] = abbrevMatch;
		const month = months[monthText?.toLowerCase() ?? ""];
		if (month === undefined) {
			return new Date(NaN);
		}
		return new Date(2000 + Number(year), month, Number(day));
	}

	return new Date(NaN);
}
