import { writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import chalk from 'chalk';

import Libraries from './libraries.js';

export default class HubRegistry {

  /**
   * @class
   * @param {string} registryPath Relative path to hub registry file.
   * @param {boolean} amend Whether to amend existing data or start fresh.
   */
  constructor(registryPath = 'assets/hub-registry.json', amend = false) {
    const dirname = path.dirname(fileURLToPath(import.meta.url));
    this.filePath = path.join(dirname, '..', ...registryPath.split('/'));

    if (amend) {
      this.data = this.read();
    }
    else {
      this.data = {
        contentTypes: [],
      };
    }
  }

  /**
   * Read the hub-registry.json file.
   * @returns {object} The hub registry data object.
   */
  read() {
    let hubRegistryData;
    try {
      hubRegistryData = JSON.parse(readFileSync(this.filePath, 'utf8'));
    }
    catch (error) {
      hubRegistryData = { contentTypes: [] };
    }

    // TODO: Would be nice to validate the data here.

    return hubRegistryData;
  }

  /**
   * Feed in data from the manifest and libraries.
   * @param {object} manifestData Manifest data.
   * @param {Libraries} libraries Libraries instance.
   */
  feed(manifestData, libraries) {
    manifestData.contentTypes.forEach((contentType) => {
      const libraryJson = libraries.getLibraryJson(contentType.id);

      contentType.version = {
        major: libraryJson.majorVersion,
        minor: libraryJson.minorVersion,
        patch: libraryJson.patchVersion,
      };

      contentType.coreApiVersionNeeded = {
        major: libraryJson.coreApi?.majorVersion ?? 1,
        minor: libraryJson.coreApi?.minorVersion ?? 0,
      };

      /*
       * We could track the number of downloads (in H5PServer.handleGetContentType), but that's not the same as
       * the H5P integrations reporting the number of times a content type is actually used for creating content.
       */
      contentType.popularity = manifestData.contentTypes.length;

      // Not part of H5P Hub spec, but useful to have in manifest
      delete contentType.referToOrigin;
      delete contentType.origin;

      const existingIndex = this.data.contentTypes.findIndex((ct) => ct.id === contentType.id);
      if (existingIndex !== -1) {
        this.data.contentTypes[existingIndex] = contentType;
      }
      else {
        this.data.contentTypes.push(contentType);
      }
    });
  }

  /**
   * Write the hub registry to file.
   */
  write() {
    try {
      writeFileSync(this.filePath, JSON.stringify(this.data));
    }
    catch (error) {
      console.error(chalk.red(
        'Error: Unable to write to hub-registry.json. Please check permissions on the assets directory.',
      ));
    }
  }
}
