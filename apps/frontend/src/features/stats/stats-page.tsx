"use client";

import { Banner } from "@astryxdesign/core/Banner";
import type { ISODateString } from "@astryxdesign/core/Calendar";
import { Card } from "@astryxdesign/core/Card";
import {
	type DateRange,
	DateRangeInput,
	type DateRangePreset,
} from "@astryxdesign/core/DateRangeInput";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Section } from "@astryxdesign/core/Section";
import { Spinner } from "@astryxdesign/core/Spinner";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useQuery } from "@tanstack/react-query";
import { Square } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	Area,
	CartesianGrid,
	ComposedChart,
	Line,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { useLocale } from "#/shared/i18n/locale-provider";
import { formatSpeed } from "#/shared/lib/format";
import { trpc } from "#/shared/lib/trpc";

const DAY_MS = 86_400_000;
/** Inclusive span must stay within backend SPEED_HISTORY_MAX_DAYS. */
const MAX_RANGE_DAYS = 1096;

const chartColors = {
	upload: "var(--color-data-categorical-blue, #0171E3)",
	download: "var(--color-data-categorical-orange, #EB6E00)",
	grid: "var(--color-border, rgba(5, 54, 89, 0.1))",
};

const axisTick = {
	fontSize: "var(--font-size-sm, 12px)",
	fill: "var(--color-text-secondary, #4E606F)",
};

const chartMargin = { top: 8, right: 12, left: 0, bottom: 5 };

function utcToday(): string {
	return new Date().toISOString().slice(0, 10);
}

/** Inclusive window ending today: `days` calendar days. */
function rangeEndingToday(days: number): DateRange {
	const end = utcToday();
	const startMs = Date.parse(`${end}T00:00:00Z`) - (days - 1) * DAY_MS;
	return {
		start: new Date(startMs).toISOString().slice(0, 10) as ISODateString,
		end: end as ISODateString,
	};
}

