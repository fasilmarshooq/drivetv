# Security review

Reviewed on 2026-11-01 for the initial public release. This is a focused source/dependency review and browser regression suite, not a third-party penetration-test certification.

## Controls and verification

- Google folder host/ID/resource-key validation rejects alternate origins and query injection. Service endpoints are fixed; URL parameters and file IDs are encoded.
- React treats filenames as text. Production browser tests exercise an HTML/event-handler filename and confirm that it creates no injected elements or script execution.
- Production HTML applies a Content Security Policy: same-origin scripts, no JavaScript string evaluation, constrained image/media/API destinations, no objects and no form submissions. WebAssembly and blob worklets remain allowed for the decoder; inline styles remain allowed for player/layout updates. The browser suite checks actual script execution under the policy.
- All decoder downloads use a pinned source revision and checked SHA-256 digests. Cached modules are also checked; a tampered-cache test was rejected. npm dependencies use a lockfile. The dependency audit found no known advisories at review time; CI repeats it.
- Git history is scanned with Gitleaks before publication and on every CI run. Local environment files, build output, generated vendors, personal development records and reports are excluded from commits. A separate prepublication check compares tracked contents with configured credential values.
- CI actions are pinned to commit hashes. Pull-request checks receive fake application configuration. Deployment permissions and public build configuration are limited to successful trusted-branch jobs.

## Boundaries

The page is public and has no authentication service. `VITE_*` keys are deliberately delivered in JavaScript. Keeping them in Actions secrets protects source history and workflow input, not the deployed browser bundle. Use only the intended read keys and restrict Google API/application usage. The key does not grant private Drive access; publicly shared media stays public.

Browser storage contains optional overrides and watch history. Other applications on the same origin share the browser security boundary; using a dedicated domain gives better separation than multiple GitHub project sites. Clearing device storage does not revoke build-time configuration.

No backend accepts arbitrary outbound URLs, handles uploads or processes private account data. This review did not fuzz third-party media decoders, certify arbitrary hostile media, or validate physical Android TV devices. Recursive scans and third-party API usage remain subject to library size, browser resources and service limits. Live movie download probes were excluded; playback verification uses controlled media fixtures.

GitHub Pages does not provide application-configured response headers here. The policy is delivered in HTML; it does not supply response-only controls such as `frame-ancestors`. A future authenticated key service needs its own security review, request limits and session design.
