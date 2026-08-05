export function yearFromDate(date: string | undefined): number | null {
	if (!date || date.length < 4) {
		return null;
	}
	const year = Number(date.slice(0, 4));
	return Number.isFinite(year) ? year : null;
}
