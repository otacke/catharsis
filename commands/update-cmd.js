import { existsSync, writeFileSync, unlinkSync } from 'fs';

import chalk from 'chalk';

import Exporter from '../models/exporter.js';
import HubRegistry from '../models/hub-registry.js';
import Libraries from '../models/libraries.js';
import Manifest from '../models/manifest.js';
import { decomposeUberName } from '../services/h5p-utils.js';
import { loadConfig } from '../services/utils.js';

/**
 * Update the served data that users can access.
 * @param {string[]} uberNamesToUpdate Explicit list of uber names to update only.
 */
const updateServedData = async (uberNamesToUpdate) => {
  const config = loadConfig();

  if (existsSync(config.updateLockFile)) {
    console.warn(chalk.red('Update of server data already in progress. Skipping!'));
    return;
  }

  writeFileSync(config.updateLockFile, 'updating');

  updateHubRegistry(uberNamesToUpdate);
  await updateExports(uberNamesToUpdate);

  if (existsSync(config.updateLockFile)) {
    unlinkSync(config.updateLockFile);
  }
};

/**
 * Update the Hub registry from manifest and libraries.
 * @param {string[]} uberNamesToUpdate Explicit list of uber names to update only.
 */
const updateHubRegistry = (uberNamesToUpdate = []) => {
  console.warn(chalk.yellow('Updating hub registry ...'));

  const manifest = new Manifest();
  const libraries = new Libraries();

  const hubRegistry = new HubRegistry();

  const manifestData = manifest.getData();

  // Limit update to content types set in uberNamesToUpdate
  if (uberNamesToUpdate.length > 0) {
    const machineNames = uberNamesToUpdate.map((uberName) => decomposeUberName(uberName).machineName);

    manifestData.contentTypes = manifestData.contentTypes.filter((contentType) => {
      return machineNames.includes(contentType.id);
    });
  }

  hubRegistry.feed(manifestData, libraries);
  hubRegistry.write();

  console.warn(chalk.yellow('Done updating hub registry'));
};

/**
 * Update export files for content types.
 * @param {string[]} uberNamesToUpdate Explicit list of machine names to update only.
 * @returns {Promise<void>}
 */
const updateExports = async (uberNamesToUpdate = []) => {
  console.warn(chalk.yellow('Updating export files ...'));

  const manifest = new Manifest();
  const libraries = new Libraries();

  const exporter = new Exporter();
  if (uberNamesToUpdate.length === 0) {
    exporter.clearExport();
  }

  const machineNames = (uberNamesToUpdate.length > 0) ?
    uberNamesToUpdate.map((uberName) => decomposeUberName(uberName).machineName) :
    manifest.getMachineNames();

  await Promise.all(
    machineNames.map((machineName) => exporter.createExport(machineName, libraries))
  );

  console.warn(chalk.yellow('Done updating export files'));
};

export default class UpdateCmd {
  /**
   * @class
   */
  constructor() {
  }

  /**
   * Update the manifest, Hub registry and export files.
   */
  async updateReleases() {
    this.updateManifest();

    await updateServedData();
  }

  /**
   * Update the manifest file from libraries.
   */
  updateManifest() {
    console.warn(chalk.yellow('Updating manifest ...'));

    const manifest = new Manifest();
    const libraries = new Libraries();

    manifest.syncMachineNames(libraries.getMachineNamesOfContentTypes());
    manifest.updateFromLibraries(libraries);
    manifest.write();

    console.warn(chalk.yellow('Done updating manifest'));
  }
}
