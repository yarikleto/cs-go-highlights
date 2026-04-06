# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CS:GO Highlights is a Node.js tool that parses CS:GO/CS2 demo files (`.dem`), detects impressive gameplay moments, and produces edited highlight videos. It has two interfaces: a CLI (`src/index.js`) and an Electron desktop app (`electron/`).

## Commands

```bash
# Install dependencies (both root and electron)
npm install
cd electron && npm install

# Run CLI commands
node src/index.js <command> [options]

# Run Electron app in development
npm run dev
# This starts Vite dev server (port 5173) + Electron concurrently

# Build Electron app for production
cd electron && npm run build

# Build for Windows specifically
cd electron && npm run build:win
```

There are no tests or linting configured.

## Architecture

### Two Entry Points, Shared Core

- **CLI**: `src/index.js` -> `src/cli/index.js` (Commander.js)
- **Electron**: `electron/main/index.js` (main process) + `electron/src/main.jsx` (React renderer)
- **Shared config**: `src/shared/commands.json` and `src/shared/flows.json` define command schemas used by both CLI and Electron UI

### Highlight Processing Pipeline

```
.dem files -> parser.js -> detector/ -> highlightEnricher -> highlights.json
                                                                  |
                                    recorder.js (HLAE capture) <--+
                                           |
                              postprocess (effects + sound)
                                           |
                                    merger.js -> final MP4
```

CLI commands mirror this pipeline: `analyze` -> `record` -> `postprocess-ui` -> `postprocess-sound` -> `merge`

### Detector System (`src/detector/`)

Modular highlight detection with 6 types, each in its own file. Detectors run in order and earlier detectors can exclude kills from later ones (e.g., kills in a series are excluded from knife/one-tap detection). Each type has a priority score for conflict resolution.

### Key Files

- `src/config.js` - All constants: recording settings, encoding params, timing, detection thresholds, scoring, weapon categories
- `src/shared/commands.json` - Command definitions (options, types, defaults) consumed by both CLI registration and Electron UI form generation
- `src/shared/flows.json` - Multi-step workflow definitions (e.g., Full Legacy Pipeline)
- `electron/main/commandRunner.js` - Spawns CLI commands as child processes from Electron
- `electron/main/preload.js` - Context isolation bridge between main and renderer

### Tech Stack

- Pure ESM JavaScript (no TypeScript, no Babel)
- **CLI**: Commander.js, `demofile` (demo parser), FFmpeg (spawned externally), HLAE (external capture tool)
- **Electron UI**: React 18, Material-UI 5, React Router 6, Vite 5
- electron-builder for packaging (bundles CLI source via `extraResources`)

### Electron IPC Pattern

The Electron app runs CLI commands by spawning `node src/index.js <command>` as child processes via `commandRunner.js`. The renderer communicates through IPC handlers defined in `electron/main/ipc.js`, with the preload script exposing a limited API. Video playback uses a custom `local-media://` protocol with range request support.
