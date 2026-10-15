---
type: fix
---

RuTracker search, downloads and covers recover on their own when RuTracker drops the saved session: the app logs in again instead of silently returning no results, and reports a clear login error if RuTracker rejects the credentials.
