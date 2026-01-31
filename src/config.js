/**
 * @fileoverview Centralized configuration for CS:GO Highlights tool
 * 
 * All configuration constants, default values, and magic numbers are defined here.
 * This ensures consistency across the codebase and makes tuning easier.
 * 
 * Configuration Sections:
 * - RECORDING: Video capture settings (resolution, framerate, codec)
 * - ENCODING: FFmpeg encoding parameters (CRF, presets, bitrates)
 * - TIMING: Padding, durations, timeouts
 * - EFFECTS: Speedup, slowmo, visual effects
 * - DETECTION: Highlight detection thresholds
 * - SCORING: Kill points, priorities, multipliers
 * - WEAPONS: Weapon category lists
 * - AUDIO: Audio file extensions
 */

// =============================================================================
// DEFAULT PATHS
// =============================================================================

/**
 * Default file and folder paths for CLI commands
 */
export const PATHS = Object.freeze({
  output: './output',
  demos: './demos',
  highlights: './output/highlights.json',
  clips: './output/clips',
  clipsProcessed: './output/clips_processed',
  clipsFinal: './output/clips_final',
  highlightsFinal: './output/highlights_final.mp4',
  timestamps: './output/timestamps.txt',
  musicMapping: './output/music-mapping.json',
  // External tools (Windows default paths)
  hlae: 'C:\\Program Files (x86)\\HLAE\\hlae.exe',
  csgo: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Counter-Strike Global Offensive',
});

// =============================================================================
// HIGHLIGHT TYPES
// =============================================================================

/**
 * Highlight type identifiers
 * Using constants prevents typos and enables IDE autocomplete
 */
export const HIGHLIGHT_TYPES = Object.freeze({
  SOLO: 'solo',
  CLUTCH: 'clutch',
  KNIFE: 'knife',
  COLLATERAL: 'collateral',
  KILL_SERIES: 'kill-series',
  ONE_TAP: 'one-tap',
});

// =============================================================================
// RECORDING SETTINGS
// =============================================================================

/**
 * Default video recording settings (high quality 1080p)
 */
export const RECORDING = Object.freeze({
  width: 1920,
  height: 1080,
  framerate: 60,
  // FFmpeg encoding (high quality for raw clips)
  crf: 15,           // Lower = higher quality (0-51, 15 is very high)
  preset: 'slow',    // Slower = better compression (ultrafast, fast, medium, slow, veryslow)
});

// =============================================================================
// ENCODING SETTINGS
// =============================================================================

/**
 * FFmpeg encoding parameters for various operations
 */
export const ENCODING = Object.freeze({
  // CRF (Constant Rate Factor) - lower = higher quality, larger file
  crf: {
    recording: 15,      // Raw clips (highest quality)
    postprocess: 18,    // After effects (high quality)
    merge: 18,          // Final merge (high quality)
    min: 18,            // Compression minimum (power 1)
    max: 36,            // Compression maximum (power 10)
  },
  // Audio bitrates
  audioBitrate: {
    high: '320k',       // Recording
    medium: '192k',     // Merging
    low: '128k',        // Compression
  },
  // FFmpeg presets
  preset: {
    recording: 'slow',
    postprocess: 'medium',
    merge: 'medium',
  },
  // Compression defaults
  defaultCompressionPower: 4,  // Power 1-10 (5 = balanced)
});

// =============================================================================
// MERGE SETTINGS
// =============================================================================

/**
 * Video merge and transition settings
 */
export const MERGE = Object.freeze({
  // Crossfade transition between clips (xfade filter)
  transition: {
    enabled: true,            // Enable transitions by default
    duration: 0.5,            // Transition duration in seconds (0.3-1.0 recommended)
    type: 'fade',             // xfade transition type (fade, wipeleft, circleopen, etc.)
  },
});

// =============================================================================
// TIMING SETTINGS
// =============================================================================

/**
 * Time-related constants
 */
