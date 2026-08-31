import { OIDC_PROVIDER_ID } from "./account-issuer";

export const OIDC_ACCOUNT_OPTIONS = {
	identityStrategy: "provider-id",
	accountLinking: {
		requireLocalEmailVerified: false,
		trustedProviders: [OIDC_PROVIDER_ID],
	},
} as const;
