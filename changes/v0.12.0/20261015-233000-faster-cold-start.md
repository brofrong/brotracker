---
type: feature
---

Searches no longer wait on Cloudflare checks and tracker logins as often: trackers are warmed up in the background on start, every 15 minutes and after saving their settings; parallel requests share one Cloudflare solve and one login; a tracker that needs more than 8 seconds no longer holds back the others — its cached results are shown and the page picks up its answer when it arrives. Tracker requests that hang now time out after 30 seconds.
