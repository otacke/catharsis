import chalk from 'chalk';
import Manifest from '../models/manifest.js';

/** @constant {number} DEFAULT_TAB_SPACE Default tab space size for JSON output. */
const DEFAULT_TAB_SPACE = 2;

export default class ManifestCmd {

  /**
   * @class
   */
  constructor() {
    this.manifest = new Manifest();
  }

  /**
   * Lists all manifest entries or a particular value for a given machine name and path.
   * @param {string} machineName Machine name of the content type to be listed.
   * @param {string|null} [path] Optional path to a specific property in the content type entry.
   */
  list(machineName, path) {
    this.manifest.read();
    const item = this.manifest.getEntry(machineName, path);

    if (!item) {
      const errorMessage = path ?
        `No manifest entry found for ${machineName} at path ${path}.` :
        `No manifest entry found for ${machineName}.`;
      console.error(chalk.red(errorMessage));
      return;
    }

    const title = path ?
      `Manifest entry for ${machineName} at path ${path}:` :
      `Manifest entry for ${machineName}:`;
    console.log(chalk.blue(title));

    let value = JSON.stringify(item, null, DEFAULT_TAB_SPACE);
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1); // Remove string quotes for better readability
    }
    console.log(chalk.cyan(value));
  }

  /*
   * TODO: Implement edit functionality
   * Plain properties should be editable directly.
   * Screenshots, license, keywords and categories should be handled with special logic.
   * Values should be validated against a manifest schema.
   */
}
