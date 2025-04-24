import { writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import chalk from 'chalk';

import Libraries from './libraries.js';

export default class HubRegistry {

  /**
   * @class
   * @param {string} registryPath Relative path to hub registry file.
   */
  constructor(registryPath = 'assets/hub-registry.json') {
    const dirname = path.dirname(fileURLToPath(import.meta.url));
    this.filePath = path.join(dirname, '..', ...registryPath.split('/'));

    this.data = {
      contentTypes: [],
    };
  }

  /**
   * Feed in data from the manifest and libraries.
   * @param {object} manifestData Manifest data.
   * @param {Libraries} libraries Libraries instance.
   */
  feed(manifestData, libraries) {
    this.data.contentTypes = manifestData.contentTypes.map((contentType) => {
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

      return contentType;
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
      console.warn(chalk.red(
        'Error: Unable to write to hub-registry.json. Please check permissions on the assets directory.'
      ));
    }
  }
}
