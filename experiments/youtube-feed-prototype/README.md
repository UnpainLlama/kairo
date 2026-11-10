# Kairo YouTube feed prototype

A deliberately isolated Node.js proof-of-concept for checking whether YouTube.js can retrieve the signed-in account's subscriptions feed. It does not modify Kairo's React UI, Hono Worker, D1 database, or playback code.

> **Unofficial integration warning:** YouTube.js communicates with YouTube's undocumented InnerTube interface. It is not supported or endorsed by YouTube, may stop working, and may conflict with YouTube's API/developer policies. This prototype is for technical evaluation only. Do not use it to bypass playback restrictions or extract video streams. Playback URLs in the output are ordinary YouTube watch/embed links.

## Requirements

- Node.js 20 or newer (the library itself supports Node.js 16.8+, but use a current LTS release).
- A YouTube account with subscriptions.
- A local terminal. Do not run this authenticated prototype in Cloudflare Workers or expose it to the public internet.

## Install

From this directory:

```sh
npm install
```

The dependency is pinned to YouTube.js 18.3.0.

## Authentication

The library's documented web authentication method accepts a YouTube `Cookie` request header. **That header is a sensitive account credential.** Anyone who obtains it may be able to access your signed-in session.

For this prototype:

- Never send the cookie to ChatGPT, GitHub, or another person.
- Never commit it, add it to a project `.env` file, put it in a URL, or paste it into a screenshot/log.
- Keep it only in your local terminal environment, and clear the variable when finished.
- Prefer a separate browser profile/account with no sensitive account data.
- Revoke/sign out that session if you believe the cookie was exposed.

Set the cookie in your local shell (the value must be the complete Cookie header from a YouTube request):

**PowerShell**
```powershell
$env:YOUTUBE_COOKIE = Read-Host "Paste Cookie header (input will be visible)"
npm start
Remove-Item Env:YOUTUBE_COOKIE
```

**macOS / Linux**
```sh
read -rsp "Paste Cookie header: " YOUTUBE_COOKIE; export YOUTUBE_COOKIE; echo
npm start
unset YOUTUBE_COOKIE
```

PowerShell's `Read-Host` displays input as you type. If that is not acceptable, use a secure local secret manager or another private input method instead. Do not save the cookie in this repository.

The upstream documentation describes copying the `Cookie` request header from an authenticated YouTube request in browser developer tools. Cookie rotation and account verification can make this unreliable.

## Run the test

Default: fetch up to two feed pages.

```sh
npm start
```

Fetch up to five pages:

```sh
# PowerShell
$env:YOUTUBE_MAX_PAGES = "5"
npm start
```

Emit normalized JSON to stdout:

```sh
npm start -- --json
```

The script reports video IDs, titles, channel names, dates, durations, thumbnails, and standard YouTube watch/embed URLs. It does not download media, store cookies, write feed data to disk, or alter the Kairo app.

## What counts as a successful test?

1. The library initializes a session without throwing.
2. `getSubscriptionsFeed()` returns video entries.
3. `getContinuation()` retrieves another page when the feed has a continuation.
4. The normalized entries contain video IDs and usable titles.

A successful local request does **not** prove the integration will work from Cloudflare Workers. YouTube may block datacenter IPs, and the prototype intentionally tests from your own machine/network first.

## API used

- `Innertube.create({ cookie })`
- `innertube.getSubscriptionsFeed()`
- `feed.videos`
- `feed.has_continuation`
- `feed.getContinuation()`

References: [YouTube.js repository](https://github.com/LuanRT/YouTube.js), [authentication guide](https://ytjs.dev/guide/authentication), [Feed API source](https://github.com/LuanRT/YouTube.js/blob/v18.3.0/src/core/mixins/Feed.ts).
