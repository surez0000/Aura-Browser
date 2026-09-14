# Releasing Aurora

Aurora ships as installers built by electron-builder and updates itself with
electron-updater. Versions follow [semver](https://semver.org): `MAJOR.MINOR.PATCH`
in `package.json` is the single source of truth, each release is a git tag
`vX.Y.Z`, and the tag is what CI builds and publishes.

## One-time setup

1. **Create the GitHub repository** and push `main`.
2. **Point the updater at it.** In `package.json` → `build.publish`, replace
   `"owner": "CHANGE_ME"` with the GitHub owner (user or org) and set `repo`.
   That block feeds both electron-builder (where to upload) and the running
   app (where to check, and the release page it links to). Until it is set,
   installed builds report "No update source is configured".
3. **macOS signing (optional, but required for in-place updates on macOS).**
   Add these repository secrets and uncomment the matching lines in
   `.github/workflows/release.yml`:
   - `MAC_CERT_P12_BASE64`, `MAC_CERT_PASSWORD` — a Developer ID Application
     certificate exported as .p12, base64-encoded.
   - `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` — for
     notarization; then set `build.mac.notarize` to `true`.

   Without a certificate the DMG still installs (right-click → Open the first
   time, because Gatekeeper does not recognise the developer), but Squirrel.Mac
   refuses to swap an unsigned app, so macOS users update by downloading the
   new DMG from the release page — the in-app status tells them so. Windows and
   Linux update in place unsigned (Windows shows a SmartScreen warning once).

## Cutting a release

```bash
# 1. Make sure main is green and the changelog has an entry for the version.
npm run typecheck && npm run lint && npm run test:unit && npm run test:e2e

# 2. Bump the version, commit, and tag in one step (patch | minor | major).
npm version minor

# 3. Push the commit and the tag. The tag triggers .github/workflows/release.yml.
git push --follow-tags
```

CI then builds on macOS, Windows, and Linux and attaches to the GitHub Release
for that tag:

| OS      | Artifacts                                           | Used by the updater           |
| ------- | --------------------------------------------------- | ----------------------------- |
| macOS   | `Aurora-X.Y.Z-mac-arm64.dmg`, `…-mac-arm64.zip`     | zip + `latest-mac.yml`        |
| Windows | `Aurora-X.Y.Z-win-x64.exe` (one-click NSIS)         | exe + `latest.yml`            |
| Linux   | `Aurora-X.Y.Z-linux-x86_64.AppImage`, `…-amd64.deb` | AppImage + `latest-linux.yml` |

Installed copies check the manifest 15 s after launch and every 6 hours, or
when the user picks **Check for Updates…**. A newer version downloads in the
background; the sidebar shows **Restart to update** and the Settings panel shows
progress. One click quits, installs, and relaunches.

## Building locally

```bash
npm run dist       # installers for this OS into dist/ (unsigned, not published)
npm run dist:dir   # just the unpacked app folder, fastest for a smoke test
npm run icon       # re-render build/icon.png from build/icon.svg
```

`npm run dist` never publishes. `npm run release` does (`--publish always`) and
needs `GH_TOKEN`; CI uses it, you normally should not.

## Versioning rules

- **patch** — fixes, no new UI (`0.1.1`).
- **minor** — features, new settings, visible changes (`0.2.0`).
- **major** — breaking profile/session changes that need migration (`1.0.0`).
- Keep `CHANGELOG.md` current: add under **Unreleased** as you go; `npm version`
  is the moment to rename that heading to the version and date.
- The updater compares semver, so a pre-release tag (`v0.3.0-beta.1`) is only
  offered to people already on a pre-release of the same series.
