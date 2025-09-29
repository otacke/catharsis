import chalk from 'chalk';
import isURL from 'validator/lib/isURL.js';

import UpdateCmd from './update-cmd.js';
import AssetFiles from '../models/asset-files.js';
import Importer from '../models/importer.js';
import Libraries from '../models/libraries.js';
import Manifest from '../models/manifest.js';
import { cleanUpTempFiles } from '../services/fs-utils.js';
import { fetchContentTypeCache, fetchH5PContentType } from '../services/h5p-content-type-hub-utils.js';
import { compareVersions } from '../services/utils.js';
import { decomposeUberName } from '../services/h5p-utils.js';

export default class MirrorCmd {

  /**
   * @class
   */
  constructor() {
    this.libraries = new Libraries();
    this.importer = new Importer();
    this.assetFiles = new AssetFiles();
    this.manifest = new Manifest();
  }

  /**
   * Mirror content types from a remote URL. Does not automaticy update the Hub registry and exports!
   * @param {string} url URL to mirror content types from.
   * @param {boolean} referToOrigin If true, does not copy assets locally.
   * @returns {Promise<string[]>} List of uberNames of updated content types.
   */
  async mirror(url, referToOrigin = false) {
    this.libraries.update();

    if (!isURL(url)) {
      console.error(chalk.red('Invalid URL for mirroring'));
      return [];
    }

    console.log(chalk.blue(`Mirroring content types from ${url}`));
    const contentTypes = await this.fetchContentTypes(url, referToOrigin);
    if (!contentTypes) {
      return [];
    }

    let uberNamesUpdated = await Promise.all(contentTypes.map((item) => this.processContentType(item, url)));
    uberNamesUpdated = uberNamesUpdated.filter((contentType) => contentType !== undefined);

    const updateCmd = new UpdateCmd();
    // Does not automatically update the Hub registry and exports!
    updateCmd.updateManifest();

    console.log(chalk.blue('Done mirroring content types'));

    cleanUpTempFiles();

    return uberNamesUpdated;
  }

  /**
   * Fetch content types from the remote URL.
   * @param {string} url URL to fetch content types from.
   * @param {boolean} referToOrigin If true, does not copy assets locally.
   * @returns {Promise<object[]>} List of content types.
   */
  async fetchContentTypes(url, referToOrigin) {
    let contentTypes = await fetchContentTypeCache(url);
    if (typeof contentTypes === 'string') {
      console.error(chalk.red(contentTypes));
      return null;
    }

    contentTypes = contentTypes.map((item) => {
      if (referToOrigin) {
        item.referToOrigin = true;
      }
      item.origin = url;
      return item;
    });

    return contentTypes;
  }

  /**
   * Process a single content type.
   * @param {object} item Content type item.
   * @param {string} url URL to mirror content types from.
   * @returns {Promise<string|undefined>} Uber name of the updated content type or undefined if not updated.
   */
  async processContentType(item, url) {
    const remoteVersion = `${item.version.major}.${item.version.minor}.${item.version.patch}`;
    const localVersions = this.libraries
      .getList({ filter: { machineName: item.id } })
      .map((uberName) => {
        const { majorVersion, minorVersion, patchVersion } = decomposeUberName(uberName);
        return `${majorVersion}.${minorVersion}.${patchVersion}`;
      })
      .sort((a, b) => compareVersions(a, b));

    const remoteVersionIsOlder = localVersions.some((localVersion) => compareVersions(remoteVersion, localVersion) < 0);
    if (remoteVersionIsOlder) {
      const manifestEntry = this.manifest.getEntry(item.id);
      manifestEntry.referToOrigin = false;
      this.manifest.updateEntry(manifestEntry);
    }

    const remoteVersionIsNewer = localVersions.length === 0 ||
      localVersions.every((localVersion) => compareVersions(remoteVersion, localVersion) > 0);
    if (!remoteVersionIsNewer) {
      await this.updateLocalMetadata(item);
      return;
    }

    const importWasSuccessful = await this.importContentType(item.id, url);
    if (importWasSuccessful) {
      await this.updateLocalMetadata(item);
      return `${item.id} ${remoteVersion}`;
    }
  }

  /**
   * Import a content type from the remote URL.
   * @param {string} machineName Machine name of the content type.
   * @param {string} url URL to mirror content types from.
   * @returns {Promise<boolean>} True if import was successful, false otherwise.
   */
  async importContentType(machineName, url) {
    const contentTypeURL = url.endsWith('/') ? `${url}${machineName}` : `${url}/${machineName}`;

    const blob = await fetchH5PContentType(contentTypeURL);
    if (typeof blob === 'string') {
      console.error(chalk.red(blob));
      return false;
    }

    return await this.importer.import(blob);
  }

  /**
   * Update local metadata for the content type.
   * @param {object} item Content type item.
   * @returns {Promise<void>}
   */
  async updateLocalMetadata(item) {
    this.libraries.update();

    if (!item.referToOrigin) {
      this.updateIconURL(item);
      await this.updateScreenshots(item);
    }

    this.manifest.updateEntry(item);
  }

  /**
   * Update the icon URL for the content type.
   * @param {object} item Entry in manifest.json.
   */
  updateIconURL(item) {
    const localIconURL = this.libraries.getIconURL(item.id);
    if (localIconURL) {
      item.icon = localIconURL;
    }
  }

  /**
   * Update the screenshots for the content type.
   * @param {object} item Entry in manifest.json.
   */
  async updateScreenshots(item) {
    if (!Array.isArray(item.screenshots)) {
      return;
    }

    item.screenshots = await Promise.all(
      item.screenshots.map((screenshot, index) => this.updateScreenshotURL(screenshot, item.id, index)),
    );
  }

  /**
   * Update the screenshot URL for the content type.
   * @param {object} screenshot Screenshot object.
   * @param {string} machineName Machine name of the content type.
   * @param {number} index Index of the screenshot.
   * @returns {Promise<object>} Updated screenshot object.
   */
  async updateScreenshotURL(screenshot, machineName, index) {
    const localName = `${machineName}-screenshot-${index}`;
    const localURL = await this.assetFiles.addFromURL(screenshot.url, localName);
    if (localURL) {
      screenshot.url = localURL;
    }

    return screenshot;
  }
}
