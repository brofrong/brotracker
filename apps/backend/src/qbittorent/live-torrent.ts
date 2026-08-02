import type {
	QbittorentTorrent,
	QbittorentTorrentState,
} from "./qbittorent.types";

const torrentStateLabels: Record<QbittorentTorrentState, string> = {
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

export type LiveTorrent = {
	id: string;
	name: string;
	progress: number;
	size: number;
	downloadSpeed: number;
	uploadSpeed: number;
	etaSeconds: number;
	savePath: string;
	stateKind: QbittorentTorrentState;
	stateLabel: string;
	tags: string;
};

export function toLiveTorrent(torrent: QbittorentTorrent): LiveTorrent {
	const stateKind = torrent.state;
	return {
		id: torrent.hash,
		name: torrent.name,
		progress: torrent.progress,
		size: torrent.size,
		downloadSpeed: torrent.dlspeed,
		uploadSpeed: torrent.upspeed,
		etaSeconds: torrent.eta,
		savePath: torrent.save_path,
		stateKind,
		stateLabel: torrentStateLabels[stateKind] ?? stateKind,
		tags: torrent.tags ?? "",
	};
}

export function toLiveTorrents(torrents: QbittorentTorrent[]): LiveTorrent[] {
	return torrents.map(toLiveTorrent);
}
