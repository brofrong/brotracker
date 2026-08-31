UPDATE "account"
SET
	"provider_id" = 'oidc',
	"issuer" = 'local:oauth:oidc'
WHERE "provider_id" = 'authentik';--> statement-breakpoint
UPDATE "account"
SET "issuer" = 'local:oauth:oidc'
WHERE "issuer" = 'local:oauth:authentik';
