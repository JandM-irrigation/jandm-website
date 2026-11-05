# 1-Tap Review: measurement and reporting

Read-only performance counts for the staff 1-Tap Review tool (`review.html` → `/api/review-request`).
This builds on PR #4 (staff-only server function) and does nothing until PR #4 is live.

## Who can do what

| Key | Netlify variable | Can send | Can read the report |
|---|---|---|---|
| Juan's sending key | `REVIEW_STAFF_KEYS` (label `juan`) | Yes, and the only one that can | No |
| Any other `REVIEW_STAFF_KEYS` label | `REVIEW_STAFF_KEYS` | **No** (403 `sender_not_allowed`, not counted) | No |
| MOA report key (`rpt_…`) | `REVIEW_REPORT_KEYS` | **Never** | Yes |

Juan-only sending is enforced in code (`netlify/lib/review-auth.mjs`): adding a key to the list
cannot add a sender. Report keys are authenticated separately. They start with `rpt_`, are hashed
with their own prefix, are refused outright by `/api/review-request`, and are the only keys
`/api/review-metrics` accepts.

## What is counted

Each request from Juan's key leaves one marker in the existing Netlify Blobs store
`review-requests`: `metrics/v1/events/<day>/<outcome>/<random id>`, with value `{}`. Days are
Mountain Time. Every night the finished days are rolled into one aggregate per day
(`metrics/v1/daily/<day>`) and their markers are deleted.

| Column | Meaning |
|---|---|
| `attempts` | Every request from Juan's key, whatever the result. |
| `webhook_accepted` | GoHighLevel answered 2xx. **The webhook was accepted. This does not mean a text was delivered.** |
| `duplicate` | Not sent: the same tap was already handled, that number got a request in the last 24 hours, or a simultaneous request for the number (`hold_conflict`). |
| `rate_limited` | Not sent: over 20/hour or 60/day, or the limit counter was busy (see Known limitations). |
| `upstream_failure` | Not sent: GoHighLevel refused the request or could not be reached. |
| `upstream_unconfirmed` | GoHighLevel did not answer within 10 s. It may or may not have received the request. |
| `invalid` | Not sent: invalid name, phone number or request. |
| `delivery_confirmed` | Always `not_measured`. The website cannot see SMS delivery (see below). |

`attempts` = the sum of the six outcome columns. Not counted: requests without a valid key,
requests from non-Juan labels, and requests refused before authentication. All of these remain in
the function logs.

## Privacy and retention

Markers and aggregates hold only the day, outcome counts and random marker IDs. No customer name,
phone number (not even hashed), message text, key, key hash, request ID or webhook URL is stored
in them or returned by the report. If counting fails, the request is unaffected: it is still sent
and answered normally, and only `{"event":"review_metrics","outcome":"write_failed"}` is logged.

The nightly job `review-maintenance` runs at 09:00 UTC (2–3 AM Mountain Time) on the production
deploy only:

| Data | Kept for |
|---|---|
| Daily aggregates | **13 months** (back to the same date 13 months earlier), then deleted |
| Same-number holds (`phone/v2/<day bucket>/<keyed hash>`), the only per-customer value | Deleted 48–72 hours after being set: a whole day bucket is deleted once every hold in it is at least 48 hours old (each hold is needed for 24) |
| Double-tap guard (`request/<id>`, no customer data) | 7 days |
| Hourly and daily rate counters | Until two buckets old |

The roll-up can be repeated safely. Each aggregate lists the markers it has already added, so a
run interrupted part-way neither loses nor double-counts anything. Each step runs on its own, and
the log line holds counts only.

## Daily report

`GET https://jmirrigationco.com/api/review-metrics?from=YYYY-MM-DD&to=YYYY-MM-DD[&format=csv]`
with `Authorization: Bearer <report key>`. Default: the last 28 days. At most 92 days per request.

