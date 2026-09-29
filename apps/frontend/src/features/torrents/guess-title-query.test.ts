import { describe, expect, it } from "vitest";
import { guessTitleQuery } from "./guess-title-query";

describe("guessTitleQuery", () => {
	it.each([
		["Resident.Alien.S04.WEBDL.1080p", "Resident Alien"],
		["[VLDeshka] Mushoku Tensei S3 [WEBRip 1080p]", "Mushoku Tensei"],
		["Resident Alien (Season 3) WEB-DL 1080p", "Resident Alien"],
		["Padre.Pio.2022.WEB-DL.1080p.seleZen.mkv", "Padre Pio"],
		["Little.Buddha.1993.2160p.FRA.UHD.BluRay.REMUX", "Little Buddha"],
		["South Park S28 2160p", "South Park"],
		["Clarksons_Farm_(s05)_AlexFilm_2160p", "Clarksons Farm AlexFilm"],
		["Нюрнберг / Nuremberg (Джеймс Вандербилт / James Vanderbilt)", "Нюрнберг"],
		["OnePiece", "OnePiece"],
	])("%s → %s", (name, expected) => {
		expect(guessTitleQuery(name)).toBe(expected);
	});
});
