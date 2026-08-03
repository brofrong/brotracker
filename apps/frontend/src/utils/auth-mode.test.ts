import { describe, expect, test, vi } from "vitest";
import { fetchAuthMode } from "./auth-mode";

describe("fetchAuthMode", () => {
	test("requests /api/auth/mode and returns JSON", async () => {
		const fetchImpl = vi.fn(async () =>
			Response.json({ mode: "local", registrationOpen: true }),
		);

		await expect(fetchAuthMode("http://localhost:3101", fetchImpl)).resolves.toEqual({
			mode: "local",
			registrationOpen: true,
		});
		expect(fetchImpl).toHaveBeenCalledWith("http://localhost:3101/api/auth/mode", {
			credentials: "include",
		});
	});

	test("throws on non-OK response", async () => {
		const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));
		await expect(fetchAuthMode("", fetchImpl)).rejects.toThrow(/Failed to fetch auth mode/);
	});
});