function inclusiveDaySpan(from: string, to: string): number {
	return (
		(Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS +
		1
	);
}

function formatDayLabel(date: string): string {
	const [, month, day] = date.split("-");
	return `${day}.${month}`;
}

function formatAxisSpeed(bytesPerSec: number): string {
	if (bytesPerSec <= 0) return "0";
	const k = 1024;
	const units = ["B", "KB", "MB", "GB"];
	const i = Math.min(
		Math.floor(Math.log(bytesPerSec) / Math.log(k)),
		units.length - 1,
	);
	return `${Math.round(bytesPerSec / k ** i)} ${units[i]}/s`;
}

type ChartPoint = {
	date: string;
	label: string;
	downAvg: number | null;
	downMin: number | null;
	downBand: number | null;
	upAvg: number | null;
	upMin: number | null;
	upBand: number | null;
	downMax: number | null;
	upMax: number | null;
};

type TooltipEntry = {
	dataKey?: string | number;
	payload?: ChartPoint;
};

function ChartLegendItem({ color, label }: { color: string; label: string }) {
	return (
		<HStack gap={2} vAlign="center">
			<Square aria-hidden="true" color={color} fill={color} size={10} />
			<Text type="supporting">{label}</Text>
		</HStack>
	);
}

function SpeedHistoryTooltip({
	active,
	payload,
	label,
}: {
	active?: boolean;
	payload?: readonly TooltipEntry[];
	label?: string;
}) {
	const { t } = useTranslation("stats");
	if (!active || !payload?.length) return null;
	const point = payload[0]?.payload;
	if (!point) return null;

	const rows: {
		color: string;
		name: string;
		extremes: { min: number; avg: number; max: number };
	}[] = [];
	if (point.downAvg != null && point.downMin != null && point.downMax != null) {
		rows.push({
			color: chartColors.download,
			name: t("download"),
			extremes: {
				min: point.downMin,
				avg: point.downAvg,
				max: point.downMax,
			},
		});
	}
	if (point.upAvg != null && point.upMin != null && point.upMax != null) {
		rows.push({
			color: chartColors.upload,
			name: t("upload"),
			extremes: { min: point.upMin, avg: point.upAvg, max: point.upMax },
		});
	}
	if (rows.length === 0) return null;

	return (
		<Card padding={3}>
			<VStack gap={1}>
				{label ? <Text type="supporting">{label}</Text> : null}
				{rows.map((row) => (
					<HStack gap={2} key={row.name} vAlign="center">
						<Square
							aria-hidden="true"
							color={row.color}
							fill={row.color}
							size={10}
						/>
						<Text hasTabularNumbers type="supporting">
							{row.name}: {formatSpeed(row.extremes.min)} ·{" "}
							{formatSpeed(row.extremes.avg)} · {formatSpeed(row.extremes.max)}
						</Text>
					</HStack>
				))}
				<Text type="supporting">{t("tooltipHint")}</Text>
			</VStack>
		</Card>
	);
}

export function StatsPage() {
	const { t } = useTranslation("stats");
	const { bcp47 } = useLocale();
	const [range, setRange] = useState<DateRange>(() => rangeEndingToday(365));

	const presets = useMemo<DateRangePreset[]>(
		() => [
			{ label: t("preset30d"), getRange: () => rangeEndingToday(30) },
			{ label: t("preset90d"), getRange: () => rangeEndingToday(90) },
			{ label: t("preset1y"), getRange: () => rangeEndingToday(365) },
		],
		[t],
	);

	const spanOk =
		range != null && inclusiveDaySpan(range.start, range.end) <= MAX_RANGE_DAYS;

	const query = useQuery({
		...trpc.home.speedHistory.queryOptions({
			from: range?.start ?? utcToday(),
			to: range?.end ?? utcToday(),
		}),
		enabled: range != null && spanOk,
	});

	const chartData = useMemo<ChartPoint[]>(() => {
		const days = query.data?.days ?? [];
		return days.map((d) => ({
			date: d.date,
			label: formatDayLabel(d.date),
			downAvg: d.download?.avg ?? null,
			downMin: d.download?.min ?? null,
			downMax: d.download?.max ?? null,
			downBand: d.download != null ? d.download.max - d.download.min : null,
			upAvg: d.upload?.avg ?? null,
			upMin: d.upload?.min ?? null,
			upMax: d.upload?.max ?? null,
			upBand: d.upload != null ? d.upload.max - d.upload.min : null,
		}));
	}, [query.data?.days]);

	const hasActiveDay = chartData.some(
		(d) => d.downAvg != null || d.upAvg != null,
	);

	const xInterval = Math.max(0, Math.floor(chartData.length / 12) - 1);

	return (
		<Section>
			<VStack gap={5} width="100%">
				<VStack gap={2} width="100%">
					<Heading level={1}>{t("title")}</Heading>
					<Text type="supporting">{t("description")}</Text>
				</VStack>

				<DateRangeInput
					hasClear={false}
					label={t("rangeLabel")}
					max={utcToday() as ISODateString}
					onChange={(next) => {
						setRange(next ?? rangeEndingToday(365));
					}}
					presets={presets}
					size="sm"
					status={
						range != null && !spanOk
							? { type: "error", message: t("rangeTooLong") }
							: undefined
					}
					value={range}
					width="100%"
				/>

				{query.isLoading ? (
					<HStack gap={3} vAlign="center">
						<Spinner size="sm" />
						<Text type="supporting">{t("loading")}</Text>
					</HStack>
				) : null}

				{query.isError ? (
					<Banner
						description={t("loadFailed")}
						status="error"
						title={t("loadFailedTitle")}
					/>
				) : null}

				{query.isSuccess && !hasActiveDay ? (
					<EmptyState
						description={t("emptyDescription")}
						title={t("emptyTitle")}
					/>
				) : null}

				{query.isSuccess && hasActiveDay ? (
					<Card elevation="low" padding={5} width="100%">
						<VStack gap={3} width="100%">
							<HStack gap={4} vAlign="center" wrap="wrap">
								<Heading level={3}>{t("chartHeading")}</Heading>
								<HStack gap={3} vAlign="center">
									<ChartLegendItem
										color={chartColors.download}
										label={t("download")}
									/>
									<ChartLegendItem
										color={chartColors.upload}
										label={t("upload")}
									/>
								</HStack>
							</HStack>
							<Text type="supporting">
								{t("chartSubheading", {
									from: new Date(
										`${range?.start ?? utcToday()}T00:00:00Z`,
									).toLocaleDateString(bcp47),
									to: new Date(
										`${range?.end ?? utcToday()}T00:00:00Z`,
									).toLocaleDateString(bcp47),
								})}
							</Text>
							<ResponsiveContainer height={360} width="100%">
								<ComposedChart data={chartData} margin={chartMargin}>
									<CartesianGrid
										horizontal
										stroke={chartColors.grid}
										vertical={false}
									/>
									<XAxis
										axisLine={false}
										dataKey="label"
										interval={xInterval}
										tick={axisTick}
										tickLine={false}
									/>
									<YAxis
										axisLine={false}
										tick={axisTick}
										tickFormatter={formatAxisSpeed}
										tickLine={false}
										width={64}
									/>
									<Tooltip
										content={<SpeedHistoryTooltip />}
										cursor={{ stroke: chartColors.grid }}
									/>
									<Area
										connectNulls={false}
										dataKey="downMin"
										fill="transparent"
										isAnimationActive={false}
										stackId="down"
										stroke="none"
										type="monotone"
									/>
									<Area
										connectNulls={false}
										dataKey="downBand"
										fill={chartColors.download}
										fillOpacity={0.18}
										isAnimationActive={false}
										stackId="down"
										stroke="none"
										type="monotone"
									/>
									<Area
										connectNulls={false}
										dataKey="upMin"
										fill="transparent"
										isAnimationActive={false}
										stackId="up"
										stroke="none"
										type="monotone"
									/>
									<Area
										connectNulls={false}
										dataKey="upBand"
										fill={chartColors.upload}
										fillOpacity={0.18}
										isAnimationActive={false}
										stackId="up"
										stroke="none"
										type="monotone"
									/>
									<Line
										connectNulls={false}
										dataKey="downAvg"
										dot={false}
										isAnimationActive={false}
										name={t("download")}
										stroke={chartColors.download}
										strokeWidth={2}
										type="monotone"
									/>
									<Line
										connectNulls={false}
										dataKey="upAvg"
										dot={false}
										isAnimationActive={false}
										name={t("upload")}
										stroke={chartColors.upload}
										strokeWidth={2}
										type="monotone"
									/>
								</ComposedChart>
							</ResponsiveContainer>
						</VStack>
					</Card>
				) : null}
			</VStack>
		</Section>
	);
}
