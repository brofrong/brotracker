"use client";

import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import {
	ArrowDownToLine,
	ArrowUpFromLine,
	HardDrive,
	Scale,
	Square,
} from "lucide-react";
import {
	type ComponentType,
	type SVGProps,
	useEffect,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { useLocale } from "#/shared/i18n/locale-provider";
import { formatBytes, formatSpeed } from "#/shared/lib/format";

export type TransferDayData = {
	date: string;
	downloadedBytes: number | null;
	uploadedBytes: number | null;
	avgDownloadSpeed?: number | null;
	avgUploadSpeed?: number | null;
};

export type SpeedSamplePointData = {
	t: string;
	downloadSpeed: number;
	uploadSpeed: number;
};

export type TransferStatsData = {
	downloadedBytes: number;
	uploadedBytes: number;
	downloadSpeed?: number;
	uploadSpeed?: number;
	freeSpaceBytes?: number;
	ratio?: number;
	history?: TransferDayData[];
	recentSpeeds?: SpeedSamplePointData[];
};

const chartColors = {
	upload: "var(--color-data-categorical-blue, #0171E3)",
	download: "var(--color-data-categorical-orange, #EB6E00)",
	grid: "var(--color-border, rgba(5, 54, 89, 0.1))",
};

const axisTick = {
	fontSize: "var(--font-size-sm, 12px)",
	fill: "var(--color-text-secondary, #4E606F)",
};

const chartMargin = { top: 5, right: 10, left: 0, bottom: 5 };

const LIVE_WINDOW_MS = 60_000;
const MAX_SPEED_SAMPLES = 64; // DB seed (10 min at 15s) plus live points (5s polling)

type SpeedSample = { t: number; down: number; up: number };

/**
 * Speed readings for the live chart: seeded once from the backend's recent
 * samples so the chart is populated on load, then appended on every poll.
 */
function useSpeedSamples(
	stats: TransferStatsData,
	updatedAt: number,
): SpeedSample[] {
	const [samples, setSamples] = useState<SpeedSample[]>([]);
	const seeded = useRef(false);
	const lastSampledAt = useRef(0);

	useEffect(() => {
		if (!seeded.current && stats.recentSpeeds?.length) {
			seeded.current = true;
			const points = stats.recentSpeeds
				.map((p) => ({
					t: Date.parse(p.t),
					down: p.downloadSpeed,
					up: p.uploadSpeed,
				}))
				.filter((p) => Number.isFinite(p.t));
			if (points.length > 0) {
				setSamples(points.slice(-MAX_SPEED_SAMPLES));
				lastSampledAt.current = points[points.length - 1]?.t ?? 0;
			}
		}

		if (updatedAt <= lastSampledAt.current) return;
		if (stats.downloadSpeed == null && stats.uploadSpeed == null) return;
		lastSampledAt.current = updatedAt;
		const sample: SpeedSample = {
			t: updatedAt,
			down: stats.downloadSpeed ?? 0,
			up: stats.uploadSpeed ?? 0,
		};
		setSamples((prev) => [...prev.slice(-(MAX_SPEED_SAMPLES - 1)), sample]);
	}, [stats, updatedAt]);

	return samples;
}

/** Short "05.08" label from a YYYY-MM-DD day key. */
function formatDayLabel(date: string): string {
	const [, month, day] = date.split("-");
	return `${day}.${month}`;
}

/** Compact axis tick: 512 MB instead of "512.0 MB". */
function formatAxisBytes(bytes: number): string {
	if (bytes <= 0) return "0";
	const k = 1024;
	const units = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.min(
		Math.floor(Math.log(bytes) / Math.log(k)),
		units.length - 1,
	);
	return `${Math.round(bytes / k ** i)} ${units[i]}`;
}

function ChartLegendItem({ color, label }: { color: string; label: string }) {
	return (
		<HStack gap={2} vAlign="center">
			<Square aria-hidden="true" color={color} fill={color} size={10} />
			<Text type="supporting">{label}</Text>
		</HStack>
	);
}

type TooltipEntry = {
	name?: string;
	value?: number | string;
	color?: string;
	dataKey?: string | number;
	payload?: { t?: number };
};

/** Hover tooltip for the live speed sparkline: speed at that moment + time. */
function SpeedTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: readonly TooltipEntry[];
}) {
	const { bcp47 } = useLocale();
	if (!active || !payload?.length) return null;
	const entry = payload[0];
	if (!entry || typeof entry.value !== "number") return null;
	const time = entry.payload?.t;
	return (
		<Card padding={3}>
			<VStack gap={0}>
				<Text hasTabularNumbers type="supporting">
					{formatSpeed(entry.value)}
				</Text>
				{time != null ? (
					<Text type="supporting">
						{new Date(time).toLocaleTimeString(bcp47)}
					</Text>
				) : null}
			</VStack>
		</Card>
	);
}

