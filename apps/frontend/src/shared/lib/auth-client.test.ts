import { describe, expect, test } from "vitest";
import { authentikSocialSignIn } from "./auth-client";

describe("authentikSocialSignIn", () => {
	test("uses the 1.7 social sign-in payload", () => {
		expect(authentikSocialSignIn("https://brotracker.example/catalog")).toEqual(
			{
				provider: "authentik",
				callbackURL: "https://brotracker.example/catalog",
			},
		);
	});
});
