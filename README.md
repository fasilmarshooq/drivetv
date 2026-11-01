# Drive TV

A React movie library for public Google Drive folders. Browse with a TV remote, phone or mouse. Movies stream directly from Google to the device; there is no media proxy.

## Local development

Use Node 22.12 or newer:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open the URL printed by Vite. Set the folder sharing to **Anyone with the link**. Subfolders are scanned into one collection; Drive shortcuts are not followed.

Optional build-time defaults in `.env.local`:

| Variable | Purpose |
| --- | --- |
| `VITE_GOOGLE_DRIVE_API_KEY` | Google Drive API key |
| `VITE_GOOGLE_DRIVE_FOLDER` | Default folder URL or ID |
| `VITE_TMDB_READ_TOKEN` | TMDB API Read Access Token for artwork |

With both Drive values, a new device opens the library automatically. Otherwise use Connect Google Drive to enter your own public folder and API key. Browser-saved settings override deployment defaults. Watched positions and optional overrides stay in local storage. Clear this site’s browser data to remove saved settings, watch history and artwork cache. The library has no Settings button or profile badge, and deployment keys are never prefilled into the connection form.

Environment files, dependencies, generated decoder assets and build output are excluded from Git. **All `VITE_*` values are public in the deployed JavaScript.** Environment variables keep them out of source history; they do not hide them from site visitors. Never put service-account credentials or private access tokens in these variables. Restrict the Google key to Drive API and the intended website origins. A public folder is public independently of this app.

## GitHub Pages

The Pages workflow tests pushes and pull requests. Only successful trusted `main` builds deploy. Configure Pages → Source → **GitHub Actions**, and add these repository Actions secrets:

- `VITE_GOOGLE_DRIVE_API_KEY`
- `VITE_GOOGLE_DRIVE_FOLDER`
- `VITE_TMDB_READ_TOKEN`

The workflow builds for `/drivetv/` and publishes only `dist`. Keys enter only the final build step and are never printed. Pull-request checks use fake configuration and have no deployment permissions. All workflow actions are pinned to commits. A change to a deployment variable requires a new build.

GitHub Pages is public. A server-side key service and device pairing are deferred. The deployed bundle still exposes the configured read keys as described above.

## Playback and artwork

The main player uses the browser's original-file decoder. The broadest target is MP4 with H.264 8-bit video and AAC stereo audio, with `faststart` metadata. MKV, HEVC 10-bit, Dolby audio and embedded subtitles depend on the device. Google download restrictions and limits can also prevent playback.

The picture uses the full player area while preserving its aspect ratio. Controls overlay the picture and hide after three seconds of playback. Left/right seek by ten seconds from anywhere in the player; OK on the picture plays or pauses. Up/down reveal and move through controls; OK on a selected control activates it. Back exits fullscreen first, then returns to the library. Mouse, touch and the timeline remain available. Physical TV/browser key handling still needs device testing.

Folder artwork searches TMDB using the immediate containing subfolder name, rather than the encoded filename. Loose files in the selected root, missing matches and failed images retain the generated title art. Matches are cached for seven days, misses for one day. Exact titles are preferred, otherwise the first search result is used. Attribution is in Credits.

`compat.html` is a separate experimental libmedia player for browser-side Dolby decoding. It uses the same configured folder/key. `compat.html?sample=1` plays a bundled synthetic 12-second HEVC/E-AC3/subtitle sample without Google. Its tones are intentional. Continuous embedded text captions work in the tested desktop browser, but captions can disappear after seeking. Bitmap subtitles and resume history are not connected in this experiment. Actual TV compatibility still needs testing.

## Verification

```sh
npm test
npm audit --audit-level=low
npx playwright install --with-deps chrome
npm run test:browser
npm run test:deployment
npm run test:production
```

Browser suites use installed Chrome and fake Google/TMDB responses. They never download a real movie. Set `MEDIA_FIXTURE` to a local compatible MP4 to additionally test native playback, pause and seek. Set `PLAYWRIGHT_MODULE` only when using an external Playwright installation.

Production tests build in an isolated directory with fake environment variables and exercise the `/drivetv/` path, hostile filenames, browser policy and assets. `APP_URL=https://your-site.example/drivetv/ npm run test:production` repeats those checks against a deployment while intercepting remote service requests. CI also scans Git history with Gitleaks and checks dependencies. See [SECURITY.md](SECURITY.md) for scope and limits.

## Reuse and licensing

[Video.js](https://github.com/videojs/video.js) is Apache-2.0, [Lucide](https://lucide.dev/) is ISC, React and Vite are MIT. Library notices remain with dependencies/bundles. The React UI and integration are original; no `player.html` source is included.

The compatibility experiment separately loads [libmedia](https://github.com/zhaohappy/libmedia) 1.3.1, LGPL-3.0-or-later. `npm ci` prepares unmodified modules and verifies decoder WASM SHA-256 hashes from a pinned source revision. Its license, notice, source and build links accompany the generated assets. The sample is synthetic. The original TMDB logo and required attribution are included.