export const TIMING = Object.freeze({
  // Padding around highlights (seconds)
  padding: {
    before: 4,          // Seconds before highlight (shows approach/setup)
    after: 5,           // Seconds after highlight (shows aftermath)
  },
  // Round boundary handling
  roundEndBuffer: 2,    // Seconds after round end before cutting
  minimalPadding: 2,    // Minimal padding for edge cases
  // Overlay display
  overlay: {
    fadeIn: 0.5,        // Seconds to fade in
    display: 2.5,       // Seconds to display
    fadeOut: 0.5,       // Seconds to fade out
    total: 3.5,         // Total duration
  },
  // Music
  musicFadeDuration: 2, // Default music fade in/out
  // Timeouts
  recordingTimeout: 5 * 60 * 1000,  // 5 minutes max recording time
  // Tick rates
  defaultTickRate: 128,
  fallbackTickRate: 64,
  // Demo preload
  preloadSeconds: 10,   // Seconds to preload before highlight
});

// =============================================================================
// SPEEDUP SETTINGS
// =============================================================================

/**
 * Speed-up settings for clutches and kill-series
 * During long highlights, idle periods (no action) are sped up
 */
export const SPEEDUP = Object.freeze({
  defaultMultiplier: 3,     // Default speed multiplier (3x)
  startDelay: 2,            // Seconds after highlight start before speedup
  bufferAroundKills: 2,     // Seconds to keep normal speed around kills
  minGapDuration: 4,        // Minimum gap duration to trigger speedup
  actionGroupGap: 1,        // Seconds gap = separate action periods
});

// =============================================================================
// SLOWMO SETTINGS
// =============================================================================

/**
 * Slow motion settings for impressive kills
 * Applied on headshots/noscopes with visual effects
 */
export const SLOWMO = Object.freeze({
  defaultFactor: 0.6,       // Default slowmo factor (60% speed)
  duration: 1,              // Seconds for slowmo effect
  numSegments: 12,          // Segments for smooth transition
  // Audio tempo limits (FFmpeg atempo filter)
  minTempo: 0.5,            // Minimum supported atempo
  maxTempo: 2.0,            // Maximum supported atempo
});

// =============================================================================
// VISUAL EFFECTS
// =============================================================================

/**
 * Visual effect parameters for slowmo
 * Effects peak at kill moment and fade out
 */
export const VISUAL_EFFECTS = Object.freeze({
  contrast: 1.2,            // Peak contrast (1.0 = normal)
  brightness: 0.1,          // Peak brightness boost
  redBoost: 0.2,            // Warm/red shift in midtones
  saturation: 1.1,          // Peak saturation (1.0 = normal)
  // Fallback values (slightly different, used in some places)
  fallback: {
    brightness: 0.05,
    redBoost: 0.15,
  },
});

// =============================================================================
// MUSIC SETTINGS
// =============================================================================

/**
 * Background music overlay settings
 */
export const MUSIC = Object.freeze({
  defaultFolder: './music',
  defaultVolume: 0.6,       // Music volume (0-1)
  gameVolume: 1.0,          // Game audio volume (0-1)
  fadeDuration: 2,          // Fade in/out duration
  defaultMusicVolumePercent: 70,  // CLI default (percent)
});

// =============================================================================
// DETECTION SETTINGS
// =============================================================================

/**
 * Highlight detection thresholds
 */
export const DETECTION = Object.freeze({
  maxDelay: 15,             // Max seconds between kills for series
  minSeriesKills: 3,        // Minimum kills for regular series
  minEnemies: 2,            // Minimum enemies for clutch (1vX where X >= 2)
  aceKillCount: 5,          // Kills for ACE
  // Shot tracking
  maxShotAge: 15,           // Max seconds to track shots
  maxLookback: 3,           // Max seconds to look back for firstShotTick
  // One tap detection
  oneTap: {
    windowBefore: 2,        // Seconds before kill to check for other shots
    windowAfter: 1,         // Seconds after kill to check for other shots
  },
});

// =============================================================================
// SCORING & PRIORITIES
// =============================================================================

/**
 * Point values for different kill types
 * Higher points = more impressive kill
 */
export const KILL_POINTS = Object.freeze({
  pistol_body: 1,
  rifle_body: 2,
  sniper_body: 3,
  pistol_headshot: 4,
  rifle_headshot: 5,
  sniper_headshot: 6,
  sniper_noscope: 7,
  knife: 8,
  // One tap bonus points (added to headshot points)
  one_tap_bonus: 3,
});

