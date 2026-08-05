type ProgressVariant = "accent" | "success";

interface TransferProgressBarProps {
	label: string;
	/** Progress in the range 0–100. */
	value: number;
	valueLabel: string;
	variant?: ProgressVariant;
}

/**
 * Stone's --color-on-success is for muted badge/banner surfaces, not solid
 * success fills (in dark both are light green → unreadable). Use the same
 * luminance flip as --color-on-accent: light text on dark fills (light mode),
 * dark text on light fills (dark mode).
 */
const ON_FILL = "light-dark(var(--color-on-dark), var(--color-on-light))";

const fillToken: Record<ProgressVariant, string> = {
	accent: "var(--color-accent)",
	success: "var(--color-success)",
};

/** Progress bar with centered %; clipped dual labels stay contrasted on track and fill. */
export function TransferProgressBar({
	label,
	value,
	valueLabel,
	variant = "accent",
}: TransferProgressBarProps) {
	const pct = Math.min(100, Math.max(0, value));
	const unfilled = Math.max(0, 100 - pct);

	return (
		<div
			role="progressbar"
			aria-label={label}
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={Math.round(pct)}
			aria-valuetext={valueLabel}
			className="relative h-[calc(var(--spacing-5)/1.3)] w-full overflow-hidden rounded-sm"
			style={{ backgroundColor: "var(--color-skeleton)" }}
		>
			<div
				className="absolute inset-y-0 left-0"
				style={{
					width: `${pct}%`,
					backgroundColor: fillToken[variant],
				}}
			/>
			{/* Empty track: primary text contrasts with skeleton in both themes. */}
			<span
				aria-hidden
				className="pointer-events-none absolute inset-0 flex items-center justify-center text-2xs font-semibold tabular-nums"
				style={{
					color: "var(--color-text-primary)",
					clipPath: `inset(0 0 0 ${pct}%)`,
				}}
			>
				{valueLabel}
			</span>
			{/* Fill: on-dark in light mode, on-light in dark — opposite of fill luminance. */}
			<span
				aria-hidden
				className="pointer-events-none absolute inset-0 flex items-center justify-center text-2xs font-semibold tabular-nums"
				style={{
					color: ON_FILL,
					clipPath: `inset(0 ${unfilled}% 0 0)`,
				}}
			>
				{valueLabel}
			</span>
		</div>
	);
}
