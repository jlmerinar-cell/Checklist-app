# Android launcher icon

`android/` is gitignored and rebuilt with Capacitor. The launcher art is the same check mark as the app: a bold red check, a white edge, and a navy rounded square (`#0A3161`, `#FFFFFF`, `#BF0A30`).

Source SVG: `public/icons/check.svg`.

Committed PNG sources, produced by `node scripts/render-brand-icons.mjs`:

- `resources/icon.png` — 1024×1024 full icon
- `resources/icon-foreground.png` — check only, transparent background, padded for the adaptive-icon safe zone
- `resources/icon-background.png` — solid navy

After `npx cap add android` and `npm run cap:sync`:

```bash
npx @capacitor/assets generate --android --assetPath resources --iconBackgroundColor "#0A3161" --iconBackgroundColorDark "#0A3161"
```

That writes the mipmaps into `android/`. Do not commit that directory.
