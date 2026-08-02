import { describe, expect, test } from "vitest";
import {
	createUnauthorizedRedirectPolicy,
	isUnauthorizedTrpcError,
} from "./unauthorized-redirect";

describe("unauthorized redirect policy", () => {
	test("redirects once for missing session", async () => {
		const redirects: number[] = [];
		const policy = createUnauthorizedRedirectPolicy({
			isBrowser: () => true,
			redirect: async () => {
				redirects.push(1);
			},
		});

		await policy.redirectOnUnauthorized();
		await policy.redirectOnUnauthorized();

		expect(redirects).toEqual([1]);
	});

	test("does not redirect outside the browser", async () => {
		const redirects: number[] = [];
		const policy = createUnauthorizedRedirectPolicy({
			isBrowser: () => false,
			redirect: async () => {
				redirects.push(1);
			},
		});

		await policy.redirectOnUnauthorized();
		expect(redirects).toEqual([]);
	});

	test("handles UNAUTHORIZED tRPC errors via shared policy", async () => {
		const redirects: number[] = [];
		const policy = createUnauthorizedRedirectPolicy({
			isBrowser: () => true,
			redirect: async () => {
				redirects.push(1);
			},
		});

		expect(
			policy.handleTrpcUnauthorized({
				data: { code: "UNAUTHORIZED" },
			}),
		).toBe(true);
		expect(
			policy.handleTrpcUnauthorized({
				data: { code: "BAD_REQUEST" },
			}),
		).toBe(false);
		expect(redirects).toEqual([1]);
	});
});

describe("isUnauthorizedTrpcError", () => {
	test("detects UNAUTHORIZED code on TRPC-shaped errors", () => {
		expect(
			isUnauthorizedTrpcError({ data: { code: "UNAUTHORIZED" } }),
		).toBe(true);
		expect(isUnauthorizedTrpcError(new Error("nope"))).toBe(false);
	});
});
