import fs from 'fs';
import path from 'path';
import os from 'os';

const BINI_LOGO = 'ß';  // Your Bini.js logo
const BINI_VERSION = '9.1.5';

// Color definitions
const COLORS = {
  CYAN: '\x1b[36m',      // Cyan for header
  RESET: '\x1b[0m',      // Reset
  GREEN: '\x1b[32m'      // Green for checkmarks
};

/**
 * Detect which .env files exist in project root
 * Returns array of found .env files in load order
 */
export function detectEnvFiles(projectRoot = process.cwd()) {
  const nodeEnv = process.env.NODE_ENV || 'development';

  // Check in priority order (what Next.js loads)
  const envFiles = [
    '.env.local',                    // Always loaded first
    `.env.${nodeEnv}.local`,         // Environment-specific local
    `.env.${nodeEnv}`,               // Environment-specific
    '.env'                           // Base
  ];

  const found = [];

  for (const file of envFiles) {
    const filePath = path.join(projectRoot, file);
    if (fs.existsSync(filePath)) {
      found.push(file);
    }
  }

  return found;
}

/**
 * Format environment files for console display (Next.js style)
 * Shows: "✓ Environments: .env, .env.local"
 */
export function formatEnvFilesForDisplay(envFiles) {
  if (envFiles.length === 0) {
    return '';
  }

  const envString = envFiles.join(', ');
  return `${COLORS.GREEN}✓${COLORS.RESET} Environments: ${envString}`;
}

/**
 * Single function to show on server startup
 * Works for Vite, Production, or any server
 */
export function displayEnvFiles(projectRoot = process.cwd()) {
  const found = detectEnvFiles(projectRoot);
  const formatted = formatEnvFilesForDisplay(found);

  if (formatted) {
    console.log(`  ${formatted}`);
  }
}

/**
 * Bini.js startup display - ONLY shows Environments and Ready
 * Let Vite handle the Local/Network URLs
 */
export function displayBiniStartup(options = {}) {
  const {
    mode = 'dev' // 'dev', 'preview', or 'prod'
  } = options;

  const projectRoot = process.cwd();
  const found = detectEnvFiles(projectRoot);

  // Determine mode label
  let modeLabel = '';
  if (mode === 'preview') {
    modeLabel = '(preview)';
  } else if (mode === 'prod') {
    modeLabel = '(prod)';
  } else {
    modeLabel = '(dev)';
  }

  // Main header with colors
  console.log(`\n  ${COLORS.CYAN}${BINI_LOGO} Bini.js ${BINI_VERSION}${COLORS.RESET} ${modeLabel}`);

  // Show environments if found - Vite will show Local/Network URLs
  if (found.length > 0) {
    const envString = found.join(', ');
    console.log(`  ${COLORS.GREEN}✓${COLORS.RESET} Environments: ${envString}`);
  }

  // Status
  console.log(`  ${COLORS.GREEN}✓${COLORS.RESET} Ready\n`);
}

export default {
  detectEnvFiles,
  formatEnvFilesForDisplay,
  displayEnvFiles,
  displayBiniStartup
};