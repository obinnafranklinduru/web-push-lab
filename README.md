# Web Push Lab

An experimental Node.js + vanilla JavaScript playground for testing and comparing three browser push notification implementations side by side:

1. **`web-push`** - Direct, standards-based Web Push using VAPID keys (no third-party push platform).
2. **`firebase-admin`** - Google's Firebase Cloud Messaging (FCM).
3. **`@onesignal/node-onesignal`** - OneSignal's managed push service and Web SDK.

> **Note:** This is an experimental learning and diagnostics lab, not a production notification service.

---

## Why This Project Exists

Sending a push notification from a backend server is **not** the same as delivering it to a user's screen. A server can receive a `200 OK` or `201 Created` response while the notification never appears in the browser-for example, because a subscription expired, the browser suppressed it, or a provider returned `200 OK` with `0` recipients.

This lab helps you observe and compare:

- **Provider Acceptance**: Did the push service / API accept your request?
- **Browser Receipt**: Did the browser actually receive the push message?
- **Notification Display**: Did the browser show the notification on screen?

---

## How Browser Push Works (In Plain English)

1. **Permission**: The user clicks **Allow** when the browser asks to show notifications.
2. **Service Worker**: The browser registers a small background JavaScript file (a _Service Worker_) that can wake up and receive push messages even when the tab isn't focused.
3. **Subscription / Token**: The browser generates a unique address (a `PushSubscription` object, an FCM token, or a OneSignal Subscription ID) and sends it to our backend to save in SQLite.
4. **Send & Track**: When you send a test notification from the UI, the backend records the provider's response time and status, and the browser reports back when the message is received and displayed.

---

## Comparing the Three Approaches

| Feature                       | `web-push`                                                    | `firebase-admin` (FCM)                                                 | `@onesignal/node-onesignal`                           |
| ----------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------- |
| **Third-party account**       | None (only VAPID keys)                                        | Firebase project                                                       | OneSignal account                                     |
| **What the browser stores**   | `PushSubscription` (`endpoint` + encryption keys)             | FCM registration `token`                                               | OneSignal `subscriptionId`                            |
| **Browser UI**                | Native browser prompt only                                    | Native browser prompt only                                             | Includes OneSignal's own prompt/dialog UI             |
| **Foreground vs. Background** | Handled uniformly in the Service Worker                       | Split: `onMessage` (foreground) vs. `onBackgroundMessage` (background) | Handled by OneSignal's SDK                            |
| **Common silent failure**     | Push service returns `201`, but browser is offline or revoked | Stale token or foreground message not manually displayed               | API returns `200 OK` with `recipients: 0` or `errors` |

---

## Prerequisites

- **Node.js v24+** (uses Node's built-in `node:sqlite` module-no external database or C++ build tools required)
- **npm**
- A modern browser (Chrome, Edge, or Firefox). _If using Brave, enable `Settings -> Privacy and security -> Use Google services for push messaging`._

---

## Quick Start

1. **Install dependencies**

   ```powershell
   npm install
   ```

2. **Configure environment variables**
   Copy `.env.example` to `.env` and fill in the credentials for whichever provider(s) you want to test:

   ```powershell
   Copy-Item .env.example .env
   ```

   You do **not** need to configure all three providers at once. The server will start cleanly and show which providers are `[READY]` and which are `[MISSING]`.

   See [`.env.example`](.env.example) for step-by-step instructions on generating:
   - **Web Push**: `npx web-push generate-vapid-keys`
   - **Firebase**: Web app config, Web Push certificate (`FIREBASE_VAPID_KEY`), and a Service Account JSON file
   - **OneSignal**: App ID and App API Key (with Web platform configured for `http://localhost:3000` and Local Testing enabled)

3. **Start the server**

   ```powershell
   npm run dev
   ```

4. **Open the test client**
   Open **`http://localhost:3000`** in your browser.
   _(Do not open `client/index.html` via VS Code Live Server-Express must serve the page so the `/api/_` endpoints work.)\*

5. **Test a notification**
   - Pick a `[READY]` provider from the dropdown.
   - Click **Register Browser** and allow notifications when prompted.
   - Enter a title and message, then click **Send Notification**.
   - Compare **Last API Response**, **Browser Receipt & Error Log**, and the **Recent Attempts** table.

---

## Project Structure

```text
web-push-lab/
├── client/                         # Vanilla HTML, CSS, and JS test interface
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── OneSignalSDKWorker.js       # Root-scoped OneSignal Service Worker
│   ├── providers/                  # Browser registration logic per provider
│   └── sw/                         # Scoped Service Workers for web-push & FCM
├── database/                       # Local SQLite database (auto-created, git-ignored)
├── src/
│   ├── config/
│   │   ├── env.js                  # Loads .env & checks provider readiness
│   │   └── db.js                   # Initializes SQLite tables
│   ├── middleware/
│   │   └── errorHandler.js         # JSON error responses
│   ├── modules/
│   │   ├── webpush/                # web-push routes, controller, service
│   │   ├── fcm/                    # firebase-admin routes, controller, service
│   │   ├── onesignal/              # @onesignal/node-onesignal routes, controller, service
│   │   └── diagnostics/            # Send attempt logs & browser receipt beacons
│   ├── app.js                      # Express app setup
│   └── server.js                   # Server entrypoint
├── .env.example
└── package.json
```

---

## API Overview

- `GET /api/health` - Server and SQLite health check.
- `GET /api/providers` - Lists all three providers, readiness status, missing env vars, and safe public client config.
- `POST /api/{webpush|fcm|onesignal}/subscriptions` - Register a browser subscription/token.
- `GET /api/{webpush|fcm|onesignal}/subscriptions` - List saved subscriptions (secrets masked).
- `DELETE /api/{webpush|fcm|onesignal}/subscriptions/:id` - Delete a subscription.
- `POST /api/{webpush|fcm|onesignal}/send` - Send a test notification and log the attempt.
- `GET /api/diagnostics/attempts` - View recent send attempts and browser receipt status.
- `POST /api/diagnostics/client-events` - Used by the browser/Service Workers to report `received`, `displayed`, or `display_failed`.
