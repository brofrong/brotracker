const multipliers: Record<string, number> = {
	GB: 1024 ** 3,
	MB: 1024 ** 2,
	KB: 1024,
	B: 1,
};

/** RuTracker size strings look like `27.69 GB ↓`. */
export function formatSize(size: string): number {
	const match = size.match(/([\d.]+)\s*(GB|MB|KB|B)/i);
	if (!match) return 0;
	const value = Number.parseFloat(match[1] ?? "0");
	const unit = match[2]?.toUpperCase() ?? "B";
	return value * (multipliers[unit] ?? 1);
}

const months: Record<string, number> = {
	янв: 0,
	январь: 0,
	фев: 1,
	февраль: 1,
	мар: 2,
	март: 2,
	апр: 3,
	апрель: 3,
	май: 4,
	июн: 5,
	июнь: 5,
	июл: 6,
	июль: 6,
	авг: 7,
	август: 7,
	сен: 8,
	сентябрь: 8,
	окт: 9,
	октябрь: 9,
	ноя: 10,
	ноябрь: 10,
	дек: 11,
	декабрь: 11,
};

/** RuTracker dates look like `29-Май-15` (day-monthAbbrev-yy). */
export function formatDate(date: string): Date {
	const match = date.match(/(\d{1,2})-([А-Яа-я]+)-(\d{2})/);
	if (!match) {
		return new Date(NaN);
	}
	const [, day, monthText, year] = match;
	const month = months[monthText?.toLowerCase() ?? ""];
	if (month === undefined) {
		return new Date(NaN);
	}
	return new Date(2000 + Number(year), month, Number(day));
}

export function checkHDR(value: string): "HDR" | "SDR" | null {
	if (/HDR10\+?|HDR10|Dolby Vision/i.test(value)) {
		return "HDR";
	}
	return "SDR";
}

export function checkResolution(
	value: string,
): "4K" | "1080p" | "720p" | "SD" | null {
	if (/4k|2160p/i.test(value)) {
		return "4K";
	}
	if (/1080|1920x1080/i.test(value)) {
		return "1080p";
	}
	if (/720p|1280x720/i.test(value)) {
		return "720p";
	}
	return null;
}
