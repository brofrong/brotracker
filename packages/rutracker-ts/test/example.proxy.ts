import { HttpsProxyAgent } from "https-proxy-agent";
import axios from "axios";

const proxy = "http://user:pass@proxy.example:8080";

const agent = new HttpsProxyAgent(proxy);

const URL = "https://rutracker.org";

const response = await axios.get(URL, {
  httpsAgent: agent,
});
