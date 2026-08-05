"use client";

import { EmptyState } from "@astryxdesign/core/EmptyState";
import { List, ListItem } from "@astryxdesign/core/List";
import { VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { useTranslation } from "react-i18next";

type WorkerLogLevel = "info" | "warn" | "error";

type WorkerLogLine = {
	ts: string;
	level: WorkerLogLevel;
	message: string;
};

const LEVEL_VARIANT: Record<WorkerLogLevel, "accent" | "warning" | "error"> = {
	info: "accent",
	warn: "warning",
	error: "error",
};

type RunLogProps = {
	lines: WorkerLogLine[];
};

export function RunLog({ lines }: RunLogProps) {
	const { t } = useTranslation("workers");

	if (lines.length === 0) {
		return (
			<EmptyState
				description={t("log.emptyDescription")}
				title={t("log.emptyTitle")}
			/>
		);
	}

	return (
		<List density="compact" hasDividers>
			{lines.map((line, index) => {
				const levelLabel = t(`log.levels.${line.level}`);
				return (
					<ListItem
						key={`${line.ts}-${index}`}
						description={<Text type="supporting">{line.message}</Text>}
						endContent={
							<Timestamp format="time" type="supporting" value={line.ts} />
						}
						label={<Text type="label">{levelLabel}</Text>}
						startContent={
							<StatusDot
								label={levelLabel}
								variant={LEVEL_VARIANT[line.level]}
							/>
						}
					/>
				);
			})}
		</List>
	);
}

export function RunLogPanel({
	lines,
	title,
}: RunLogProps & { title?: string }) {
	const { t } = useTranslation("workers");

	return (
		<VStack gap={3} width="100%">
			<Text type="label">{title ?? t("log.defaultTitle")}</Text>
			<RunLog lines={lines} />
		</VStack>
	);
}
