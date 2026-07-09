# Distributing Helixis Desktop (unsigned tester builds)

How to cut a build and hand it to testers, and what testers do to install it.
These are **unsigned** builds — no Apple / Windows code-signing certificates yet
— so each OS shows a one-time "unknown developer" prompt. Everything else works,
including background auto-update on Windows and Linux.

## Cut a release (maintainer)

1. Bump `version` in `package.json` (e.g. `0.1.0` → `0.1.1`).
2. Commit it.
3. Tag the commit with a matching `v` tag and push the tag:

   ```bash
   git tag v0.1.1
   git push origin v0.1.1
   ```

The tag push triggers `.github/workflows/release.yml`, which builds on macOS,
Windows, and Linux runners and publishes the installers to a **GitHub Release**
for that tag. (You can also run the workflow manually from the Actions tab; it
publishes to the release named after the current `package.json` version.)

When it finishes, the Release page has:

| OS | Asset | Install |
|----|-------|---------|
| macOS | `Helixis-<ver>.dmg` (+ `-arm64` on Apple Silicon) | open the dmg, drag Helixis to Applications |
| Windows | `Helixis Setup <ver>.exe` | run it |
| Linux | `Helixis-<ver>.AppImage` | `chmod +x` then run |

The Release also carries `latest.yml` / `latest-mac.yml` / `latest-linux.yml` —
these are the auto-update manifests; don't delete them.

## Install (testers)

**macOS** — open the `.dmg`, drag **Helixis** into Applications. First launch:
right-click the app → **Open** → **Open** (this approves the unsigned app once;
double-clicking would just show "cannot be opened"). After that it opens normally.

**Windows** — run `Helixis Setup <ver>.exe`. SmartScreen shows *"Windows
protected your PC"* → click **More info** → **Run anyway**. Installs like any app.

**Linux** — download the `.AppImage`, make it executable
(`chmod +x Helixis-*.AppImage`), and run it. No install step.

## Updates

- **Windows & Linux** update themselves: the installed app checks the GitHub
  Release feed on launch, downloads a newer version in the background, and
  applies it on next quit. Testers just keep using the app — the launch after a
  release is the new version.
- **macOS** auto-update needs a *signed* build (Squirrel.Mac refuses unsigned
  updates), so mac testers download each new `.dmg` by hand for now. Signing +
  notarization is a later step that turns on mac auto-update without any other
  change.

## What "signed later" adds

Adding an Apple Developer cert + Windows code-signing cert removes the one-time
OS prompts and switches on macOS auto-update. It's a build-config + CI-secret
change — no app-code or architecture change — so it can land whenever the certs
are in hand.
