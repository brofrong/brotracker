const YO = /ё/g;
const NOISE = /[^\p{L}\p{N}\s]+/gu;
const SPACES = /\s+/g;

/** Minimal lat→cyr lookalikes for fuzzy title matching. */
const LAT_TO_CYR: Record<string, string> = {
	a: "а",
	e: "е",
	o: "о",
	p: "р",
	c: "с",
	x: "х",
	y: "у",
	h: "н",
	k: "к",
	m: "м",
	t: "т",
	b: "в",
};

export function normalizeTitle(input: string): string {
	let s = input.trim().toLowerCase().replace(YO, "е");
	s = s.replace(/[a-z]/g, (ch) => LAT_TO_CYR[ch] ?? ch);
	s = s.replace(NOISE, " ").replace(SPACES, " ").trim();
	return s;
}
