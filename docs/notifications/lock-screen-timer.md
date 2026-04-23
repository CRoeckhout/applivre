# Lock-screen timer for reading sessions

Problem statement + implementation strategy for surfacing the current
reading session outside the app (notification tray, lock screen, widget).

## Problem

The timer tracks the current reading session with a wall-clock
`startedAt` (see `store/timer.ts`). Elapsed time is therefore
computable at any moment. We want this value visible outside the
app — typical scenario: user starts a session, locks the phone, keeps
reading a physical book, wants to glance at elapsed time on the lock
screen without unlocking or opening the app.

Constraints:
- Cross-platform (iOS + Android)
- Expo managed (prebuild allowed, no ejection)
- Keep battery impact acceptable
- Survive app backgrounding; ideally survive app kill
- Cheap to ship first, richer tiers optional

## Native reality check

iOS and Android both restrict how notifications update in real time.

- **Regular notifications can't tick second-by-second on a locked
  screen.** The app must be awake to mutate notification text, and iOS
  + Doze-mode Android heavily throttle wake-ups.
- **iOS scheduled notifications** are practically bounded to ~1 minute
  effective resolution due to OS throttling, and there is a 64
  pending-notifications cap.
- **iOS Live Activities (16.1+)** render a dedicated widget on the
  lock screen with a native count-up chronometer that ticks without
  the app being alive. Requires a Swift WidgetKit/ActivityKit target.
- **Android foreground services** can post an ongoing notification
  with `setUsesChronometer(true)` / `setWhen(startedAt)` — a native
  count-up that ticks even if the app is killed. Requires a native
  Service + manifest entries.

So: proper second-by-second lock-screen display is a native feature
on both platforms, not something the JS runtime can produce on its own.

## Three implementation tiers

### Tier 1 — cross-platform managed (`expo-notifications`)

Ship an **ongoing notification** with static elapsed text ("Lecture en
cours — 22 min"), refreshed via scheduled triggers.

- Single dep: `expo-notifications`
- JS only, no Swift/Kotlin code
- Works with Expo Go fallback and any dev client
- Rolling window of scheduled notifications (identifier reused each
  minute, so previous one gets replaced by the next)
- Clears on pause / stop / cancel, re-scheduled on resume
- Android: pre-O channels, ongoing flag
- iOS: provisional authorization so no prompt is required for the
  first request (we can upgrade to full auth later)

Limits:
- **Precision: ~1 minute on both platforms.** Lock-screen text is
  frozen between two notifications.
- On Android without a foreground service, if the OS kills the app
  aggressively the already-scheduled notifications still fire, but
  the user can't pause/stop from the notification itself.
- Scheduling too many pending notifications runs into the 64-pending
  cap on iOS; we cap the rolling window to ~30 minutes (30 slots) and
  re-schedule when the app is next active.

**Estimated effort: 30 min.** This is the MVP we ship first.

### Tier 2 — iOS Live Activity

Proper lock-screen widget with native count-up timer.

Architectural impact:
- New Swift target (`LiveActivity/`) using WidgetKit + ActivityKit
- Config plugin (`@bacons/apple-targets` or custom) that injects the
  target during prebuild
- EAS build only — Expo Go excluded
- JS bridge: `react-native-live-activity` or a bespoke TurboModule
  exposing `start(attributes)`, `update(state)`, `end()`
- Activity attributes encode `{ startedAt, bookTitle, bookAuthor,
  coverAssetURL? }`
- Fonts used inside the widget must be re-bundled in the widget
  target (DM Sans etc. won't cross the target boundary)
- Deep link handling when user taps the activity
- iOS 16.1+ only — fallback to Tier 1 behaviour on older devices
- No Android impact; Android falls back to Tier 1 / Tier 3

**Estimated effort: 2–3 days.**

### Tier 3 — Android foreground service

Proper ongoing notification with native chronometer that survives app
kill and ticks in real time.

Architectural impact:
- Option A — adopt `@notifee/react-native` (maintained, plug-and-play)
- Option B — bespoke Kotlin `Service` + module
- `AndroidManifest.xml` changes:
  - `FOREGROUND_SERVICE` permission
  - `FOREGROUND_SERVICE_SPECIAL_USE` (Android 14+)
  - `<service>` declaration with `foregroundServiceType="specialUse"`
- Config plugin to inject the manifest edits under managed workflow
- Notification channel setup (Android 8+)
- Service lifecycle driven by `useTimer`:
  - `start` → start service via intent
  - `pause` / `resume` / `stop` / `cancel` → stop service
  - app cold start → if `useTimer.active` is non-null after hydration,
    relaunch service
- Optional battery-optimization whitelist prompt for
  Samsung/Xiaomi/etc.
- "Arrêter la session" action button in the notification, routed to
  the store
- No iOS impact

**Estimated effort: 1–2 days with notifee, 3+ days rolling our own.**

## Cross-cutting concerns for Tier 2 + Tier 3

- **Single coordinator hook** in JS that observes `useTimer.active`
  and dispatches to the right channel per platform (Live Activity
  iOS / foreground service Android / managed notif fallback).
- **Deep linking**: tap on lock-screen widget / notification →
  `router.push("/book/[isbn]")` via Expo Linking.
- **Persistence** of the active session is already covered by zustand
  persist; on cold start we re-establish the external surface from
  `active` if present.
- **EAS build time** grows (extra target on iOS, extra manifest work
  on Android). No Expo Go path for either tier.
- **Testing**: iOS Live Activity works in Simulator but needs extra
  care around entitlements; Android foreground service needs a real
  device or emulator with `specialUse` granted.

## Current status

- **Tier 1 shipped then rolled back on 2026-04-24.** The minute-by-minute
  scheduled notifications were perceived as spam in the notification
  center, which is the opposite of what the feature is meant to achieve.
  Code removed: `hooks/use-timer-notification.ts`,
  `lib/notifications/timer-notification.ts`,
  `plugins/with-no-push.js`, `expo-notifications` dep, and the plugin
  entry in `app.json`. See git history for the removed pieces.
- **Tier 2 (iOS Live Activity)** is the next target. The user explicitly
  wants a widget-style view in the notification center with a native
  chronometer, not repeated toasts. This is exactly what Live Activity
  provides on iOS ≥ 16.1.
- **Tier 3 (Android foreground service)** pairs with Tier 2 for Android
  parity. To be scoped once Tier 2 is through.

## Decision log

- 2026-04-23 — shipped Tier 1 as a pragmatic MVP, accepting the
  ~1 minute granularity as the stated trade-off.
- 2026-04-24 — Tier 1 abandoned. Minute pings are intrusive (each slot
  is a notification, stacked in the tray), and the value proposition
  (a single glanceable live counter) is fundamentally missed by the
  notification primitive. Moving straight to Tier 2 + Tier 3.
