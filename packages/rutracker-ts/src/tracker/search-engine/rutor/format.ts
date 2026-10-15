import { checkHDR, checkResolution } from "../rutracker/format";

export { checkHDR, checkResolution };

const multipliers: Record<string, number> = {
	TB: 1024 ** 4,
	GB: 1024 ** 3,
	MB: 1024 ** 2,
	KB: 1024,
	B: 1,
};

/** RuTor sizes look like `10.13 GB` (with a non-breaking space). */
export function formatSize(size: string): number {
	const match = size.replace(/ /g, " ").match(/([\d.]+)\s*(TB|GB|MB|KB|B)/i);
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

/** RuTor dates look like `15 Окт 26` (with non-breaking spaces). */
export function formatDate(date: string): Date {
	const match = date
		.replace(/ /g, " ")
		.match(/(\d{1,2})\s+([А-Яа-я]+)\s+(\d{2})/);
	if (!match) {
		return new Date(NaN);
	}
	const [, day, monthText, year] = match;
	const month = months[monthText?.toLowerCase().slice(0, 3) ?? ""];
	if (month === undefined) {
		return new Date(NaN);
	}
	return new Date(2000 + Number(year), month, Number(day));
}
