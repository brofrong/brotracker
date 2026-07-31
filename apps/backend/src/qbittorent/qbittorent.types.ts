export type QbittorentTorrentState =
	| "error"
	| "missingFiles"
	| "uploading"
	| "pausedUP"
	| "queuedUP"
	| "stalledUP"
	| "checkingUP"
	| "forcedUP"
	| "allocating"
	| "downloading"
	| "metaDL"
	| "pausedDL"
	| "queuedDL"
	| "stalledDL"
	| "checkingDL"
	| "forcedDL"
	| "checkingResumeData"
	| "moving"
	| "unknown";

export type QbittorentTorrent = {
	added_on: number;
	amount_left: number;
	auto_tmm: boolean;
	availability: number;
	category: string;
	completed: number;
	completion_on: number;
	content_path: string;
	dl_limit: number;
	dlspeed: number;
	downloaded: number;
	downloaded_session: number;
	eta: number;
	f_l_piece_prio: boolean;
	force_start: boolean;
	hash: string;
	last_activity: number;
	magnet_uri: string;
	max_ratio: number;
	max_seeding_time: number;
	name: string;
	num_complete: number;
	num_incomplete: number;
	num_leechs: number;
	num_seeds: number;
	priority: number;
	progress: number;
	ratio: number;
	ratio_limit: number;
	save_path: string;
	seeding_time: number;
	seeding_time_limit: number;
	seen_complete: number;
	seq_dl: boolean;
	size: number;
	state: QbittorentTorrentState;
	super_seeding: boolean;
	tags: string;
	time_active: number;
	total_size: number;
	tracker: string;
	up_limit: number;
	uploaded: number;
	uploaded_session: number;
	upspeed: number;
};

export type AddTorrentOptions = {
	pathToSave: string;
	filename?: string;
};
