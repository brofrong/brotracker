import axios from "axios";
import { err, ok, type Result } from "neverthrow";
import z from "zod";
import type { MemoryStore } from "../../utils/memory-store";
import { RUTRACKER_URL } from "./rutracker";

const RUTRACKER_COOKIES_KEY = "rutracker_cookies";

const zodCookies = z.array(
	z.object({
		cookies: z.string(),
		expires: z.number(),
	}),
);

type LoginResult = Result<{ cookies: string }, Error>;

export async function rutrackerGetCookies(
	login: string,
	password: string,
	store: MemoryStore,
): Promise<LoginResult> {
	const cookies = await getCookiesFromStore(store);
	if (cookies.isOk()) {
		return ok({ cookies: cookies.value });
	}
	return await Authorize(login, password, store);
}

async function getCookiesFromStore(store: MemoryStore) {
	const cookies = await store.get(RUTRACKER_COOKIES_KEY);
	if (!cookies) {
		return err("No cookies found in store");
	}
	const parsed = zodCookies.safeParse(JSON.parse(cookies));
	if (!parsed.success) {
		return err(`Failed to parse cookies from store: ${parsed.error.message}`);
	}

	const cookiesArray = parsed.data;
	//check if exipired
	if (checkCookiesExpiration(cookiesArray)) {
		return err("Cookies expired");
	}
	return ok(cookiesToString(cookiesArray));
}

function checkCookiesExpiration(cookies: z.infer<typeof zodCookies>): boolean {
	return cookies.some((cookie) => cookie.expires < Date.now());
}

async function parseCookies(
	cookies: string[],
): Promise<Result<{ cookies: string; expires: number }[], Error>> {
	const cookiesArray = cookies.map((cookie) => {
		const cookieString = cookie.split(";")[0];
		if (!cookieString) {
			return err(new Error("Invalid cookie"));
		}

		// Извлекаем дату из expires=...
		const expiresMatch = cookie.match(/expires=([^;]+)/i);
		if (!expiresMatch) {
			return err(new Error("Cookie does not contain expires"));
		}
		const expiresDateString = expiresMatch.at(1)?.trim();
		if (!expiresDateString) {
			return err(new Error("Cookie does not contain expires"));
		}
		const expiresDate = new Date(expiresDateString);

		if (Number.isNaN(expiresDate.getTime())) {
			return err(new Error(`Invalid date format: ${expiresDateString}`));
		}

		return ok({
			cookies: cookieString,
			expires: expiresDate.getTime(),
		});
	});
	if (cookiesArray.some((cookie) => cookie.isErr())) {
		return err(new Error("Failed to parse cookies"));
	}
	return ok(
		cookiesArray.map((cookie) =>
			cookie.isOk() ? cookie.value : { cookies: "", expires: 0 },
		),
	);
}

async function Authorize(
	login: string,
	password: string,
	store: MemoryStore,
): Promise<LoginResult> {
	const body = {
		login_username: login,
		login_password: password,
		login: "Вход",
	};

	const response = await axios.post(`${RUTRACKER_URL}/forum/login.php`, body, {
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
		maxRedirects: 0,
		validateStatus: (status) => true,
	});
	// Сохраняем cookies из ответа
	const cookiesArray = response.headers["set-cookie"];

	if (!cookiesArray) {
		return err(new Error("No cookies found"));
	}

	const cookies = await parseCookies(cookiesArray);
	if (cookies.isErr()) {
		return err(new Error("Failed to parse cookies"));
	}
	await store.set(RUTRACKER_COOKIES_KEY, JSON.stringify(cookies.value));
	return ok({ cookies: cookiesToString(cookies.value) });
}

function cookiesToString(cookies: z.infer<typeof zodCookies>): string {
	return cookies.map((cookie) => cookie.cookies).join("; ");
}
