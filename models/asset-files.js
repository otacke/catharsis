
import crypto from 'crypto';
import { readdirSync, unlinkSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import chalk from 'chalk';

import { decomposeUberName } from '../services/h5p-utils.js';
import { loadConfig } from '../services/utils.js';

const MIME_TYPES_TO_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg',
  'video/ogg': 'ogv',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'application/x-zip-compressed': 'zip',
  'application/x-zip': 'zip',
};

/**
 * Get the file extension from a URL or MIME type.
 * @param {string} url The URL to extract the extension from.
 * @param {string} [mimeType] The MIME type to use if the URL does not have an extension.
 * @returns {string} The file extension.
 */
const getExtensionFromURL = (url, mimeType) => {
  const urlNameParts = url.split('/').pop().split('?')[0].split('#')[0].split('.');

  let extension;
  if (urlNameParts.length > 1) {
    extension = urlNameParts.pop();
  }
  else if (mimeType) {
    extension = MIME_TYPES_TO_EXTENSIONS[mimeType];

    if (!extension) {
      extension = mimeType.split('/')[1];
    }
  }
  else {
    extension = '';
  }

  return extension;
};

export default class AssetFiles {

  /**
   * @class
   * @param {string} filesPath Relative path to files directory.
   */
  constructor(filesPath = 'assets/files') {
    this.filesPath = filesPath;
    const dirname = path.dirname(fileURLToPath(import.meta.url));
    this.basepath = path.join(dirname, '..', ...filesPath.split('/'));

    this.config = loadConfig();
  }

  /**
   * Add file from URL to files directory.
   * @param {string} url URL of file to be added.
   * @param {string} [name] Name of file to be saved. If not provided, random UUID will be used.
   * @returns {Promise<string|undefined>} Name of file saved in files directory or undefined if file could not be added.
   */
  async addFromURL(url, name = crypto.randomUUID()) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.log(chalk.red('Error: Unable to fetch file from URL'));
        return;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const extension = getExtensionFromURL(url, response.headers.get('content-type'));
      if (extension) {
        name = `${name}.${extension}`;
      }

      writeFileSync(path.join(this.basepath, name), buffer);

      const base = `${this.config.protocol}://${this.config.domain ?? this.config.hostname}`;
      const fileURL = `${base}/files/${name}`;

      return fileURL;
    }
    catch (error) {
      console.log(chalk.red('Error: Unable to add file from URL', error));
      return;
    }
  }

  /**
   * Remove all files related to a specific machine name.
   * @param {string} uberName Uber name of the files to be removed.
   */
  remove(uberName) {
    const { machineName } = decomposeUberName(uberName);

    const files = readdirSync(this.basepath);
    const relevantFiles = files.filter((fileName) => fileName.startsWith(`${machineName}-`));
    relevantFiles.forEach((fileName) => {
      unlinkSync(path.join(this.basepath, fileName));
    });
  }
}
