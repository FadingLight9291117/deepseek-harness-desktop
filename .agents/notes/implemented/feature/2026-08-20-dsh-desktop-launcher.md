# Agent Note: Launch the Desktop application from dsh

Status: implemented

English | [中文](2026-08-20-dsh-desktop-launcher.zh.md)

## Problem

The macOS Desktop application and the `dsh` CLI share profiles but require different launch commands. An installed application has no CLI command that locates and opens it.

## Decision

`dsh desktop` opens `~/Applications/DeepSeek.app` through macOS `open`. The command does not boot a profile, accept app arguments, or allow a configurable application path. It reports an error on non-macOS systems and when the installed application is absent.

## Alternatives considered

**Boot the `desktop` profile in the CLI process.** Rejected. The Desktop application owns Electron's process and renderer lifecycle; a Node CLI process cannot substitute for it.

**Search every Applications directory.** Rejected. The packaging installer owns one deterministic destination, and implicit discovery could open a stale or unrelated app.

## Consequences

The global `@deepseek-ai/dsh` npm package can launch Desktop after the app is installed. `deepseek-desktop` includes only its `dsh` forwarding script in its published command entries, so one global npm installation makes that command available without an installer command. Users who keep the application elsewhere must open it through macOS or install it into the standard destination.
