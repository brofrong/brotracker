export function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.min(
		Math.floor(Math.log(bytes) / Math.log(k)),
		sizes.length - 1,
	);
	return `${(bytes / k ** i).toFixed(1)} ${sizes[i]}`;
}

export function formatSpeed(bytesPerSec: number): string {
	return `${formatBytes(bytesPerSec)}/s`;
}

export function formatEta(seconds: number): string {
	if (seconds >= 8640000) return "∞";
	if (seconds <= 0) return "—";
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m`;
}

export function formatProgress(progress: number): string {
	return `${(progress * 100).toFixed(1)}%`;
}

/** Formats a qBittorrent `added_on` unix timestamp (seconds). */
export function formatAddedOn(unixSeconds: number, locale = "ru-RU"): string {
	if (unixSeconds <= 0) return "—";
	const date = new Date(unixSeconds * 1000);
	if (Number.isNaN(date.getTime())) return "—";
	return date.toLocaleString(locale, {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}
