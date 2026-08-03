import { describe, expect, test } from "bun:test";
import { assertLocalSignUpAllowed } from "./auth-mode";

describe("assertLocalSignUpAllowed", () => {
	test("allows when no users exist", () => {
		expect(() => assertLocalSignUpAllowed(0)).not.toThrow();
	});

	test("rejects when users already exist", () => {
		expect(() => assertLocalSignUpAllowed(1)).toThrow("Registration is closed");
		expect(() => assertLocalSignUpAllowed(3)).toThrow("Registration is closed");
	});
});
