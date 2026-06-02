# Repository Guidelines

## Project Structure & Module Organization

This repository contains a Node.js CLI plus an Electron UI for CS:GO highlight videos. Core CLI code lives in `src/`: parsing and recording are in top-level modules such as `parser.js`, `recorder.js`, and `merger.js`; highlight detectors are in `src/detector/`; CLI commands are in `src/cli/commands/`; shared command and workflow schemas are in `src/shared/`. The Electron app lives in `ui/`, with React renderer code in `ui/src/` and main-process code in `ui/main/`. Tests live beside modules as `*.test.js`, with fixtures in `tests/fixtures/`. Documentation is in `docs/`, fonts in `fonts/`, and assets in `textures/`.

## Build, Test, and Development Commands

- `npm install`: installs root dependencies and runs `postinstall` to install Electron dependencies.
- `npm start -- <command> [options]`: runs the CLI entry point at `src/index.js`.
- `node src/index.js <command> [options]`: direct CLI invocation for debugging.
- `npm run dev`: starts the Electron UI with Vite on port `5173`.
- `npm run build`: builds the Electron app through `electron-builder`.
- `npm test`: runs Node's built-in test runner for `src/**/*.test.js`.

Use Node 18 or newer; `.nvmrc` pins version `18`.

## Coding Style & Naming Conventions

Write code-first changes: avoid speculative rewrites, broad refactors, and unnecessary abstractions. Apply SOLID, DRY, KISS, and YAGNI pragmatically; prefer the smallest implementation that fits existing module boundaries. Use pure ESM JavaScript (`import`/`export`) and two-space indentation. Prefer camelCase for functions and variables, PascalCase for React components, and command filenames that match CLI commands such as `analyze.js` or `postprocessSound.js`. Keep `src/shared/commands.json` synchronized with CLI and UI behavior. There is no configured linter or formatter, so preserve local style manually.

## Testing Guidelines

Tests use `node:test` with `node:assert/strict`. Name test files `*.test.js` near the implementation they exercise, and place reusable inputs in `tests/fixtures/`. Cover parser, detector, config, and CLI edge cases with small fixtures rather than live demo or video dependencies. Run `npm test` before submitting changes.

## Commit & Pull Request Guidelines

Recent history uses short, imperative or dependency-focused subjects, for example `Bump axios from 1.15.0 to 1.16.0 in /ui`, plus GitHub merge commits. Keep commit subjects concise and scoped. Pull requests should include a description, commands run, linked issues when relevant, and screenshots or short clips for Electron UI changes.

## Security & Configuration Tips

Do not commit local CS:GO, HLAE, FFmpeg, demo, or output-video paths. Treat generated videos, archives, and user demo files as local artifacts unless explicitly needed for a fixture.