/**
 * Priority levels for highlights (used for collision resolution)
 * Higher priority wins when highlights overlap in time
 */
export const PRIORITIES = Object.freeze({
  [HIGHLIGHT_TYPES.SOLO]: 1,
  [HIGHLIGHT_TYPES.ONE_TAP]: 1.5,    // Below clutch, above solo
  [HIGHLIGHT_TYPES.CLUTCH]: 2,
  [HIGHLIGHT_TYPES.KNIFE]: 3,
  [HIGHLIGHT_TYPES.COLLATERAL]: 4,
  [HIGHLIGHT_TYPES.KILL_SERIES]: 5,
});

// =============================================================================
// HIGHLIGHT RANKING (for top command)
// =============================================================================

/**
 * Scoring weights for ranking highlights by "impressiveness"
 * Used by the `top` command to select best highlights
 * 
 * Higher score = more spectacular/impressive highlight
 * Formula: Base + Type + KillCount + Intensity + Style + Weapon + Duration + Slowmo
 */
export const RANKING = Object.freeze({
  // Type bonus - some highlight types are inherently more impressive
  typeBonus: {
    'kill-series': 15,   // Fast multi-kills are most spectacular
    'collateral': 15,    // Multi-kill with one bullet
    'one-tap': 12,       // Precision shot
    'clutch': 5,         // Slow, less visually impressive
    'knife': 5,          // Risky but less skillful
    'solo': 0,           // Base case
  },
  
  // Kill count bonus - more kills = more impressive
  killCountBonus: {
    2: 0,
    3: 5,
    4: 15,
    5: 30,   // ACE
    6: 40,   // 6K+
  },
  
  // Intensity - faster kills are more exciting
  // Formula: max(0, intensityMaxBonus - killGapSum)
  intensityMaxBonus: 20,
  
  // Style bonuses - special achievements
  styleBonus: {
    perHeadshot: 3,          // Each headshot adds impact
    allHeadshotsInSeries: 5, // Clean execution bonus
    knifeInSeries: 10,       // Style points for knife in multi-kill
    allHeadshotsSpecial: 8,  // All HS with deagle/sniper
    noscopeHeadshot: 10,     // Legendary shot
    noscopeBody: 3,          // Still impressive
  },
  
  // Weapon skill bonus - harder weapons deserve extra credit
  weaponSkillBonus: {
    pistolHeadshot: 3,   // deagle, revolver headshots
    scoutHeadshot: 3,    // ssg08 headshots
  },
  
  // Clutch difficulty (reduced since clutches are slow)
  clutchDifficulty: {
    2: 0,
    3: 5,
    4: 10,
    5: 15,
  },
  
  // Duration bonus - shorter highlights are better for compilations
  // Formula: max(0, maxBonus - playbackDuration / divisor)
  durationBonus: {
    maxBonus: 10,
    divisor: 3,
  },
  
  // Slowmo presence indicates a dramatic moment
  slowmoBonus: 3,
});

/**
 * Clutch difficulty multiplier for point calculation
 * Points = enemies * CLUTCH_POINTS_MULTIPLIER
 */
export const CLUTCH_POINTS_MULTIPLIER = 10;

// =============================================================================
// WEAPON CATEGORIES
// =============================================================================

/**
 * Weapon category identifiers
 */
export const WEAPON_CATEGORIES = Object.freeze({
  PISTOL: 'pistol',
  RIFLE: 'rifle',
  SNIPER: 'sniper',
  SHOTGUN: 'shotgun',
  KNIFE: 'knife',
});

/**
 * Pistol weapon names
 */
export const PISTOL_WEAPONS = Object.freeze([
  'glock', 'usp_silencer', 'hkp2000', 'p250', 'tec9', 'fiveseven',
  'cz75a', 'deagle', 'revolver', 'elite',
]);

/**
 * Sniper weapon names
 */
export const SNIPER_WEAPONS = Object.freeze([
  'awp', 'ssg08', 'g3sg1', 'scar20',
]);

/**
 * Shotgun weapon names
 */
export const SHOTGUN_WEAPONS = Object.freeze([
  'nova', 'xm1014', 'mag7', 'sawedoff',
]);

/**
 * Weapons where headshot series (2+ kills) qualifies as highlight
 */
