# Site QA audit service

This directory contains the backend required by `site-qa.html`. GitHub Pages only hosts the frontend; the audit service must run separately because a browser page cannot reliably inspect rendered DOM content on unrelated domains.

## Requirements

- Node.js 20+
- Chromium installed by Playwright
- Network access to the public sites you want to audit

## Local setup

```bash
cd site-qa-service
npm install
npx playwright install chromium
npm start
```

The service starts on `http://localhost:8787` by default. In Site QA, set **Service endpoint** to that address.

If you open the GitHub Pages frontend, your browser may block a plain HTTP local endpoint from an HTTPS page. For local testing, serve the toolkit locally (for example with `python -m http.server 8000`) or expose the audit service through HTTPS.

## Environment variables

- `PORT`: service port. Default `8787`.
- `ALLOWED_ORIGIN`: comma-separated frontend origins allowed by CORS. For production, set this to `https://luismgnictech-cloud.github.io`.
- `MAX_PAGES`: hard page cap. Default `100`, maximum `200`.
- `MAX_CONCURRENCY`: parallel page workers. Default `2`, maximum `4`.
- `MAX_RUNTIME_MS`: audit runtime cap. Default `180000`, maximum `600000`.
- `MAX_RESOURCE_BYTES`: per-resource policy limit. Default `8000000`, maximum `25000000`.

Do not put API keys or secrets in the GitHub Pages frontend. If a grammar provider is added later, keep its credentials and requests in this service.

## Security

The service rejects localhost, private/special-use IP addresses, credentialed URLs, non-HTTP(S) protocols, and cross-domain manual URLs. It validates DNS before navigation and also intercepts browser requests so requests to private/special-use destinations are aborted. Redirects made by the server-side verifier are checked one hop at a time.

This reduces SSRF risk, but a public deployment should additionally use infrastructure-level egress restrictions and authentication/rate limiting. Do not expose an unrestricted audit service to the public internet.

## What is implemented

- Single page, manual URL list, and sitemap-based site discovery.
- robots.txt checks and page caps.
- Real rendered-DOM inspection with Playwright Chromium.
- Heading hierarchy checks.
- Heuristic divitis analysis.
- Image alt, intrinsic dimensions, rendered size, HTML width/height and CSS aspect-ratio context.
- Limited English copy heuristics. These are explicitly reported as limited coverage and are not a full grammar verdict.
- Client-First naming heuristics with Webflow/third-party/JS hook exclusions.
- Link structure checks plus guarded HTTP destination verification.
- GSAP/ScrollTrigger signals, resize overflow check, console/resource errors.
- Lighthouse laboratory performance when Lighthouse can launch Chromium.
- NDJSON streaming so page results appear progressively.
- Cancellation between pending page jobs.
- JSON and CSV export from the frontend.

## Client-First reference

The rules are intentionally heuristic rather than one universal regex. Current official Finsweet Client-First documentation used as the implementation reference:

- https://finsweet.com/client-first/docs/classes-strategy-1
- https://finsweet.com/client-first/docs/classes-strategy-2
- https://finsweet.com/client-first/docs/folders

The implementation recognizes the documented distinction between custom classes using underscores, utility classes without underscores, and `is-` combo variants. It does not automatically rename classes.

## Known limitations

- A viewport emulation is not a physical-device or full cross-browser test.
- Visual intent, animation timing and design quality still require manual review.
- A missing globally exposed `window.gsap` does not prove GSAP is absent.
- Link verification can be blocked by 403/429, bot protection or timeouts; those are reported as not verifiable rather than broken.
- Writing checks are limited until a dedicated grammar provider is configured.
- Full-site discovery primarily uses sitemap files. Internal-link crawling can be expanded later for sites with incomplete sitemaps.
- CSV export contains findings; JSON preserves the richer report structure.
