# 1-Tap Review: measurement and reporting

Read-only performance counts for the staff 1-Tap Review tool (`review.html` → `/api/review-request`).
This builds on PR #4 (staff-only server function) and does nothing until PR #4 is live.

## What is counted

Every request from an **authenticated** staff key leaves one marker in the existing Netlify Blobs
store `review-requests`: `metrics/v1/<day>/<outcome>/<random id>`, value `{}`. Days are Mountain Time.

| Column | Meaning |
|---|---|
| `attempts` | Every authenticated request, whatever the result. |
| `webhook_accepted` | GoHighLevel answered 2xx. **The webhook was accepted. This does not mean a text was delivered.** |
| `duplicate` | Not sent: the same tap was already handled, or that number got a request in the last 24 hours. |
| `rate_limited` | Not sent: the staff key was over 20/hour or 60/day. |
| `upstream_failure` | Not sent: GoHighLevel refused the request or could not be reached. |
| `upstream_unconfirmed` | GoHighLevel did not answer within 10 s. It may or may not have received the request. |
| `invalid` | Not sent: invalid name, phone number or request. |
| `delivery_confirmed` | Always `not_measured`. The website cannot see SMS delivery (see below). |

`attempts` = the sum of the six outcome columns.

Not counted: requests without a valid key (they would let anyone fill the store; they remain in the
function logs as `unauthorized`), and requests refused before authentication (wrong origin, missing setup).

**Privacy.** Markers hold only the day and the outcome. No customer name, phone number (not even
hashed), message text, staff key, key hash, request ID or webhook URL is stored in the markers or
returned by the report. Counting can fail without effect: the request is still sent and answered
normally, and only `{"event":"review_metrics","outcome":"write_failed"}` is logged.

## Daily report

`GET https://jmirrigationco.com/api/review-metrics?from=YYYY-MM-DD&to=YYYY-MM-DD[&format=csv]`
with `Authorization: Bearer <key>`. Default: the last 28 days. At most 92 days per request.

Accepted keys: Juan's sending key (`REVIEW_STAFF_KEYS`), or a **read-only report key**
(`REVIEW_REPORT_KEYS`, optional). A report key can read the counts and can never send:
`/api/review-request` does not read `REVIEW_REPORT_KEYS`.

1. Create a report key (owner, once): `node tools/review-staff-key.mjs moa-report --report`.
   Add the printed `moa-report:<hash>` to `REVIEW_REPORT_KEYS` in Netlify (Functions scope, secret).
   Keep the key in a password manager.
2. Pull the CSV:
   - PowerShell 7: `$env:REVIEW_REPORT_KEY = Read-Host -MaskInput; node tools/review-metrics-report.mjs --from 2026-11-05 --to 2026-12-04 > review-requests.csv`
   - The key is read from the environment, so it is not in the command line.

## SMS delivery

GoHighLevel's acceptance of the webhook only starts its workflow. Whether a text reached the
customer is shown only in GoHighLevel (the workflow's execution history and the message status in
the contact's conversation). For the monthly report, record from
GoHighLevel the number of review texts delivered and failed in the same date range, by hand.
Never copy `webhook_accepted` into a "delivered" column.

## Comparing with Google reviews (Windsor.ai)

Windsor.ai exports the Google Business Profile reviews with a review date and star rating.

1. Use the same date range for both, in Mountain Time (check the Windsor.ai account's time zone).
2. Put them side by side by week: `webhook_accepted`, GoHighLevel delivered (if recorded), new
   Google reviews, new five-star reviews, average rating.
3. Report reviews per 100 accepted requests only as a **ceiling**, never as attribution. A review
   cannot be matched to a request: the website keeps no names, reviews also come from customers
   asked in person or who find the profile themselves, and a review can arrive days after the text.
   Write it as "N new reviews in a period when M review requests were accepted", not
   "1-Tap Review produced N reviews".
4. Treat weeks with few requests as noise. Draw conclusions from at least four weeks.
5. Stronger evidence, if ever wanted, has to come from GoHighLevel (for example a tracked review
   link per text), not from this website.

### Baseline: October 7 – November 3, 2026 (before measurement)

- 14 Google reviews in total, 5.0 average rating.
- 9 new five-star reviews in the period.
- 1-Tap requests in that period: **not measured** (the live tool sent straight to GoHighLevel).
  How many of the 9 reviews followed a 1-Tap text is unknown and must not be stated.

## Activation (owner)

1. PR #4 cutover first (new GoHighLevel trigger, `REVIEW_WEBHOOK_URL`, `REVIEW_STAFF_KEYS`, merge, verify).
2. Merge this PR. Counting starts with the next request; no setting is required.
3. Optional: add `REVIEW_REPORT_KEYS` for MOA's read-only access.
4. Check: one real request by Juan, then `/api/review-metrics?format=csv` shows `webhook_accepted` = 1 for that day.

Retention: markers are a few bytes each (at most about 60 a day). Remove old ones in the Netlify
Blobs UI under the `metrics/v1/<day>/` prefix if a retention period is set.

Tests: `node tools/test-review-metrics.mjs` (all mocked; nothing leaves the computer).
