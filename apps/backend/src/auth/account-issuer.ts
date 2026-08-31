/** Better Auth 1.7 account identity namespace for rows created before `issuer`. */
export function issuerForExistingAccount(providerId: string): string {
	if (providerId === "credential") {
		return "local:credential";
	}
	return `local:oauth:${encodeURIComponent(providerId)}`;
}

export const OIDC_PROVIDER_ID = "oidc";

export const OIDC_ACCOUNT_ISSUER = issuerForExistingAccount(OIDC_PROVIDER_ID);
