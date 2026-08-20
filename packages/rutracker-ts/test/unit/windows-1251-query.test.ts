import { describe, expect, test } from "bun:test";
import axios from "axios";
import { toWindows1251Query } from "../../src/tracker/windows-1251-query";

describe("toWindows1251Query", () => {
	test("encodes Cyrillic search text as windows-1251, not UTF-8", () => {
		const query = toWindows1251Query({ nm: "История игрушек" });
		expect(query).toBe("nm=%C8%F1%F2%EE%F0%E8%FF+%E8%E3%F0%F3%F8%E5%EA");
		expect(query).not.toContain("%D0%98");
	});

	test("repeats array keys the way PHP f[] expects", () => {
		expect(toWindows1251Query({ "f[]": [4, 21], nm: "x" })).toBe(
			"f%5B%5D=4&f%5B%5D=21&nm=x",
		);
	});

	test("axios search URLs keep the windows-1251 nm", () => {
		const uri = axios.getUri({
			url: "https://rutracker.org/forum/tracker.php",
			params: { nm: "История игрушек" },
			paramsSerializer: toWindows1251Query,
		});
		expect(uri).toContain("nm=%C8%F1%F2%EE%F0%E8%FF+%E8%E3%F0%F3%F8%E5%EA");
		expect(uri).not.toContain("%D0%98");
	});
});
