import type { BetterAuthOptions } from "better-auth";
import { OIDC_PROVIDER_ID } from "./account-issuer";

export const OIDC_ACCOUNT_OPTIONS = {
	accountLinking: {
		requireLocalEmailVerified: false,
		trustedProviders: [OIDC_PROVIDER_ID],
	},
} satisfies BetterAuthOptions["account"];
