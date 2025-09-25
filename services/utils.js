import { existsSync, readFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Create a UUID.
 * @returns {string} The generated UUID.
 */
export const createUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    // eslint-disable-next-line no-magic-numbers
    const r = Math.random() * 16 | 0;
    // eslint-disable-next-line no-magic-numbers
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    // eslint-disable-next-line no-magic-numbers
    return v.toString(16);
  });
};

/**
 * Compare two semantic version strings.
 * @param {string} v1 The first version string.
 * @param {string} v2 The second version string.
 * @returns {number} 1 if v1 > v2, -1 if v1 < v2, 0 if v1 === v2.
 */
export const compareVersions = (v1, v2) => {
  const v1Parts = v1.split('.').map(Number);
  const v2Parts = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
    const part1 = v1Parts[i] || 0;
    const part2 = v2Parts[i] || 0;

    if (part1 > part2) {
      return 1;
    }
    if (part1 < part2) {
      return -1;
    }
  }

  return 0;
};

/**
 * Check if canditate is a newer patch version than old.
 * @param {string} old The old version string.
 * @param {string} candidate The candidate version string.
 * @returns {boolean} True if candidate is a newer patch version than old, false otherwise.
 */
export const isNewerPatchVersion = (old, candidate) => {
  const oldParts = old.split('.').map(Number);
  const candidateParts = candidate.split('.').map(Number);

  if (candidateParts[0] !== oldParts[0] || candidateParts[1] !== oldParts[1]) {
    return false;
  }

  return candidateParts[2] > oldParts[2];
};

/**
 * Check if a string is a valid UUID.
 * @param {string} uuid The UUID to validate.
 * @returns {boolean} True if the UUID is valid, false otherwise.
 */
export const isValidUUID = (uuid) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

/**
 * Get the local IP address of the machine.
 * @returns {string} The local IP address or hostname.
 */
export const getLocalIPAddress = () => {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }

  return 'localhost'; // Fallback to localhost if no external IP is found
};

/**
 * Load configuration from file or return defaults
 * @param {object} defaults Default configuration values
 * @param {number} defaults.port Default port to use
 * @param {string} defaults.pidFile Default PID file path
 * @param {string} [configFileName] Name of the config file
 * @returns {object} Configuration object with defaults applied
 */
export const loadConfig = (defaults = {
  protocol: 'https',
  hostname: 'localhost',
  port: 8080,
  pidFile: '.server.pid',
  updateLockFile: '.update.lock',
  detached: false,
  mirrors: [],
}, configFileName = '.catharsis-config.json') => {
  const currentFilePath = fileURLToPath(import.meta.url);
  const projectRoot = path.resolve(path.dirname(currentFilePath), '..');

  const configPath = path.join(projectRoot, configFileName);

  let config = { ...defaults };

  try {
    if (existsSync(configPath)) {
      const loadedConfig = JSON.parse(readFileSync(configPath, 'utf8'));

      if (loadedConfig.protocol && typeof loadedConfig.protocol === 'string') {
        config.protocol = loadedConfig.protocol;
      }

      if (loadedConfig.hostname && typeof loadedConfig.hostname === 'string') {
        config.hostname = loadedConfig.hostname;
      }

      if (loadedConfig.domain && typeof loadedConfig.domain === 'string') {
        config.domain = loadedConfig.domain;
      }

      if (loadedConfig.listen && typeof loadedConfig.listen === 'string') {
        config.listen = loadedConfig.listen;
      }

      if (loadedConfig.port && Number.isInteger(loadedConfig.port)) {
        config.port = loadedConfig.port;
      }

      if (loadedConfig.pidFile && typeof loadedConfig.pidFile === 'string') {
        config.pidFile = loadedConfig.pidFile;
      }

      if (loadedConfig.updateLockFile && typeof loadedConfig.updateLockFile === 'string') {
        config.updateLockFile = loadedConfig.updateLockFile;
      }

      if (typeof loadedConfig.detached === 'boolean') {
        config.detached = loadedConfig.detached;
      }

      if (Array.isArray(loadedConfig.mirrors)) {
        const mirrorItemsAreOK = loadedConfig.mirrors.every((item) => {
          return (
            typeof item === 'object' &&
            item.hasOwnProperty('url') &&
            typeof item.url === 'string' &&
            item.hasOwnProperty('cron') &&
            typeof item.timeout === 'string'
          );
        });

        if (mirrorItemsAreOK) {
          config.mirrors = loadedConfig.mirrors;
        }
      }

      Object.entries(loadedConfig).forEach(([key, value]) => {
        if (key !== 'port' && key !== 'pidFile' && value !== undefined) {
          config[key] = value;
        }
      });
    }
  }
  catch (error) {
    console.error(`Error loading configuration file: ${error.message}`);
  }

  return config;
};
