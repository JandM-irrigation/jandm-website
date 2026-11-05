# J&M Irrigation Services website

Live site: https://jmirrigationco.com

Edit phone, banners, services and reviews at https://jmirrigationco.com/admin

© 2026 J/M Irrigation. All rights reserved.
Website designed by MOA Solutions. Not licensed for reuse.

## Building and checking (MOA)

The pages are generated from `tools/site-data.mjs`, `tools/build.mjs` and `content/site.json`.
Edit those, never the HTML alone, then:

    node tools/build.mjs              # public pages (unpublished projects left out)
    node tools/build.mjs --preview    # local review build in .preview/ (noindex, includes unpublished projects)
    node tools/check-site.mjs         # URLs, canonicals, sitemap, links, JSON-LD, leaks (add --preview for .preview/)
    node tools/test-forms.mjs         # form and analytics tests with mocked delivery
    node tools/test-review-request.mjs  # 1-Tap Review server function (mocked)
    node tools/test-review-metrics.mjs  # 1-Tap Review counts and report (mocked); see docs/review-request-metrics.md
    node tools/test-phone-hold.mjs      # same-number hold and its cleanup under concurrency (deterministic)

Unpublished ranch photos live in `.private/` (git-ignored). Restore them with
`node tools/extract-brief-assets.mjs <JM-Relaunch-Creative-Production-Brief-2026-11-02.html>`.
