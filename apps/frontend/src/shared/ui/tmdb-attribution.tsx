"use client";

import { Link } from "@astryxdesign/core/Link";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useTranslation } from "react-i18next";

const TMDB_HOME = "https://www.themoviedb.org/";

/**
 * Required TMDB attribution (API Terms §3 + logos-attribution).
 * Logo is the official Alt short (blue) SVG — less prominent than app branding.
 */
export function TmdbAttribution({ compact = false }: { compact?: boolean }) {
	const { t } = useTranslation("common");

	return (
		<VStack gap={compact ? 1 : 2} width="100%">
			<HStack gap={2} vAlign="center" wrap="wrap">
				<Link
					href={TMDB_HOME}
					isExternalLink
					label={t("tmdb.linkLabel")}
					newTabLabel={t("tmdb.newTabLabel")}
				>
					<img
						alt={t("tmdb.logoAlt")}
						height={20}
						src="/tmdb-logo-short.svg"
						width={154}
					/>
				</Link>
			</HStack>
			<Text type="supporting">{t("tmdb.disclaimer")}</Text>
		</VStack>
	);
}