function BytesTooltip({
	active,
	payload,
	label,
}: {
	active?: boolean;
	payload?: readonly TooltipEntry[];
	label?: string;
}) {
	if (!active || !payload?.length) return null;
	return (
		<Card padding={3}>
			<VStack gap={1}>
				{label ? <Text type="supporting">{label}</Text> : null}
				{payload.map((entry) => (
					<HStack
						gap={2}
						key={String(entry.dataKey ?? entry.name)}
						vAlign="center"
					>
						<Square
							aria-hidden="true"
							color={entry.color ?? "currentColor"}
							fill={entry.color ?? "currentColor"}
							size={10}
						/>
						<Text hasTabularNumbers type="supporting">
							{entry.name}:{" "}
							{typeof entry.value === "number" ? formatBytes(entry.value) : "—"}
						</Text>
					</HStack>
				))}
			</VStack>
		</Card>
	);
}

function KpiCard({
	icon,
	label,
	value,
	hint,
	sparkData,
	sparkColor,
}: {
	icon: ComponentType<SVGProps<SVGSVGElement>>;
	label: string;
	value: string;
	hint?: string;
	sparkData?: { i: number; v: number; t: number }[];
	sparkColor?: string;
}) {
	return (
		<Card elevation="low" padding={4} width="100%">
			<VStack gap={2} width="100%">
				<HStack gap={2} vAlign="center">
					<Icon color="secondary" icon={icon} size="sm" />
					<Text type="supporting">{label}</Text>
				</HStack>
				<Text hasTabularNumbers size="xl" type="body">
					{value}
				</Text>
				{hint != null ? (
					<Text hasTabularNumbers type="supporting">
						{hint}
					</Text>
				) : null}
				{sparkData != null && sparkData.length > 1 && sparkColor != null ? (
					<ResponsiveContainer height={40} width="100%">
						<LineChart data={sparkData}>
							<Tooltip
								content={<SpeedTooltip />}
								cursor={{ stroke: chartColors.grid }}
							/>
							<Line
								dataKey="v"
								dot={false}
								isAnimationActive={false}
								stroke={sparkColor}
								strokeWidth={1.5}
								type="linear"
							/>
						</LineChart>
					</ResponsiveContainer>
				) : null}
			</VStack>
		</Card>
	);
}

function DailyTrafficCard({ days }: { days: TransferDayData[] }) {
	const { t } = useTranslation("home");
	const data = days.map((d) => ({
		label: formatDayLabel(d.date),
		uploaded: d.uploadedBytes,
		downloaded: d.downloadedBytes,
	}));

	return (
		<Card elevation="low" padding={5} width="100%">
			<VStack gap={3} width="100%">
				<Heading level={3}>{t("transferStats.dailyTraffic")}</Heading>
				<ResponsiveContainer height={220} width="100%">
					<BarChart data={data} margin={chartMargin}>
						<CartesianGrid
							horizontal
							stroke={chartColors.grid}
							vertical={false}
						/>
						<XAxis
							axisLine={false}
							dataKey="label"
							interval={4}
							tick={axisTick}
							tickLine={false}
						/>
						<YAxis
							axisLine={false}
							tick={axisTick}
							tickFormatter={formatAxisBytes}
							tickLine={false}
							width={52}
						/>
						<Tooltip
							content={<BytesTooltip />}
							cursor={{ fill: chartColors.grid }}
						/>
						<Bar
							dataKey="uploaded"
							fill={chartColors.upload}
							name={t("transferStats.uploaded")}
							radius={[3, 3, 0, 0]}
						/>
						<Bar
							dataKey="downloaded"
							fill={chartColors.download}
							name={t("transferStats.downloaded")}
							radius={[3, 3, 0, 0]}
						/>
					</BarChart>
				</ResponsiveContainer>
				<HStack gap={6} vAlign="center">
					<ChartLegendItem
						color={chartColors.upload}
						label={t("transferStats.uploaded")}
					/>
					<ChartLegendItem
						color={chartColors.download}
						label={t("transferStats.downloaded")}
					/>
				</HStack>
			</VStack>
		</Card>
	);
}

