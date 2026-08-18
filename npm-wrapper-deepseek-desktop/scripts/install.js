#!/usr/bin/env node
/**
 * deepseek-desktop installer (also the `postinstall` hook).
 *
 * Downloads the DeepSeek desktop app zip from GitHub Releases, verifies its
 * SHA-256, and installs DeepSeek.app into $DEEPSEEK_APP_DIR (default
 * ~/Applications). Downloads prefer aria2c (multi-connection, when installed)
 * and fall back to curl; both bypass the quarantine attribute, so Gatekeeper
 * does not block first launch — no right-click-to-open needed.
 *
 * Overrides (for testing or mirrors):
 *   DEEPSEEK_DOWNLOAD_URL  alternative zip URL (any scheme the downloader supports)
 *   DEEPSEEK_SHA256        expected SHA-256 of that zip
 *   DEEPSEEK_APP_DIR       install directory instead of ~/Applications
 */
'use strict'

const { execFileSync } = require('node:child_process')
const { existsSync, mkdirSync, rmSync } = require('node:fs')
const { tmpdir, homedir } = require('node:os')
const { join } = require('node:path')

const APP_NAME = 'DeepSeek'
const DEFAULT_URL =
  'https://github.com/FadingLight9291117/deepseek-harness-desktop/releases/download/desktop-v0.1.0-rc.5/DeepSeek-darwin-arm64.zip'
const DEFAULT_SHA256 = 'd6026f8f5e48fa14638a71fb04c4a4daf9600f7c97dadfdc6a88f985ef65a85c'

/** @returns {string} hex SHA-256 of the file at `path`. */
function sha256(path) {
  const output = execFileSync('shasum', ['-a', '256', path], { encoding: 'utf8' })
  return output.trim().split(/\s+/)[0].toLowerCase()
}

/** True when `command` resolves on PATH. */
function commandAvailable(command) {
  try {
    execFileSync('which', [command], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * Download `url` to `zipPath`, preferring aria2c, then wget, then curl.
 * aria2c shows its own live progress and splits the file over 16
 * connections; wget is a fast single-connection fallback; curl keeps working
 * everywhere. Progress stays visible under npm (which captures script output)
 * via aria2c's TTY-independent progress or wget/curl's --progress-bar.
 */
function download(url, zipPath) {
  const dir = require('node:path').dirname(zipPath)
  const file = require('node:path').basename(zipPath)
  if (commandAvailable('aria2c')) {
    console.log('deepseek-desktop: using aria2c (multi-connection download)')
    // -x16 splits the file over 16 connections, -s16 is the per-server split;
    // --console-log-level=warn silences aria2's connection chatter while its
    // progress line still prints on a TTY.
    execFileSync('aria2c', ['-x16', '-s16', '--console-log-level=warn', '-d', dir, '-o', file, url], { stdio: 'inherit' })
    return
  }
  if (commandAvailable('wget')) {
    console.log('deepseek-desktop: using wget')
    // -q goes quiet except errors; the progress bar renders on TTYs and
    // --show-progress keeps it under npm's captured output.
    execFileSync('wget', ['-q', '--show-progress', '-O', zipPath, url], { stdio: 'inherit' })
    return
  }
  console.log('deepseek-desktop: using curl (install aria2c for faster downloads)')
  // -f fail on HTTP errors, -L follow redirects, --progress-bar forces the
  // progress bar even when stdout/stderr is a pipe (npm captures script output).
  execFileSync('curl', ['-fL', '--retry', '3', '--progress-bar', '-o', zipPath, url], { stdio: 'inherit' })
}


function main() {
  if (process.platform !== 'darwin') {
    console.error(`deepseek-desktop: this installer only supports macOS (darwin), this host is ${process.platform}.`)
    process.exit(1)
  }
  if (process.arch !== 'arm64') {
    console.error(`deepseek-desktop: the current release ships arm64 only; this Mac is ${process.arch}.`)
    process.exit(1)
  }

  const url = process.env.DEEPSEEK_DOWNLOAD_URL || DEFAULT_URL
  const expected = (process.env.DEEPSEEK_SHA256 || DEFAULT_SHA256).toLowerCase()
  const destRoot = process.env.DEEPSEEK_APP_DIR || join(homedir(), 'Applications')
  const zipPath = join(tmpdir(), `deepseek-desktop-${process.pid}.zip`)
  const appPath = join(destRoot, `${APP_NAME}.app`)

  console.log(`deepseek-desktop: downloading ${APP_NAME} from ${url}`)
  download(url, zipPath)

  const actual = sha256(zipPath)
  if (actual !== expected) {
    rmSync(zipPath, { force: true })
    console.error(`deepseek-desktop: SHA-256 mismatch\n  expected ${expected}\n  actual   ${actual}`)
    process.exit(1)
  }

  if (existsSync(appPath)) rmSync(appPath, { recursive: true, force: true })
  mkdirSync(destRoot, { recursive: true })
  console.log(`deepseek-desktop: installing ${APP_NAME}.app into ${destRoot}`)
  execFileSync('ditto', ['-x', '-k', zipPath, destRoot], { stdio: 'inherit' })
  rmSync(zipPath, { force: true })
  console.log(`deepseek-desktop: installed ${appPath}. Launch it from Launchpad or Finder.`)
}

try {
  main()
} catch (error) {
  console.error(`deepseek-desktop: install failed: ${error.message}`)
  process.exit(1)
}
