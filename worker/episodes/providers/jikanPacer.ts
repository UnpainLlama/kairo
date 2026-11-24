// A single per-isolate start pacer for Jikan episode-list requests.
// Jikan documents a three-requests-per-second limit; 400 ms keeps a small margin.
let nextStartAt = 0;

export async function waitForJikanSlot(): Promise<void> {
  const now = Date.now();
  const startAt = Math.max(now, nextStartAt);
  nextStartAt = startAt + 400;
  if (startAt > now) await new Promise<void>((resolve) => setTimeout(resolve, startAt - now));
}
