"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { List, ListItem } from "@astryxdesign/core/List";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import type { AppRouter } from "@brotracker/backend/appRouter";
import type { inferRouterOutputs } from "@trpc/server";
import { useTranslation } from "react-i18next";

export type TrackerDiagnosticsResult =
	inferRouterOutputs<AppRouter>["settings"]["providers"]["rutracker"]["test"];

type DiagnosticStep = TrackerDiagnosticsResult["steps"][number];

const STATUS_VARIANT = {
	ok: "success",
	failed: "error",
	skipped: "neutral",
} as const;

function useStepText() {
	const { t } = useTranslation(["settings", "common"]);

	const label = (step: DiagnosticStep) =>
		t(
			step.id === "egress" && step.viaProxy
				? "diagnostics.steps.egressProxy"
				: `diagnostics.steps.${step.id}`,
		);

	const description = (step: DiagnosticStep): string => {
		if (step.status === "failed" && step.code) {
			return t(`trackerError.${step.code}`, { ns: "common" });
		}
		if (step.status === "ok" && step.latencyMs != null) {
			return t("diagnostics.latency", { ms: step.latencyMs });
		}
		return t(`diagnostics.status.${step.status}`);
	};

	/** Per-mirror results for the tracker step, e.g. "kinozal.tv: Failed". */
	const targets = (step: DiagnosticStep): string | null => {
		if (!step.targets || step.targets.length < 2) {
			return null;
		}
		return step.targets
			.map((target) =>
				target.ok
					? `${target.label}: ${t("diagnostics.latency", { ms: target.latencyMs })}`
					: `${target.label}: ${t("diagnostics.status.failed")}`,
			)
			.join(" · ");
	};

	return { t, label, description, targets };
}

export function TrackerDiagnostics({
	result,
}: {
	result: TrackerDiagnosticsResult;
}) {
	const { t, label, description, targets } = useStepText();
	const failed = result.steps.find((step) => step.status === "failed");

	return (
		<Banner
			status={result.ok ? "success" : "error"}
			title={result.ok ? t("diagnostics.ok") : t("diagnostics.failed")}
			description={failed?.detail}
			defaultIsExpanded
		>
			<List density="compact" header={t("diagnostics.title")}>
				{result.steps.map((step) => (
					<ListItem
						key={step.id}
						label={label(step)}
						startContent={
							<StatusDot
								label={t(`diagnostics.status.${step.status}`)}
								variant={STATUS_VARIANT[step.status]}
							/>
						}
						description={
							// ReactNode so long hints wrap instead of truncating.
							<Text type="supporting">
								{[description(step), targets(step)].filter(Boolean).join(" — ")}
							</Text>
						}
					/>
				))}
			</List>
		</Banner>
	);
}
