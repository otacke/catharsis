import chalk from 'chalk';

import UpdateCmd from './update-cmd.js';
import AssetFiles from '../models/asset-files.js';
import Importer from '../models/importer.js';
import Libraries from '../models/libraries.js';
import Manifest from '../models/manifest.js';

import { decomposeUberName } from '../services/h5p-utils.js';

export default class LibrariesCmd {

  /**
   * @class
   */
  constructor() {
    this.libraries = new Libraries();
  }

  /**
   * List all libraries in the libraries folder.
   * @param {object} options Options for filtering the list.
   * @param {boolean} options.runnableOnly If true, only include runnable libraries.
   * @param {object} options.filter Filter options.
   * @param {string} options.filter.machineName Machine name to filter by.
   */
  list(options = {}) {
    const list = this.libraries.getList(options);
    if (list.length === 0) {
      console.log(chalk.yellow('No libraries found'));
      return;
    }

    list.forEach((listItem) => {
      console.log(chalk.yellow(listItem));
    });
  }

  /**
   * Add a library to the libraries folder.
   * @param {string} zipFileName Name of the zip file to import.
   */
  async add(zipFileName) {
    const importer = new Importer();
    const importWasSuccessful = await importer.import(zipFileName);
    if (!importWasSuccessful) {
      console.log(chalk.red('Import failed'));
      return;
    }

    const updateCmd = new UpdateCmd();
    // Does not automatically update the Hub registry and exports!
    updateCmd.updateManifest();
  }

  /**
   * Removes a library from the libraries folder.
   * @param {string} uberName Uber name of the library to remove.
   */
  async remove(uberName) {
    const { machineName, majorVersion, minorVersion } = decomposeUberName(uberName);

    let relevantFolders = this.libraries.getLibraryFolderNames();
    if (majorVersion && minorVersion) {
      relevantFolders = relevantFolders
        .filter((folderName) => folderName.startsWith(`${machineName}-${majorVersion}.${minorVersion}`));
    }
    else {
      relevantFolders = relevantFolders
        .filter((folderName) => folderName.startsWith(`${machineName}-`));
    }

    let list = this.libraries.getList({ filter: { machineName } });

    if (relevantFolders.length > 1) {
      const listString = `${list.map((item) => `- ${item}`).join('\n')}`;

      console.log(chalk.red(
        `There are multiple library folders for ${machineName}:`
      ));
      console.log(chalk.red(listString));
      console.log(chalk.red('Please specify the major.minor version to remove.'));
      return;
    }
    else if (relevantFolders.length === 0) {
      const message = [`No library folder found for ${uberName}.`];
      if (!machineName.startsWith('H5P.')) {
        message.push(`Did you mean H5P.${uberName}?`);
      }

      console.log(chalk.red(message.join(' ')));
      return;
    }

    this.libraries.remove(relevantFolders[0]);
    console.log(chalk.blue('Library folder removed'));

    const latestLibraryJson = this.libraries.getLibraryJson(machineName);
    if (!latestLibraryJson) {
      const manifest = new Manifest();
      manifest.removeEntry(uberName);
    }

    const latestFolderPath = this.libraries.getFolderPath(uberName);
    if (!latestFolderPath) {
      const assetFiles = new AssetFiles();
      assetFiles.remove(uberName);
    }

    const updateCmd = new UpdateCmd();
    // Does not automatically update the Hub registry and exports!
    updateCmd.updateManifest();
  }

  listDependencies(uberName) {
    console.log(chalk.blue(`Dependencies for ${uberName}:`));

    const dependencies = this.libraries
      .getDependencies(uberName)
      .filter((dependency) => dependency !== uberName);

    console.log(chalk.cyan(dependencies.map((dependency) => `- ${dependency}`).join('\n')));
    console.log('');

    return dependencies;
  }

  listTotalDependencies(uberName, ignore = []) {
    if (ignore.includes(uberName)) {
      return;
    }

    ignore.push(uberName);

    const dependencies = this.listDependencies(uberName);
    dependencies.forEach((dependency) => {
      this.listTotalDependencies(dependency, ignore);
    });
  }
}
