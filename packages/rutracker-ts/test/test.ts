import { HttpsProxyAgent } from "https-proxy-agent";
import axios from "axios";
import { env } from "../src/utils/env";
import parse from "node-html-parser";
import iconv from "iconv-lite";

const proxy =
	"http://cyberhero:ZK268qc87XnGVZXCiwdu8JVnaMb4FebZ@91.132.58.132:9988";

const agent = new HttpsProxyAgent(proxy);

const TRACKER_URL = "https://rutracker.org";
axios.defaults.withCredentials = true;

// console.log("making request");
// const response = await axios.get(trackerURL, {
// 	httpsAgent: agent,
// });
// console.log("request made");

// // console.log(await response.data);
const cookies = await login(env.username, env.password);
console.log(cookies);

// await search(cookies);

// async function login() {
// 	const body = new URLSearchParams();

// 	body.append("login_username", env.username);
// 	body.append("login_password", env.password);
// 	body.append("login", "Вход");

// 	const response = await axios.post(
// 		trackerURL + "/forum/login.php",
// 		body.toString(),
// 		{
// 			maxRedirects: 0,
// 			validateStatus: (status) => true,
// 		},
// 	);
// 	// Сохраняем cookies из ответа
// 	const cookiesArray = response.headers["set-cookie"];
// 	const cookieString =
// 		cookiesArray?.map((cookie) => cookie.split(";")[0]).join("; ") || "";

// 	console.log(cookieString);

// 	return cookieString;
// }

async function login(login: string, password: string) {
	// const body = new URLSearchParams();
	// body.append("login_username", env.username);
	// body.append("login_password", env.password);
	// body.append("login", "Вход");

	const body = {
		login_username: login,
		login_password: password,
		login: "Вход",
	};

	const response = await axios.post(`${TRACKER_URL}/forum/login.php`, body, {
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
		maxRedirects: 0,
		validateStatus: (status) => true,
	});
	// Сохраняем cookies из ответа
	const cookiesArray = response.headers["set-cookie"];
	console.log(cookiesArray);
	const cookieString =
		cookiesArray?.map((cookie) => cookie.split(";")[0]).join("; ") || "";
	return cookieString;
}

async function search(cookies: string) {
	const body = new URLSearchParams();
	body.append("nm", "Arcane");
	body.append("o", "4"); // sort type
	body.append("s", "2"); // sort order
	const response = await axios.post(
		TRACKER_URL + "/forum/tracker.php",
		body.toString(),
		{
			responseType: "arraybuffer",
			headers: {
				Cookie: cookies,
			},
		},
	);

	const root = parse(iconv.decode(response.data, "windows-1251"));

	const searchResults = root.querySelector("#search-results");
	const rows = searchResults?.querySelectorAll("tr");
	const results: {
		file: string;
		approved: string;
		tags: string;
		title: string;
		author: string;
		size: string;
		seeds: string;
		leeches: string;
		downloads: string;
		date: string;
	}[] = [];

	for (const row of rows ?? []) {
		const cells = row.querySelectorAll("td");
		const file = cells.at(0)?.textContent;
		const approved = cells.at(1)?.textContent;
		const tags = cells.at(2)?.textContent?.trim();
		const title = cells.at(3)?.textContent?.trim();
		const author = cells.at(4)?.textContent?.trim();
		const size = cells.at(5)?.textContent?.trim();
		const seeds = cells.at(6)?.textContent?.trim();
		const leeches = cells.at(7)?.textContent?.trim();
		const downloads = cells.at(8)?.textContent?.trim();
		const date = cells.at(9)?.textContent?.trim();
		if (
			!file ||
			!approved ||
			!tags ||
			!title ||
			!author ||
			!size ||
			!seeds ||
			!leeches ||
			!downloads ||
			!date
		) {
			continue;
		}
		results.push({
			file,
			approved,
			tags,
			title,
			author,
			size,
			seeds,
			leeches,
			downloads,
			date,
		});
	}
	console.log(results);
	return results;
}
