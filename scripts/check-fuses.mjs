#!/usr/bin/env node
/**
 * Read the fuses back out of a PACKAGED Electron binary and fail unless each
 * one matches electron-builder.yml. Flipping happens inside electron-builder;
 * this proves it happened to the binary that ships.
 *
 *   node scripts/check-fuses.mjs dist/linux-unpacked/helixis
 */
import { getCurrentFuseWire, FuseV1Options } from '@electron/fuses'

// @electron/fuses' FuseState values (ASCII '0' / '1'); the enum is not exported.
const FuseState = { DISABLE: 48, ENABLE: 49 }

// Must match electronFuses in electron-builder.yml.
const EXPECTED = {
  RunAsNode: false,
  EnableNodeOptionsEnvironmentVariable: false,
  EnableNodeCliInspectArguments: false,
  GrantFileProtocolExtraPrivileges: false,
  EnableCookieEncryption: true,
  EnableEmbeddedAsarIntegrityValidation: true,
  OnlyLoadAppFromAsar: true
}

const binary = process.argv[2]
if (!binary) {
  console.error('usage: node scripts/check-fuses.mjs <path to packaged executable>')
  process.exit(2)
}

const wire = await getCurrentFuseWire(binary)
let failed = false
for (const [name, want] of Object.entries(EXPECTED)) {
  const state = wire[FuseV1Options[name]]
  const got = state === FuseState.ENABLE ? true : state === FuseState.DISABLE ? false : `unknown(${state})`
  const ok = got === want
  if (!ok) failed = true
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${got}${ok ? '' : ` (want ${want})`}`)
}
process.exit(failed ? 1 : 0)
