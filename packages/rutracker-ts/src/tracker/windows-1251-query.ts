import iconv from "iconv-lite";

function encodeWindows1251Component(value: string): string {
	const bytes = iconv.encode(value, "windows-1251");
	let out = "";
	for (const byte of bytes) {
		if (byte === 0x20) {
			out += "+";
			continue;
		}
		const isUnreserved =
			(byte >= 0x41 && byte <= 0x5a) ||
			(byte >= 0x61 && byte <= 0x7a) ||
			(byte >= 0x30 && byte <= 0x39) ||
			byte === 0x2d ||
			byte === 0x2e ||
			byte === 0x5f ||
			byte === 0x7e;
		out += isUnreserved
			? String.fromCharCode(byte)
			: `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
	}
	return out;
}

export function toWindows1251Query(
	params: Record<string, string | number | number[] | undefined>,
): string {
	const parts: string[] = [];
	for (const [key, value] of Object.entries(params)) {
		if (value === undefined) {
			continue;
		}
		const encodedKey = encodeURIComponent(key);
		if (Array.isArray(value)) {
			for (const item of value) {
				parts.push(`${encodedKey}=${encodeWindows1251Component(String(item))}`);
			}
			continue;
		}
		parts.push(`${encodedKey}=${encodeWindows1251Component(String(value))}`);
	}
	return parts.join("&");
}
