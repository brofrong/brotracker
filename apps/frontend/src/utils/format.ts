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
	if (hours > 0) return `${hours}ч ${minutes}м`;
	return `${minutes}м`;
}

export function formatProgress(progress: number): string {
	return `${(progress * 100).toFixed(1)}%`;
}

const torrentStateLabels: Record<string, string> = {
	error: "Ошибка",
	missingFiles: "Нет файлов",
	uploading: "Раздача",
	pausedUP: "На паузе (готов)",
	queuedUP: "В очереди (раздача)",
	stalledUP: "Простой (раздача)",
	checkingUP: "Проверка (готов)",
	forcedUP: "Принуд. раздача",
	allocating: "Выделение места",
	downloading: "Загрузка",
	metaDL: "Метаданные",
	pausedDL: "На паузе",
	queuedDL: "В очереди",
	stalledDL: "Простой",
	checkingDL: "Проверка",
	forcedDL: "Принуд. загрузка",
	checkingResumeData: "Проверка данных",
	moving: "Перемещение",
	unknown: "Неизвестно",
};

export function formatTorrentState(state: string): string {
	return torrentStateLabels[state] ?? state;
}
