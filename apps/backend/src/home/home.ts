export type TransferStats = {
	downloadedBytes: number;
	uploadedBytes: number;
	downloadSpeed?: number;
	uploadSpeed?: number;
	freeSpaceBytes?: number;
	ratio?: number;
};

export type WidgetEnvelope<T> =
	| { status: "ok"; data: T }
	| { status: "unavailable" }
	| { status: "empty" };

export type ComposeWidgetRequest = {
	key: string;
	widget: string;
};

export type ComposeResponse = {
	widgets: Record<string, WidgetEnvelope<TransferStats>>;
};

export type HomeDeps = {
	getTransferStats: () => Promise<TransferStats | null>;
};

export function createHome(deps: HomeDeps) {
	return {
		compose: async ({
			widgets,
		}: {
			widgets: ComposeWidgetRequest[];
		}): Promise<ComposeResponse> => {
			const result: Record<string, WidgetEnvelope<TransferStats>> = {};

			for (const { key, widget } of widgets) {
				if (widget !== "transferStats") {
					continue;
				}

				const stats = await deps.getTransferStats();
				if (stats === null) {
					result[key] = { status: "unavailable" };
					continue;
				}

				if (stats.downloadedBytes === 0 && stats.uploadedBytes === 0) {
					result[key] = { status: "empty" };
					continue;
				}

				result[key] = { status: "ok", data: stats };
			}

			return { widgets: result };
		},
	};
}

export type Home = ReturnType<typeof createHome>;
