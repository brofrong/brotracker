import { describe, expect, test } from "vitest";
import { oidcSocialSignIn } from "./auth-client";

describe("oidcSocialSignIn", () => {
	test("uses the 1.7 social sign-in payload", () => {
		expect(oidcSocialSignIn("https://brotracker.example/catalog")).toEqual({
			provider: "oidc",
			callbackURL: "https://brotracker.example/catalog",
		});
	});
});
