# @absolutejs/job-sources

Read published employer boards from Greenhouse, Lever (global/EU), and Ashby.
This is a board-feed adapter, not a global jobs index, ranking engine, or application sender.

```ts
import { createJobSource } from "@absolutejs/job-sources";
const source = createJobSource({ fetch: authorizedEgressFetch, maxJobs: 500 });
const result = await source.list({ provider: "ashby", board: "Ashby" });
// result.status: complete | partial | failed
```

The host supplies fetch (for example @absolutejs/egress) and owns authorization,
scheduling, storage, retries, and accounting. The client sends unauthenticated
GETs to fixed provider hosts, requests no redirects, and bounds response bytes,
jobs, pages and elapsed time. The supplied transport must honor AbortSignal and
redirect policy. No automatic retry, hidden polling, or candidate data transmission.

Stable keys include provider, region, board, and source identity. Ashby uses its
published job URL because its documented contract does not guarantee a separate
ID. Missing metadata remains null. Greenhouse's update timestamp is not treated
as a publication date; Ashby's timestamp means last publication. Compensation
stays provider-native: salary, equity, currencies, intervals and tiers must not be
summed or compared blindly. Greenhouse list responses do not supply structured
pay ranges; those may appear in description content.

Descriptions are **untrusted provider content**, sometimes HTML or encoded HTML.
Render as text or sanitize at the host boundary; never execute it or treat it as
AI instructions. Listing links are validated HTTPS URLs without credentials.
Unlisted Ashby entries and Greenhouse prospect pools are omitted. Invalid entries,
duplicate IDs, HTTP failures, cancellation and bounds prevent a complete result.
A successful empty board differs from an inaccessible board. Even complete
absence is an observation, not proof that an employer closed a role.

No API credentials required for public reads. The caller chooses specific boards;
these APIs do not enumerate all employers. The package is BSL-1.1 licensed with
an Apache-2.0 change license; see LICENSE.

## Provider contracts

- [Greenhouse Job Board API](https://docs.greenhouse.io/job-board)
- [Lever Postings API](https://github.com/lever/postings-api)
- [Ashby Job Postings API](https://developers.ashbyhq.com/docs/public-job-posting-api)

Verified November 5, 2026. Live provider payloads can change; malformed results
remain explicit failures rather than an empty feed.
