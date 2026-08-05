import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";
import { workers } from "./index";

function mapWorkerError(error: unknown): never {
	if (error instanceof Error) {
		if (/unknown worker/i.test(error.message)) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: error.message,
			});
		}
		if (/already running/i.test(error.message)) {
			throw new TRPCError({
				code: "CONFLICT",
				message: error.message,
			});
		}
	}
	throw error;
}

export const workersRouter = router({
	list: protectedProcedure.query(async () => workers.list()),

	get: protectedProcedure
		.input(z.object({ id: z.string() }))
		.query(async ({ input }) => {
			const detail = await workers.get(input.id);
			if (!detail) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Unknown worker: ${input.id}`,
				});
			}
			return detail;
		}),

	listRuns: protectedProcedure
		.input(
			z.object({
				workerId: z.string(),
				limit: z.number().int().min(1).max(100).optional(),
			}),
		)
		.query(async ({ input }) => {
			try {
				return await workers.listRuns(input.workerId, input.limit);
			} catch (error) {
				mapWorkerError(error);
			}
		}),

	getRun: protectedProcedure
		.input(z.object({ runId: z.string() }))
		.query(async ({ input }) => {
			const run = await workers.getRun(input.runId);
			if (!run) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Worker run not found: ${input.runId}`,
				});
			}
			return run;
		}),

	run: protectedProcedure
		.input(z.object({ workerId: z.string() }))
		.mutation(async ({ input }) => {
			try {
				return await workers.run(input.workerId);
			} catch (error) {
				mapWorkerError(error);
			}
		}),
});
