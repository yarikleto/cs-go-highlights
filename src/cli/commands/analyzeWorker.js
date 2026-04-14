/**
 * @fileoverview Worker thread for parallel demo analysis
 *
 * Receives a single demo task via workerData, runs the full
 * processSingleDemo pipeline, and posts the result back.
 */

import { workerData, parentPort } from 'worker_threads';
import { parseDemo } from '../../parser.js';
import { detectHighlights } from '../../detector.js';
import { resolveCollisions } from '../../resolver.js';
import { DEFAULT_CONFIG } from '../config.js';
import { enrichAllHighlights } from '../services/highlightEnricher.js';

const { demoFile, fileName, soloTicks } = workerData;

function log(msg) {
  parentPort.postMessage({ type: 'log', msg });
}

async function run() {
  // Parse demo
  const demoData = await parseDemo(demoFile);
  log(`  Tick rate: ${demoData.tickRate}`);
  log(`  Total kills: ${demoData.kills.length}`);
  log(`  Total rounds: ${demoData.rounds.length}`);

  // Detect highlights
  let highlights = detectHighlights(demoData, DEFAULT_CONFIG);
  log(`  Raw highlights found: ${highlights.length}`);

  // Add solo kill highlights
  const soloHighlights = createSoloHighlights(demoData, soloTicks);
  if (soloHighlights.length > 0) {
    highlights.push(...soloHighlights);
    log(`  Added ${soloHighlights.length} solo kill highlight(s)`);
  }

  // Resolve collisions
  highlights = resolveCollisions(highlights);
  log(`  After collision resolution: ${highlights.length}`);

  // Enrich with playback metadata
  highlights = enrichAllHighlights(highlights, demoData, fileName, DEFAULT_CONFIG);

  return {
    file: fileName,
    map: demoData.header.mapName,
    tickRate: demoData.tickRate,
    highlights,
  };
}

/**
 * Create solo kill highlights from specified ticks
 */
function createSoloHighlights(demoData, soloTicks) {
  const highlights = [];
  const soloPriority = DEFAULT_CONFIG.priorities['solo'] || 1;

  for (const tick of soloTicks) {
    const kill = demoData.kills.find(k => k.tick === tick);
    if (!kill) {
      log(`  Warning: No kill found at tick ${tick}`);
      continue;
    }

    const points =
      (kill.headshot ? (DEFAULT_CONFIG.killPoints?.headshot || 2) : (DEFAULT_CONFIG.killPoints?.normal || 1)) +
      (kill.noscope ? (DEFAULT_CONFIG.killPoints?.noscope || 3) : 0);

    highlights.push({
      type: 'solo',
      priority: soloPriority,
      player: {
        name: kill.attacker.name,
        steamId: kill.attacker.steamId,
      },
      tick: kill.tick,
      kills: [kill],
      points,
    });
  }

  return highlights;
}

run()
  .then((result) => {
    parentPort.postMessage({ type: 'result', data: result });
  })
  .catch((error) => {
    parentPort.postMessage({ type: 'error', msg: error.message });
  });
