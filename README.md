# Checklist

One screen. Several lists. Notes stay on the task you opened, and they save only when you tap **save**.

Barbershop, Fire department, and Personal are already there. Switch with the tabs. **+** adds a list. **···** or a long-press renames or deletes one.

## Run it locally

```bash
npm install
npm run dev
```

Open the URL the dev server prints (port 8080). Lists, checks, notes, and themes save in this browser immediately. You do not need Google or Supabase for that.

Optional environment variables, in a `.env` file or your shell. Vite only exposes variables that start with `VITE_`. Do not put a Google client secret in here — the browser flow does not use one.

```bash
VITE_GOOGLE_CLIENT_ID=
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_SYNC_SPACE_ID=
VITE_CALENDAR_HOOK_URL=
VITE_CALENDAR_HOOK_TOKEN=
```

Leave them empty and the phone keeps every list in this browser only. The calendar hook is how the Command box creates an event. The Supabase trio is how this phone and a computer share one copy of the lists. Do not commit the tokens.

Restart the dev server after changing them.

## Themes

Light, Dark, High contrast, Pink, and Rugged. Dark is the default. The choice is stored in `localStorage` and applied as a class on `<body>`: `theme-light`, `theme-dark`, `theme-contrast`, `theme-pink`, or `theme-rugged`.

Pink uses Nunito (still bold) with a blush background and a faint floral pattern. Rugged uses charcoal, forest green, and a leather gradient with a light noise overlay. Text and buttons stay above WCAG AA contrast in every theme.

The theme control is a palette icon in the bottom corner. Tap it, tap a swatch, and the theme applies and the picker closes. The same panel has the Morning daily switch.

## Daily calendar

Daily is a built-in tab. It cannot be renamed or deleted. With Morning daily on, the app reads today's events from the connected Google Calendar each morning (and when the app is opened on a new day) and replaces that tab's rows. Yesterday's rows are cleared when the date changes. Checks and saved notes on events that are still on today's calendar are kept if Daily refreshes again the same day.

The read uses the same OAuth token as due-date events, scope `calendar.events`. Testing mode still only works for Google accounts you added as test users. If the read fails, the status line shows a short error and the rest of the app keeps working.

Turn it on from the palette panel, or:

```text
checklist daily on
checklist daily
checklist daily off
```

`checklist daily` fills the tab now. `on` does that and keeps doing it every morning.

## Bot commands

Everything on screen is also a function. After the page loads, `window.checklist` is ready. A string runs the parser. Named functions hit the same storage as the buttons.

```js
checklist("checklist add fire-dept check hydrant map");
checklist.addTask("fire-dept", "check hydrant map");
checklist.toggleCheckbox("fire-dept", "hydrant");
checklist.openNotes("personal", "EMT");
checklist.saveNotes("personal", "EMT", "Airway, breathing, circulation");
checklist.setDueDate("fire-dept", "hydrant", "2026-10-20");
checklist.changeTheme("pink");
checklist.setDailyEnabled(true);
checklist.refreshDaily();
checklist.downloadLists();
```

| Command                                                 | What it does                                                |
| ------------------------------------------------------- | ----------------------------------------------------------- |
| `checklist add <list> <task>`                           | Add a task. The rest of the line is the title.              |
| `checklist create <name>`                               | New list                                                    |
| `checklist switch <list>`                               | Show that list                                              |
| `checklist rename <list> to <name>`                     | Rename                                                      |
| `checklist delete <list>`                               | Delete                                                      |
| `checklist check <list> <task>`                         | Check                                                       |
| `checklist uncheck <list> <task>`                       | Uncheck                                                     |
| `checklist toggle <list> <task>`                        | Flip the checkbox                                           |
| `checklist edit <list> <task> to <title>`               | Change the title                                            |
| `checklist notes <list> <task>`                         | Open that row’s notes                                       |
| `checklist save <list> <task> :: <notes>`               | Save notes                                                  |
| `checklist due <list> <task> <YYYY-MM-DD>`              | Set a due date                                              |
| `checklist clear-due <list> <task>`                     | Clear it                                                    |
| `checklist theme <light\|dark\|contrast\|pink\|rugged>` | Theme                                                       |
| `checklist daily on`                                    | Fill Daily each morning                                     |
| `checklist daily`                                       | Fill Daily now                                              |
| `checklist daily off`                                   | Stop the morning fill                                       |
| `checklist share <list>`                                | Invite link for that list only                              |
| `checklist download`                                    | Save every list as a JSON file                              |
| `checklist connect-calendar`                            | Google sign-in (due dates and Daily)                        |
| `add <event> <when>`                                    | Google Calendar event, for example `add dentist Friday 2pm` |
| `schedule <event> <when>`                               | Same, and it never matches a list name                      |
| `calendar <event> <when>`                               | Same                                                        |
| `checklist help`                                        | This list                                                   |

There is also a Command box at the bottom of the screen. Type a command and tap **Run**. The line under the button is the result.

## Add an event from the Command box