function CumulativeTrafficCard({ days }: { days: TransferDayData[] }) {
	const { t } = useTranslation("home");
	let downloaded = 0;
	let uploaded = 0;
	const data = days.map((d) => {
		downloaded += d.downloadedBytes ?? 0;
		uploaded += d.uploadedBytes ?? 0;
		return { label: formatDayLabel(d.date), downloaded, uploaded };
	});

	return (
		<Card elevation="low" padding={5} width="100%">
			<VStack gap={3} width="100%">
				<Heading level={3}>{t("transferStats.cumulativeTraffic")}</Heading>
				<ResponsiveContainer height={220} width="100%">
					<AreaChart data={data} margin={chartMargin}>
						<CartesianGrid
							horizontal
							stroke={chartColors.grid}
							vertical={false}
						/>
						<XAxis
							axisLine={false}
							dataKey="label"
							interval={4}
							tick={axisTick}
							tickLine={false}
						/>
						<YAxis
							axisLine={false}
							tick={axisTick}
							tickFormatter={formatAxisBytes}
							tickLine={false}
							width={52}
						/>
						<Tooltip
							content={<BytesTooltip />}
							cursor={{ stroke: chartColors.grid }}
						/>
						<Area
							dataKey="uploaded"
							fill={chartColors.upload}
							fillOpacity={0.15}
							name={t("transferStats.uploadedCumulative")}
							stroke={chartColors.upload}
							strokeWidth={2}
							type="monotone"
						/>
						<Area
							dataKey="downloaded"
							fill={chartColors.download}
							fillOpacity={0.15}
							name={t("transferStats.downloadedCumulative")}
							stroke={chartColors.download}
							strokeWidth={2}
							type="monotone"
						/>
					</AreaChart>
				</ResponsiveContainer>
				<HStack gap={6} vAlign="center">
					<ChartLegendItem
						color={chartColors.upload}
						label={t("transferStats.uploadedCumulative")}
					/>
					<ChartLegendItem
						color={chartColors.download}
						label={t("transferStats.downloadedCumulative")}
					/>
				</HStack>
			</VStack>
		</Card>
	);
}

export function TransferStatsWidget({
	stats,
	updatedAt,
}: {
	stats: TransferStatsData;
	updatedAt: number;
}) {
	const { t } = useTranslation("home");
	const speedSamples = useSpeedSamples(stats, updatedAt);
	const liveSamples = speedSamples.filter(
		(s) => s.t > updatedAt - LIVE_WINDOW_MS,
	);
	const downSpark = liveSamples.map((s, i) => ({ i, v: s.down, t: s.t }));
	const upSpark = liveSamples.map((s, i) => ({ i, v: s.up, t: s.t }));

	const history = stats.history;
	const hasDailyData =
		history?.some(
			(d) => d.uploadedBytes != null || d.downloadedBytes != null,
		) ?? false;

	return (
		<VStack gap={4} width="100%">
			<Heading level={2}>{t("transferStats.heading")}</Heading>
			<Grid columns={{ minWidth: 200, max: 4 }} gap={3} width="100%">
				<KpiCard
					hint={
						stats.downloadSpeed != null
							? formatSpeed(stats.downloadSpeed)
							: undefined
					}
					icon={ArrowDownToLine}
					label={t("transferStats.downloaded")}
					sparkColor={chartColors.download}
					sparkData={downSpark}
					value={formatBytes(stats.downloadedBytes)}
				/>
				<KpiCard
					hint={
						stats.uploadSpeed != null
							? formatSpeed(stats.uploadSpeed)
							: undefined
					}
					icon={ArrowUpFromLine}
					label={t("transferStats.uploaded")}
					sparkColor={chartColors.upload}
					sparkData={upSpark}
					value={formatBytes(stats.uploadedBytes)}
				/>
				{stats.ratio != null ? (
					<KpiCard
						hint={t("transferStats.ratioHint")}
						icon={Scale}
						label={t("transferStats.ratio")}
						value={stats.ratio.toFixed(2)}
					/>
				) : null}
				{stats.freeSpaceBytes != null ? (
					<KpiCard
						icon={HardDrive}
						label={t("transferStats.freeDisk")}
						value={formatBytes(stats.freeSpaceBytes)}
					/>
				) : null}
			</Grid>

			{history != null && hasDailyData ? (
				<Grid columns={{ minWidth: 320, max: 2 }} gap={3} width="100%">
					<DailyTrafficCard days={history} />
					<CumulativeTrafficCard days={history} />
				</Grid>
			) : null}

			{history != null && !hasDailyData ? (
				<Card elevation="low" padding={5} width="100%">
					<VStack gap={2} width="100%">
						<Heading level={3}>{t("transferStats.dailyTraffic")}</Heading>
						<Text type="supporting">{t("transferStats.historyEmpty")}</Text>
					</VStack>
				</Card>
			) : null}
		</VStack>
	);
}
