import { describe, expect, test } from "bun:test";
import { OIDC_ACCOUNT_OPTIONS } from "./account-linking";

describe("OIDC account linking", () => {
	test("links matching emails without either email verification gate", () => {
		expect(OIDC_ACCOUNT_OPTIONS).toEqual({
			identityStrategy: "provider-id",
			accountLinking: {
				requireLocalEmailVerified: false,
				trustedProviders: ["oidc"],
			},
		});
	});
});
