# Checklist

Phone-first checklists for the fire department, the shop, and everything else. Version 1.4.5. Data stays on this phone first. Supabase sync is optional.

## Run locally

```bash
npm install
npm run dev
```

The dev server listens on port 8080. `npm run typecheck`, `npm test`, and `npm run build:spa` are the checks used before a phone build. `npm run cap:sync` builds the static app and copies it into the Capacitor Android project. `android/` is generated, not committed.

## What changed

- Saved lists in `checklist.state.v1` are copied to `checklist.state.v1.bak`, then upgraded by `migrateV1toV2` into `checklist.state.v2`. Lists, tasks, checks, notes, and due dates are kept. An old date-only due becomes 9:00 AM America/New_York. If the upgrade fails, v1 is left in place and the app says so.
- Each list has Morning, Afternoon, and Evening columns. Rename, add, remove (with a second tap), and reorder them. Removing a column moves its items to the next one. A list always keeps one column.
- One list fills the screen. A compact switcher (the check logo, the list name, and a menu) changes lists without scrolling into the others. Long-press the grip on a task to drag it. Up and Down buttons do the same thing. Order is stored in `position`. Settings is its own screen.
- Each list shows `18 of 20, 90%` (or `0 of 0` when empty), a bar, and a score: 1 point per checked item plus 1 when it was finished on time.
- Supabase sync is optional. Without the env vars the status line says **On this phone**.

Shift reset, due alerts, the live countdown, and per-list themes are in the app. The Android project is still generated with `npx cap add android`, not committed.

- **Fire department reset.** On a shift day (a Google Calendar event whose title contains the shift title, default “Fire department”) at 9:00 AM America/New_York, the fire list is snapshotted into Last shift and then unchecked. It runs once per Eastern day, including when the app is opened after 9. Start list does the same reset by hand and stays on the fire list. The shift calendar and shift title are in Settings. Barbershop stays a normal starting list.
- **Notifications.** Due times schedule a local notification on the phone (`@capacitor/local-notifications`) or, in the browser, a Notification when that API is allowed. Checking, unchecking, editing, or deleting cancels and reschedules. If notifications aren’t available, the list still works. Allow notifications is in Settings.
- **Due timers.** Each task with a due time shows a live countdown (`Due in 1h 12m`, `Overdue 5m`). When the time arrives on an open unchecked task, a banner appears and the phone beeps or vibrates when it can.
- **Themes.** Light, dark, contrast, pink, and rugged stay as presets. Settings has a theme editor for the app background, list background, each day-part column, text, muted text, accent, buttons, borders, and the checked-item color. Textures are none, diamond plate, floral, brushed metal, carbon fiber, wood grain, leather, hexagon, chevron, linen, and dots. Save stores a new theme. Edit opens a saved theme and Save changes updates that same theme. Use app default clears a list’s override. Colors and textures are stored in `settings` and `lists.theme`, which already sync as jsonb.
- **Notes.** Every task shows its notes field. They save when you leave the field, and the save button still works.
- **Icon.** The logo is a red check with a white edge on a navy rounded square. See `public/icons/check.svg` and `resources/ANDROID-ICON.md`.

## Env vars

Set these yourself. Nothing here is hard-coded.

| Name | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Public anon key |
| `VITE_SYNC_SPACE_ID` | Long random id. It acts like the password for this space. |
| `VITE_GOOGLE_CLIENT_ID` | Optional. Defaults to the public web client already used for Calendar. |

There is no Google client secret.

## setup.sql

Paste [setup.sql](setup.sql) into the Supabase SQL editor. The same script is under **Sync setup** in the gear panel. Upserts use `on conflict (id)` for lists and tasks, and `on conflict (space_id)` for settings. A row only wins when its `updated_at` is newer. Deletes set `deleted_at`.

## Voice

The mic next to the gear uses the phone’s speech recognizer. On Android that is `@capacitor-community/speech-recognition`. Its manifest adds `RECORD_AUDIO`, and the mic asks for that permission before it listens. Listening uses partial results from the device recognizer, not the system popup. In a browser it uses the Web Speech API when the browser has it. No API key. “add milk”, “add milk by 6 pm”, “check hydrant”, and “uncheck hydrant” run on the open list.

## How to test

1. **Sync.** With no env vars, add a task, reload, and confirm it is still there and the status says On this phone. With all three vars set, change a task on one signed-in browser and confirm the other shows it within about 30 seconds. Delete a list (two taps) and confirm it stays gone after sync.
2. **Calendar.** In Settings, tap Calendar. Google’s popup should open for an approved test account. A denied account shows “Only approved test accounts can connect right now.” Inside the Android wrapper the button is replaced with “Calendar sign-in works in the browser version.”
3. **Drag.** Long-press a task grip, drop it, reload. It stays put. Up and Down do the same. List order uses Up and Down in the list menu.
4. **Columns.** Old tasks sit under Morning. Rename Evening to Night, reload, and the name stays. Drag a task into another column.
5. **Score.** Check an item. The `N of M` line, the bar, and the score change immediately. An empty list reads `0 of 0`.
