# Walkthrough screen capture

Captured 2026-09-05 against the live site `https://useleverage.vercel.app` with headless Chromium (Playwright 1.62.1 resolved from `D:\project\cherry\node_modules`), 1920x1080, device scale factor 1, `colorScheme: dark`. No mockups: every frame is the deployed site; the only non-site pixels are a drawn cursor that follows the real pointer (Playwright's screencast does not render the OS cursor).

## Files

| File | Duration | Size | Content |
|---|---|---|---|
| `raw/landing.mp4` | 20.83 s | 4,150,778 B | `/` hero, film section (not played), "RocketRide runs the work" |
| `raw/mission.mp4` | 34.33 s | 8,087,303 B | `/app/missions/LVR-719a8c22` header, workforce rationale, auction drawer (8 candidates), event log to the Winner line |
| `raw/handoff.mp4` | 21.23 s | 5,915,554 B | `/app/missions/LVR-bda3ba68` worker.failed, checkpoint.created, handoff.started, worker.hired resuming |
| `raw/providers.mp4` | 15.47 s | 1,719,404 B | `/app/providers` healthy pool + RocketRide credits, then `/app/models` (13 models) |
| `raw/benchmarks.mp4` | 9.63 s | 4,704,533 B | `/benchmarks`, one scroll |
| `raw/capture.json` | | 4,468 B | per clip: file, page, durationSeconds, moments {t, visible} |
| `captions.json` | | 2,348 B | lower-third captions per clip; start/end follow the moments |
| `framed/landing.mp4` | 20.83 s | 3,742,577 B | framed, 3 captions |
| `framed/mission.mp4` | 34.33 s | 6,545,809 B | framed, 5 captions |
| `framed/handoff.mp4` | 21.23 s | 4,836,450 B | framed, 4 captions |
| `framed/providers.mp4` | 15.50 s | 1,609,084 B | framed, 3 captions |
| `framed/benchmarks.mp4` | 9.63 s | 3,603,326 B | framed, 2 captions |

Total raw footage 101.49 s (budget 150 s). All clips H.264 yuv420p 1920x1080 30 fps, no audio, no narration, no music.

## Reproduce (from D:\project\leverage; nothing is installed into this repo)

```
node scripts/walkthrough-record.mjs                        # all beats -> raw/*.mp4 + raw/capture.json (~2.5 min)
node scripts/walkthrough-record.mjs --only mission,handoff  # re-record some beats, merged into capture.json
node scripts/walkthrough-record.mjs --base http://localhost:3000
WT_DEBUG=1 node scripts/walkthrough-record.mjs --only landing   # per-primitive timing on stderr
node scripts/walkthrough-cinema.mjs                         # raw + captions.json -> framed/*.mp4 (~80 s)
node scripts/walkthrough-cinema.mjs --only mission --captions motion/assets/capture/captions.json
```

Playwright is resolved from `playwright`, then `$PLAYWRIGHT_DIR`, then `D:/project/cherry/node_modules/playwright`.

## Verification

ffprobe, raw:

```
raw/landing.mp4    codec_name=h264 width=1920 height=1080 pix_fmt=yuv420p r_frame_rate=30/1 avg_frame_rate=30/1 nb_frames=625  duration=20.833333 size=4150778
raw/mission.mp4    codec_name=h264 width=1920 height=1080 pix_fmt=yuv420p r_frame_rate=30/1 avg_frame_rate=30/1 nb_frames=1030 duration=34.333333 size=8087303
raw/handoff.mp4    codec_name=h264 width=1920 height=1080 pix_fmt=yuv420p r_frame_rate=30/1 avg_frame_rate=30/1 nb_frames=637  duration=21.233333 size=5915554
raw/providers.mp4  codec_name=h264 width=1920 height=1080 pix_fmt=yuv420p r_frame_rate=30/1 avg_frame_rate=30/1 nb_frames=464  duration=15.466667 size=1719404
raw/benchmarks.mp4 codec_name=h264 width=1920 height=1080 pix_fmt=yuv420p r_frame_rate=30/1 avg_frame_rate=30/1 nb_frames=289  duration=9.633333  size=4704533
```

ffprobe, framed:

```
framed/landing.mp4    codec_name=h264 width=1920 height=1080 pix_fmt=yuv420p r_frame_rate=30/1 nb_frames=625  duration=20.833333 size=3742577
framed/mission.mp4    codec_name=h264 width=1920 height=1080 pix_fmt=yuv420p r_frame_rate=30/1 nb_frames=1030 duration=34.333008 size=6545809
framed/handoff.mp4    codec_name=h264 width=1920 height=1080 pix_fmt=yuv420p r_frame_rate=30/1 nb_frames=637  duration=21.233333 size=4836450
framed/providers.mp4  codec_name=h264 width=1920 height=1080 pix_fmt=yuv420p r_frame_rate=30/1 nb_frames=465  duration=15.500000 size=1609084
framed/benchmarks.mp4 codec_name=h264 width=1920 height=1080 pix_fmt=yuv420p r_frame_rate=30/1 nb_frames=289  duration=9.633333  size=3603326
```

Not blank: mid-frame signalstats luma (YMIN, YAVG, YMAX; a single colour would give MIN == MAX):

```
raw/landing t=10.42 0,33.8,255   raw/mission t=16.90 10,35.7,240   raw/handoff t=10.62 0,36.6,255
raw/providers t=7.73 10,34.7,242   raw/benchmarks t=4.82 8,33.3,248
framed/landing 12,31.7,242   framed/mission 9,28.3,241   framed/handoff 12,33.3,241   framed/providers 7,30.4,243   framed/benchmarks 8,29.5,243
```

Frames inspected by eye:

- raw/mission.mp4 at 11.2 s and 11.8 s: task drawer "Implement money helpers" open with the Auction block listing 8 candidates and utilities (MiniMax M3 via OpenRouter 0.692, MiniMax M2.7 via OpenRouter 0.692, MiniMax M3 via NVIDIA 0.692, Nemotron 3 Nano 30B via OpenRouter 0.664 ...), then ProofPack (verified, quality 100, $0.0000) and Scope; behind it the metrics row (Quality 100, Paid spend $0.00, Tasks 4/4), task graph and Workforce panel with rationale lines ("80 task fit - 78 verified success over 3 prior jobs - free route, no spend"). Final frame at 33.7 s: event log at the second auction, `auction.completed  Winner: MiniMax M3 via OpenRouter - 80 task fit - no prior jobs - scored on the neutral prior - free route, no spend`, then `worker.hired`.
- raw/handoff.mp4 at 8.6 s: `verification.failed`, `worker.failed  qwen2.5-coder:3b failed: TEST_FAILURE`, `checkpoint.created  Checkpoint cp_03fc5f874f9c: 256 tokens captured from 421 of context (39% smaller)`, `worker.released`, `handoff.started`, then the re-run auction. At 19.5 s: `auction.completed  Winner: Pool - best-free ...` and `worker.hired  Hired Pool - best-free as Backend Engineer (resuming from cp_03fc5f874f9c)`.
- raw/landing.mp4 at 8.2 s: "THE FILM - 68 SECONDS - NARRATED" with the poster (4/4, 3, $0.00), play control untouched; at 16.8 s: "RocketRide runs the work. Leverage decides what work should run." with the four proof tiles.
- raw/providers.mp4 at 8.4 s / 9.0 s: the Models table (13 reachable, 13 free routes); framed 6.0 s: RocketRide HEALTHY, credits 4571 / 5000, consumed 429.00.
- framed/*: 1568x882 rounded window at (176, 64) with shadow and a faint #625fff ring over the blurred, darkened, #0e111b-tinted copy; captions in Figtree (embedded from motion/assets/fonts), #abaebb kicker with an accent dash, white headline, all on one line.

Moment alignment: frames sampled just after logged moments match (drawer open within ~0.3 s of its t; models page visible before its t; handoff rows exactly at their t).

## What did not work, with the actual text

1. First mission navigation: `page.goto: Timeout 30000ms exceeded. ... navigating to "https://useleverage.vercel.app/app/missions/LVR-719a8c22", waiting until "domcontentloaded"` while curl loaded the same URL in 0.5-0.8 s before and after. Transient Vercel stall; open() now uses a 45 s timeout plus one retry. Did not recur.
2. Moment timestamps were ~2.2 s early on the first full run: Playwright's video clock starts at the first painted frame, and a blank page paints nothing before a cross-process navigation, so the origin was the live page's first paint. Confirmed with a fiducial test (solid frames at known wall times, scene-change detection on the output: constant wall-to-video offset, origin = first paint). Fix: paint a solid #0e111b frame right after newPage, anchor t0 to it (measured lag 0.10 s, VIDEO_ORIGIN_LAG), trim the load period with output-side -ss. The tail extends to when Playwright's stop() runs (close latency 1.5-3.4 s), so the end is not an anchor.
3. Mouse glides ran 2-3x nominal on the landing page (25 mouse.move steps = 3.56 s there vs 0.41 s on /app/models; the animated hero keeps the main thread busy). Glides are now tweened by elapsed time.
4. Inner event-log targets were 868 px off: li.offsetTop is page-relative in this layout. Targets are now scrollTop values of the 340 px log (rows ~23.5 px).
5. handoff.completed never appears in the live log: src/core/types.ts:450 declares it, but the scheduler only emits handoff.started (src/core/scheduler.ts:342). The handoff clip dwells on worker.failed -> checkpoint.created -> handoff.started -> worker.hired (resuming from cp_...) instead; captions match that vocabulary.
6. The auction candidate list only renders inside the task drawer (DetailsDrawer, src/components/mission/mission-control.tsx), so the mission clip clicks the first task node to open it. Nothing else is clicked; the film is never played.
7. Playwright records VP8 webm at a fixed 25 fps (fps = 25 in playwright-core's VideoRecorder). The 30 fps mp4s come from frame repetition in the transcode; motion is 25 fps-native.
8. The first mission attempt trimmed 26.8 s of lead because networkidle waited its full 15 s; open() now waits for h1 and caps networkidle at 5 s.

## Known gaps

- No handoff.completed on screen (5). 25 fps source (7). The hero canvas animates at ~8 fps under the screencast on this machine, which the landing clip shows.
- captions.json is placeholder copy keyed to the moments; the composition owns the final wording.