export const HEADSHOT_SERIES_WEAPONS = Object.freeze([
  ...SNIPER_WEAPONS,
  ...SHOTGUN_WEAPONS,
  'deagle',
  'revolver',
]);

/**
 * All knife weapon names (includes all skins)
 */
export const KNIFE_WEAPONS = Object.freeze([
  'knife',
  'knife_t',
  'knife_ct',
  'bayonet',
  'knife_flip',
  'knife_gut',
  'knife_karambit',
  'knife_m9_bayonet',
  'knife_tactical',
  'knife_falchion',
  'knife_survival_bowie',
  'knife_butterfly',
  'knife_push',
  'knife_cord',
  'knife_canis',
  'knife_ursus',
  'knife_gypsy_jackknife',
  'knife_outdoor',
  'knife_stiletto',
  'knife_widowmaker',
  'knife_skeleton',
]);

// =============================================================================
// AUDIO SETTINGS
// =============================================================================

/**
 * Supported audio file extensions
 */
export const AUDIO_EXTENSIONS = Object.freeze([
  '.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac',
]);

// =============================================================================
// DEFAULT CONFIG (Combined - for backward compatibility)
// =============================================================================

/**
 * Combined default configuration object
 * Used by CLI commands for backward compatibility
 */
export const DEFAULT_CONFIG = Object.freeze({
  padding: {
    before: TIMING.padding.before,
    after: TIMING.padding.after,
  },
  speedup: {
    startDelay: SPEEDUP.startDelay,
    bufferAroundKills: SPEEDUP.bufferAroundKills,
    minGapDuration: SPEEDUP.minGapDuration,
  },
  slowmo: {
    duration: SLOWMO.duration,
    contrast: VISUAL_EFFECTS.contrast,
    brightness: VISUAL_EFFECTS.brightness,
    redBoost: VISUAL_EFFECTS.redBoost,
    saturation: VISUAL_EFFECTS.saturation,
  },
  music: {
    folder: MUSIC.defaultFolder,
    volume: MUSIC.defaultVolume,
    gameVolume: MUSIC.gameVolume,
    fadeDuration: MUSIC.fadeDuration,
  },
  postprocess: {
    speedupMultiplier: SPEEDUP.defaultMultiplier,
    showOverlay: true,
    slowmoFactor: SLOWMO.defaultFactor,
  },
  detection: {
    maxDelay: DETECTION.maxDelay,
    minSeriesKills: DETECTION.minSeriesKills,
    minEnemies: DETECTION.minEnemies,
  },
  killPoints: { ...KILL_POINTS },
  priorities: {
    'solo': PRIORITIES[HIGHLIGHT_TYPES.SOLO],
    'one-tap': PRIORITIES[HIGHLIGHT_TYPES.ONE_TAP],
    'clutch': PRIORITIES[HIGHLIGHT_TYPES.CLUTCH],
    'knife': PRIORITIES[HIGHLIGHT_TYPES.KNIFE],
    'collateral': PRIORITIES[HIGHLIGHT_TYPES.COLLATERAL],
    'kill-series': PRIORITIES[HIGHLIGHT_TYPES.KILL_SERIES],
  },
});

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Deep merge two config objects
 * User config values override defaults
 * 
 * @param {Object} defaults - Default configuration
 * @param {Object} overrides - User overrides
 * @returns {Object} Merged configuration
 */
export function mergeConfig(defaults, overrides) {
  const result = { ...defaults };
  
  for (const key of Object.keys(overrides)) {
    if (
      overrides[key] !== null &&
      typeof overrides[key] === 'object' &&
      !Array.isArray(overrides[key]) &&
      defaults[key] !== null &&
      typeof defaults[key] === 'object'
    ) {
      result[key] = mergeConfig(defaults[key], overrides[key]);
    } else {
      result[key] = overrides[key];
    }
  }
  
  return result;
}

/**
 * Convert compression power (1-10) to CRF value (18-36)
 * 
 * @param {number} power - Compression power 1-10
 * @returns {number} CRF value
 */
export function powerToCrf(power) {
  const clamped = Math.max(1, Math.min(10, power));
  return ENCODING.crf.min + ((clamped - 1) / 9) * (ENCODING.crf.max - ENCODING.crf.min);
}