1. Create MOA's report key (owner, once): `node tools/review-staff-key.mjs moa-report --report`.
   Put the printed `moa-report:<hash>` in `REVIEW_REPORT_KEYS` in Netlify (Functions scope, secret).
   Keep the key in a password manager.
2. Pull the CSV in PowerShell 7:
   `$env:REVIEW_REPORT_KEY = Read-Host -MaskInput; node tools/review-metrics-report.mjs --from 2026-11-05 --to 2026-12-04 > review-requests.csv`
   The key is read from the environment, so it never appears on the command line.

## SMS delivery

GoHighLevel's acceptance of the webhook only starts its workflow. Whether a text reached the
customer is shown only in GoHighLevel: in the workflow's execution history and the message status
in the contact's conversation. For the monthly report, record from GoHighLevel, by hand, the number
of review texts delivered and failed in the same date range. Never copy `webhook_accepted` into a
"delivered" column.

## Comparing with Google reviews (Windsor.ai)

Windsor.ai exports the Google Business Profile reviews with a review date and star rating.

1. Use the same date range for both, in Mountain Time (check the Windsor.ai account's time zone).
2. Put them side by side by week: `webhook_accepted`, GoHighLevel delivered (if recorded), new
   Google reviews, new five-star reviews, and average rating.
3. Report reviews per 100 accepted requests only as a **ceiling**, never as attribution. A review
   cannot be matched to a request: the website keeps no names, some reviews come from customers
   asked in person or who find the profile themselves, and a review can arrive days after the text.
   Write it as "N new reviews in a period when M review requests were accepted", not
   "1-Tap Review produced N reviews".
4. Treat weeks with few requests as noise. Draw conclusions from at least four weeks.
5. Tracked review links are deliberately not implemented (owner decision, 2026-11-05).

### Baseline: October 7 – November 3, 2026 (before measurement)

- 14 Google reviews in total, 5.0 average rating.
- 9 new five-star reviews in the period.
- 1-Tap requests in that period: **not measured** (the live tool sent straight to GoHighLevel).
  How many of the 9 reviews followed a 1-Tap text is unknown and must not be stated.

## Known limitations

- **Concurrent rate limiting fails closed.** The hourly and daily counters use compare-and-set
  with up to 8 retries. If many taps arrive at the same instant, a tap that cannot update the
  counter is refused (`rate_limited`) instead of risking more than the limit. In a test with 25
  simultaneous taps, 8 were sent and 17 refused, below the 20/hour limit. One person tapping
  cannot realistically trigger this. A refused tap sends nothing and can simply be retried.
  This behaviour is intended and is kept.
- **Same-number hold cleanup is race-free** (fixed 2026-11-05). Netlify Blobs cannot delete
  conditionally, so holds are written to day buckets. A request only ever writes the bucket for
  its own start time, and cleanup deletes a bucket by key name only, once every hold in it is
  48 hours old. No request writes a bucket that old, so a refreshed hold is never deleted
  (`netlify/lib/phone-hold.mjs`, `tools/test-phone-hold.mjs`). Holds in the PR #4 format are still
  honoured, and are cleaned up after 48 hours.
- **Two taps for the same number in the same instant, across the 09:00 UTC bucket boundary.**
  Both requests check again after writing. Exactly one sends, or, if each sees the other, neither
  sends and both get `hold_conflict` ("try again"). It never sends twice. A retry then sends once.
- The report adds aggregates and markers that have not been rolled up yet. A report pulled while
  the nightly job is running (2–3 AM) can briefly under-count the previous day. Pull it again later.

## Activation (owner)

Follow `docs/review-request-cutover.md`. In short: the PR #4 cutover and Test A first. Then set
`REVIEW_REPORT_KEYS` (secret, Functions, Production) **before** merging this PR, because
variables take effect at the next deploy. Merge, then run Test B. Counting and the nightly job
start with that production deploy.

Tests: `node tools/test-review-metrics.mjs`, `node tools/test-review-request.mjs` and `node tools/test-phone-hold.mjs` (all mocked;
nothing leaves the computer).
