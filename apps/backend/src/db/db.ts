import { drizzle } from "drizzle-orm/bun-sql";
import { env } from "../utils/env";
import { relations } from "./relations";

export const db = drizzle(env.DATABASE_URL, { relations });
