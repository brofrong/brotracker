import pino from "pino";
import pretty from "pino-pretty";

const level = process.env.LOG_LEVEL ?? "info";
const isProduction = process.env.NODE_ENV === "production";

const stream = isProduction
	? undefined
	: pretty({
			colorize: true,
			translateTime: "SYS:standard",
			ignore: "pid,hostname",
		});

export const logger = stream
	? pino({ level }, stream)
	: pino({ level });
