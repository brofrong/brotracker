"use client";

import { EmptyState } from "@astryxdesign/core/EmptyState";
import { List, ListItem } from "@astryxdesign/core/List";
import { VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";

type WorkerLogLevel = "info" | "warn" | "error";

type WorkerLogLine = {
	ts: string;
	level: WorkerLogLevel;
	message: string;
};

const LEVEL_LABEL: Record<WorkerLogLevel, string> = {
	info: "Инфо",
	warn: "Предупреждение",
	error: "Ошибка",
};

const LEVEL_VARIANT: Record<
	WorkerLogLevel,
	"accent" | "warning" | "error"
> = {
	info: "accent",
	warn: "warning",
	error: "error",
};

type RunLogProps = {
	lines: WorkerLogLine[];
};

export function RunLog({ lines }: RunLogProps) {
	if (lines.length === 0) {
		return (
			<EmptyState
				description="У этого запуска пока нет записей в журнале."
				title="Журнал пуст"
			/>
		);
	}

	return (
		<List density="compact" hasDividers>
			{lines.map((line, index) => {
				const levelLabel = LEVEL_LABEL[line.level];
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
	title = "Журнал",
}: RunLogProps & { title?: string }) {
	return (
		<VStack gap={3} width="100%">
			<Text type="label">{title}</Text>
			<RunLog lines={lines} />
		</VStack>
	);
}
