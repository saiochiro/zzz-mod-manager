# ProxyLaunch (ZZZ Mod Manager) - notes for Claude

Electron + Vite + React desktop mod launcher for Zenless Zone Zero. Owner: saiochiro (Discord: ghxty).
Local project on the owner's PC: `D:\Projects\ZZZ_Manager` (same files as this repo, plus personal data folders that are git-ignored).

## Shipping an app update (do this whenever the owner wants changes to reach users)

Installed apps check GitHub Releases on launch and every 6 h (electron-updater, `electron/updater.ts`).
Releases are built by `.github/workflows/release.yml` on push to `main` when `package.json`'s version has no release yet.

1. Make the code changes.
2. Raise `"version"` in `package.json` AND the two root entries in `package-lock.json` (patch bump unless told otherwise).
3. Rewrite `RELEASE_NOTES.md` (shown verbatim in the in-app update popup; plain words, no em dashes, end with the XXMI + Discord line).
4. Commit and push to `main`. Watch the "Release" workflow run; verify release `vX.Y.Z` has
   `ZZZ-Mod-Manager-Setup-X.Y.Z.exe`, `.blockmap`, `latest.yml` and the Portable exe.
5. Mirror the changed files to the owner's PC folder so both stay identical.

From the owner's PC the same thing is `Publish_Update.bat` (scripts/publish-update.mjs).

Notes:
- Pushing tags or uploading release assets from a Claude session is blocked; the workflow creates tags/releases itself.
- Never commit ZZMI_Root/, ZZZ_Mod_Manager_AppData/, release/, node_modules/.
- Public-facing text (README, release notes): no real name or photos of the owner; no em dashes.
- UI must not use official character art, logos or game names in theme names.
