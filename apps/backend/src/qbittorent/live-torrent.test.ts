import { describe, expect, test } from "bun:test";
import type { QbittorentTorrent } from "./qbittorent.types";
import { toLiveTorrent } from "./live-torrent";

const wire = (overrides: Partial<QbittorentTorrent> = {}): QbittorentTorrent =>
	({
		added_on: 0,
		amount_left: 0,
		auto_tmm: false,
		availability: 1,
		category: "",
		completed: 0,
		completion_on: 0,
		content_path: "",
		dl_limit: 0,
		dlspeed: 1024,
		downloaded: 0,
		downloaded_session: 0,
		eta: 120,
		f_l_piece_prio: false,
		force_start: false,
		hash: "abc",
		last_activity: 0,
		magnet_uri: "",
		max_ratio: -1,
		max_seeding_time: -1,
		name: "Film.mkv",
		num_complete: 0,
		num_incomplete: 0,
		num_leechs: 0,
		num_seeds: 0,
		priority: 0,
		progress: 0.5,
		ratio: 0,
		ratio_limit: -1,
		save_path: "/data/films",
		seeding_time: 0,
		seeding_time_limit: -1,
		seen_complete: 0,
		seq_dl: false,
		size: 1_000_000,
		state: "downloading",
		super_seeding: false,
		tags: "",
		time_active: 0,
		total_size: 1_000_000,
		tracker: "",
		up_limit: 0,
		uploaded: 0,
		uploaded_session: 0,
		upspeed: 512,
		...overrides,
	}) as QbittorentTorrent;

describe("toLiveTorrent", () => {
	test("maps wire torrent to slim view-model with state label", () => {
		expect(toLiveTorrent(wire())).toEqual({
			id: "abc",
			name: "Film.mkv",
			progress: 0.5,
			size: 1_000_000,
			downloadSpeed: 1024,
			uploadSpeed: 512,
			etaSeconds: 120,
			savePath: "/data/films",
			stateKind: "downloading",
			stateLabel: "Загрузка",
		});
	});

	test("falls back state label to kind when unknown", () => {
		expect(toLiveTorrent(wire({ state: "unknown" })).stateLabel).toBe(
			"Неизвестно",
		);
	});
});