This path does not use Google sign-in inside the app. The Android WebView blocks that login page. A Google Apps Script web app, running as you, creates the event on your default calendar. The phone only sends the title and the times.

Phrases that start with `add`, `schedule`, or `calendar` and include a time become a one-hour event (longer if you name the end, as in `Friday 2pm to 4pm`):

```text
add dentist appointment Friday 2pm
schedule tomorrow 9am standup
calendar lunch Friday 12pm
```

`checklist add <list> <task>` is unchanged. If the words after `add` match a list, it is still a checklist task. Use `schedule` or `calendar` when you want an event anyway.

The result or the error shows on the status line under **Run**. If the URL or token is missing, that line says the calendar hook is not set up.

### 1. Create the Apps Script (on a computer)

1. Open [script.google.com](https://script.google.com) while signed in to the Google account whose calendar should receive the events. Create a new project.
2. Replace the sample `Code.gs` with the file [`apps-script/Code.gs`](apps-script/Code.gs) from this repo. Save.
3. Project Settings (the gear) → Script properties → Add script property. Property: `CAL_TOKEN`. Value: a long random string you make up. This is the shared password. Save.
4. Deploy → New deployment → gear → **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Deploy, and allow the calendar permission when Google asks.
6. Copy the web app URL. It ends in `/exec`.

Opening that URL in a browser shows a short JSON note. That is expected. The app sends a POST.

After you edit `Code.gs`, deploy a **new version** (Deploy → Manage deployments → pencil → Version: New version → Deploy). Saving the script leaves the live URL on the old code. `CAL_TOKEN` updates on the next request, so a property change does not need a new deployment.

The browser request has to be CORS-safe. Apps Script does not answer a preflight, so the app sends `Content-Type: text/plain` and follows the redirect Apps Script returns. The script documents this at the top of `Code.gs`.

### 2. Add the two repository secrets

On GitHub, open this repo → Settings → Secrets and variables → Actions → New repository secret. Add both. Do not put the values in a commit.

| Secret                     | Value                          |
| -------------------------- | ------------------------------ |
| `VITE_CALENDAR_HOOK_URL`   | The `/exec` URL                |
| `VITE_CALENDAR_HOOK_TOKEN` | The same string as `CAL_TOKEN` |

The Android workflow reads those secrets when it builds the app and bakes them into the phone build. They are not stored in git.

The token is inside the installed app, because the phone has to send it. Anyone with the APK can add events to that calendar. Rotate it by changing `CAL_TOKEN` and the GitHub secret, then rebuild.

### 3. Rebuild and try it

Push to `main`, or run the **Android APK** workflow by hand. Install the new APK. In the Command box, type `add dentist appointment Friday 2pm` and tap **Run**. The status line names the event when it lands, or shows the error from the script.

On a computer, the same two variables can be set in the shell before `npm run dev`. Restart the dev server after changing them. Do not commit them.

```bash
VITE_CALENDAR_HOOK_URL='https://script.google.com/macros/s/XXXX/exec' \
VITE_CALENDAR_HOOK_TOKEN='the-same-string-as-CAL_TOKEN' \
npm run dev
```

## Google Calendar (test users)

Due dates always save on the phone. If a client ID is set and the user has connected, the app creates an all-day event on their primary calendar.

1. In Google Cloud Console, create a project and an **OAuth client ID** of type **Web application**.
2. Authorized JavaScript origins: `http://localhost:8080` plus your real https origin when you deploy. You do not need a client secret for this flow.
3. Enable the **Google Calendar API**.
4. OAuth consent screen: User type External, publishing status **Testing**. Add the scope `https://www.googleapis.com/auth/calendar.events` if it is not already there.
5. Under **Test users**, add every Google account that should be allowed to connect. While the app is in Testing, anyone else gets refused. That is the free unverified-consent limit.
6. Put the client ID in `VITE_GOOGLE_CLIENT_ID` and restart.
7. In the app, tap **Connect calendar**. The token stays in this browser’s `localStorage`. It expires after about an hour; tap the button again when it does.

Search the code for `VERIFIED_CONSENT` in `src/lib/checklist/calendar.ts` before you let the public in. That comment is the upgrade: move the consent screen to production, submit Google’s verification for the calendar scope, then remove the testing-mode sentence in the status area. A long-lived refresh token needs a small server you control. Do not ship the client secret in the app.

## Supabase

Two different uses of one project. Both are off until the env vars are set, and the app then works on this phone only.

### Owner sync

This copies **every** list, task, and saved note for one person. Edits on the phone go up. Edits made in Supabase (including [`scripts/remote-edit.mjs`](scripts/remote-edit.mjs)) show up on the phone. The phone pulls when it opens and when it comes back to the foreground, pushes local changes after a short pause, and listens on Supabase Realtime while that socket is up. It also pulls about every 30 seconds, which is what covers a dropped socket. Offline edits stay on the phone and merge when the network returns. Each task keeps the copy with the later `updatedAt`.

1. Create a free project at [supabase.com](https://supabase.com).
2. Open the SQL editor. Run [`supabase/schema.sql`](supabase/schema.sql), then [`supabase/migrations/0001_owner_sync.sql`](supabase/migrations/0001_owner_sync.sql). If this project already had the sharing functions, run `schema.sql` again so the caps below match.
3. Project Settings → API: copy the **Project URL** and the **anon public** key. Do not copy the service_role key.
4. Make a space id, a long random string used only for this phone:

   ```bash
   openssl rand -hex 32
   ```

5. On GitHub: this repo → Settings → Secrets and variables → Actions → New repository secret. Add these three. The Android workflow bakes them into the APK. Empty secrets leave that build local-only. Do not commit the values.

   | Secret                   | Value                      |
   | ------------------------ | -------------------------- |
   | `VITE_SUPABASE_URL`      | Project URL                |
   | `VITE_SUPABASE_ANON_KEY` | anon public key            |
   | `VITE_SYNC_SPACE_ID`     | The hex string from step 4 |

6. Rebuild the APK (push to `main`, or run the Android APK workflow). Install that build. The same three variables can be set in the shell before `npm run dev` on a computer. Restart the dev server after changing them.

The anon key and the space id both end up inside the APK, because the phone has to send them. Anyone who unpacks the app can read and change this space. Row level security only returns rows whose `space_id` matches the `x-sync-space` header, so a request without that id sees nothing, and one space cannot read another. It does not protect this space from someone who has the app. Do not put another person’s private notes in this project. The service_role key bypasses that lock; keep it out of the app, the GitHub secrets, and the script. To rotate the space id, generate a new one, update the secret, rebuild, and leave the old rows where they are.

### Edit a task from a computer

With the same three variables exported:

```bash
node scripts/remote-edit.mjs notes --list "Fire department" --task "Check hydrant map" --notes "Called the station"
node scripts/remote-edit.mjs add --list "Personal" --task "Buy milk"
node scripts/remote-edit.mjs remove --list "Personal" --task "Buy milk"
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SYNC_SPACE_ID` are accepted as aliases. The list match is the full name or slug. The task match is the full title. Comparison ignores case.

### Invite sharing

Sharing is an invite link for **one list**. Barbershop can be shared while Fire department and Personal stay on the phone. A collaborator who opens the link only receives that list, and live updates stay on that list. Each list has its own token. The status line says On this phone, Syncing, Live, Offline, or Reconnecting. A failed Daily calendar read shows on that same line.

Free tier, enforced in the app and in SQL:

- 25 shared lists (`FREE_SHARED_LIST_CAP`)
- 10 members per list (`FREE_MEMBER_CAP`)

Local-only lists are not capped.

1. The project and SQL from the owner-sync steps above are the same ones sharing uses. `schema.sql` is the sharing functions.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the space id is not required for an invite).
3. Tap **Share this list** and send the link. The other person opens it in a browser. No accounts. They see that list only.

The anon key is public. The sharing tables are locked to the SQL functions, and those functions require the invite token. Do not switch them to “allow all” to make debugging easier. Owner-sync tables are locked to the space id header, as described above.

Search `UPGRADE PATH` in `src/lib/checklist/limits.ts` and `src/lib/checklist/sharing.ts`. Raising the caps is a one-line change in both `limits.ts` and `schema.sql` (re-run the functions). `upgradeLimits()` is the stub a paid plan would replace. Nothing in the app charges the user.

## Offline

Every checkbox, title, note draft, and due date writes to `localStorage` first. With the space id set, Supabase is a second copy of every list. Without it, Supabase is a second copy only for lists you have shared. If the network drops, the status dot switches to Offline and flips to Reconnecting when it returns. Notes you have not tapped **save** on stay on this phone and are not sent.

## Publish to the App Store or Google Play

The app is a progressive web app. On iPhone, Safari → Share → Add to Home Screen. On Android, the browser’s Install prompt does the same. That is the fastest way to put it on a phone.

A store listing is a wrapper around this same site:

- **Google Play:** a Trusted Web Activity (Bubblewrap / PWABuilder) or Capacitor. Fill out the Data safety form. Declare calendar access only if you turn Google sync on.
- **App Store:** Capacitor (or similar) plus an Apple Developer account. Apple wants a privacy policy URL. Invite links do not need user accounts. If you add sign-in later, you will also need Sign in with Apple.

Before either store accepts a public build:

1. Finish Google verification (`VERIFIED_CONSENT`). Do not ship while the consent screen is still in Testing, or only your test users can connect a calendar.
2. Decide whether the free-tier caps are enough. If not, upgrade Supabase and raise the caps.
3. Host the site on https. Add that origin to the Google OAuth client.
4. Put a privacy policy next to the listing. It should say lists can be stored on the device, shared lists are stored in your Supabase project, and due dates are sent to Google Calendar only after the person connects.

The screen, storage, calendar, sharing, themes, and commands are separate files under `src/lib/checklist` and `src/components/checklist`. Replace one module without rewriting the others.
