# Embed and browser resource security

## Current rollout state

The browser policy is intentionally **report-only**. `public/_headers` sends a
`Content-Security-Policy-Report-Only` header for static site responses. It does not block
resources or navigation. The domain list is a first candidate built from the URLs and
playback hosts currently configured in this branch; real staging use is required to discover
provider/CDN hosts that vary by title or region.

The three external-player surfaces are sandboxed in code:

- CineSrc movie iframe: `allow-scripts allow-same-origin allow-presentation`.
- Generic Anime provider iframe: the same sandbox tokens.
- YouTube IFrame Player API: a MutationObserver applies the same sandbox tokens when the
  API inserts its player iframe.

These tokens preserve player JavaScript, its own origin/storage, and presentation mode. They
do **not** grant popups, forms, or top-level navigation. `allow` and `allowFullScreen`
continue to grant the media/fullscreen capabilities separately. `allow-same-origin` is
needed for CineSrc's origin-checked postMessage API and for the official player to retain its
own origin. These frames are cross-origin from Kairo; do not embed same-origin content using
both `allow-scripts` and `allow-same-origin`.

## Candidate resource inventory

The report-only policy currently reflects the app's known dependencies:

| CSP directive | Candidate services | Why |
|---|---|---|
| `script-src` | `self`, `cdn.jsdelivr.net`, `www.youtube.com`, `s.ytimg.com` | Kairo bundle, Video.js CDN files, official YouTube IFrame API/player |
| `style-src` | `self`, `cdn.jsdelivr.net`, `fonts.googleapis.com` | App CSS, Video.js stylesheet, Google Fonts CSS |
| `font-src` | `self`, `fonts.gstatic.com`, `data:` | Local fonts, Google Fonts files, embedded font data |
| `img-src` | `self`, `image.tmdb.org`, `s4.anilist.co`, `cdn.myanimelist.net`, `i.ytimg.com`, `img.youtube.com`, `yt3.ggpht.com`, `yt3.googleusercontent.com`, known HiAnime mirrors | Catalogue artwork, movie artwork, YouTube thumbnails and provider posters |
| `connect-src` | `self`, AniList, Jikan, TMDB, Google APIs/OAuth, jsDelivr and configured playback hosts | Browser XHR/fetch, player requests and HLS segments. Most catalogue/API calls are Worker-to-provider requests and are not subject to the browser's CSP. |
| `frame-src` | `self`, `cinesrc.st`, YouTube, and configured staging playback hosts | Approved movie and episode players |
| `media-src` | `self`, `blob:`, `data:`, and configured staging playback hosts | Direct media and HLS playback |
| `worker-src` | `self`, `blob:` | Local code and player workers such as HLS workers |
| `form-action` | `self`, `accounts.google.com` | Kairo forms and the known Google authorization flow |

The staging playback-host candidates are taken from
`wrangler.jsonc`'s `HIANIME_PLAYBACK_ALLOWED_HOSTS`:
`zokoanime.video`, `megaplay.buzz`, `hls.dramahot.top`, `hls1.drama1.cfd`,
`mysubsplay.com`, `emeralddrift.world`, `hianime.at`, `hls1drama1.cfd`,
and `emeralddrift.com`. The list is intentionally not broadened to `https:` or
`*.google.com`. ZokoAnime remains disabled unless separately enabled.

The HiAnime parser accepts HTTPS poster URLs from its configured mirror, so a live report may
reveal image-CDN hosts that are not visible in source code. Add only observed, legitimate hosts
to the future enforced policy. Do not turn an observed advertisement/tracker domain into an
allowlist entry simply because it appeared in a report.

## Why sandboxing is separate from CSP

CSP `frame-src` controls which origins Kairo may embed; it does not stop an already-embedded
player from trying to open a popup or navigate Kairo's top-level tab. The iframe `sandbox`
attribute is the control that withholds those capabilities from the third-party player.

The implementation intentionally does not grant `allow-popups`,
`allow-popups-to-escape-sandbox`, `allow-top-navigation`, or
`allow-top-navigation-by-user-activation`. A user can still use Kairo's explicit
"Watch on YouTube" link outside the player.

The proposed CSP does not include `navigate-to`: browser support is not dependable enough
to use it as a navigation firewall. Do not rely on it as a substitute for iframe sandboxing.

## How to review reports

1. Deploy only to the staging environment after the feature branch has been reconciled and
   the usual staging approval steps are complete.
2. In a browser, open Developer Tools → Console and exercise the site in normal use:
   home/catalogue, Anime details, episode playback, Movies playback, and administrator-only
   YouTube playback. Also test the Google/YouTube connection flow.
3. Review `Content-Security-Policy-Report-Only` violation messages. Identify whether each
   blocked URI is an essential service or an advertisement/unknown third party.
4. Add a domain only after confirming its owner, purpose, and necessity. Repeat the test matrix.
5. Only after essential violations are understood should a separate change switch to an
   enforcing `Content-Security-Policy`.

No reporting collector endpoint is configured yet; violations are available in the browser's
developer console, not centrally collected by Kairo. The Report-Only header itself does not
block resources. The iframe sandbox attributes **are enforced now**, so YouTube and provider
player compatibility still needs a real staging test before promotion.
