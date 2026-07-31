import pino from "pino";

const level = process.env.LOG_LEVEL ?? "info";
const isProduction = process.env.NODE_ENV === "production";

export const logger = isProduction
	? pino({ level })
	: pino(
			{ level },
			(await import("pino-pretty")).default({
				colorize: true,
				translateTime: "SYS:standard",
				ignore: "pid,hostname",
			}),
		);
