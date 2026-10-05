#!/usr/bin/env node
/**
 * Copy the Chrome extension's panel (brandonoscar/helixis-sidebar) into
 * resources/copilot/, which the browser serves as its built-in copilot at
 * app://copilot/panel.html (src/main/copilot.ts).
 *
 *   node scripts/sync-copilot.mjs ../helixis-sidebar
 *
 * platform.js is never copied: it is the host seam, and the desktop keeps its
 * own copy backed by the copilot preload instead of chrome.*. Everything else
 * in SHARED is byte-identical to the extension. The sidebar commit lands in
 * resources/copilot/SOURCE so a reviewer can see which version is bundled.
 */
import { copyFileSync, existsSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

export const SHARED = [
  'panel.html',
  'panel.css',
  'panel.js',
  'auth.js',
  'agent.js',
  'config.js',
  'context-policy.js'
]

const src = resolve(process.argv[2] ?? '../helixis-sidebar')
const dest = resolve(import.meta.dirname, '../resources/copilot')

for (const name of SHARED) {
  if (!existsSync(join(src, name))) {
    console.error(`sync-copilot: ${join(src, name)} not found — pass the helixis-sidebar checkout path`)
    process.exit(1)
  }
}

const git = (...args) => execFileSync('git', ['-C', src, ...args], { encoding: 'utf8' }).trim()
const sha = git('rev-parse', 'HEAD')
const dirty = git('status', '--porcelain', '--', ...SHARED)
if (dirty) {
  console.error(`sync-copilot: uncommitted changes in the sidebar panel files:\n${dirty}\nCommit them first so SOURCE names a real commit.`)
  process.exit(1)
}

for (const name of SHARED) copyFileSync(join(src, name), join(dest, name))
writeFileSync(
  join(dest, 'SOURCE'),
  `brandonoscar/helixis-sidebar@${sha}\n` +
    `Copied by scripts/sync-copilot.mjs. Edit these files in helixis-sidebar, not here;\n` +
    `platform.js is the only desktop-owned file.\n`
)
console.log(`sync-copilot: copied ${SHARED.length} files from helixis-sidebar@${sha.slice(0, 7)}`)
