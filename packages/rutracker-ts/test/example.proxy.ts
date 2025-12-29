import { HttpsProxyAgent } from "https-proxy-agent";
import axios from "axios";

const proxy = "http://cyberhero:ZK268qc87XnGVZXCiwdu8JVnaMb4FebZ@91.132.58.132:9988";

const agent = new HttpsProxyAgent(proxy);

const URL = "https://rutracker.org";

const response = await axios.get(URL, {
  httpsAgent: agent,
});
