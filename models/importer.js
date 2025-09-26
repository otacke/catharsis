import crypto from 'crypto';
import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import AdmZip from 'adm-zip';

import { removeDirectorySync } from '../services/fs-utils.js';
import { getLibraryFolderNames, readLibraryJson } from '../services/h5p-utils.js';
import { compareVersions, createUUID, isNewerPatchVersion } from '../services/utils.js';

/**
 * Create identity mapping for a library including machine name, folder name and version.
 * @param {string} folderPath Folder path to create identity mapping for.
 * @returns {object} Identity mapping object with machine name as key and version and folder name as value.
 */
const getIdentityMapping = (folderPath) => {
  const identityMapping = [];

  const libraryFolders = getLibraryFolderNames(folderPath);

  libraryFolders.forEach((folderName) => {
    const libraryJson = readLibraryJson(folderPath, folderName);

    identityMapping.push({
      machineName: libraryJson.machineName,
      folderName: folderName,
      version: `${libraryJson.majorVersion}.${libraryJson.minorVersion}.${libraryJson.patchVersion}`,
    });
  });

  return identityMapping;
};

/**
 * Create a temporary folder with a unique name.
 * @param {string} basePath The base path where the temporary folder will be created.
 * @returns {string} The path of the created temporary folder.
 */
const createTempFolder = (basePath) => {
  const tempFolderName = `temp-${crypto.randomUUID()}`;
  const tempFolderPath = path.join(basePath, tempFolderName);
  mkdirSync(tempFolderPath);
  return tempFolderPath;
};

/**
 * Write a Blob to a file.
 * @param {Blob} blob The Blob to write.
 * @param {Promise<string>} filePath The path of the file to write to.
 */
const writeBlobToFile = async (blob, filePath) => {
  const arrayBuffer = await blob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  writeFileSync(filePath, buffer);
};

/**
 * Extract a ZIP file to a specified directory.
 * @param {string} zipFilePath The path of the ZIP file to extract.
 * @param {string} extractTo The directory to extract the contents to.
 */
const extractZip = (zipFilePath, extractTo) => {
  const zip = new AdmZip(zipFilePath);
  zip.extractAllTo(extractTo, true);
};

/**
 * Update libraries in the local library path based on the new identity mapping.
 * @param {string} tempFolderPath The path of the temporary folder containing the new libraries.
 * @param {string} librariesPath The path of the local libraries.
 * @param {object} newIdentityMapping The new identity mapping of libraries.
 * @param {object} localIdentityMapping The local identity mapping of libraries.
 */
const updateLibraries = (tempFolderPath, librariesPath, newIdentityMapping, localIdentityMapping) => {
  newIdentityMapping.forEach((newIdentity) => {
    const newVersion = newIdentity.version;
    const newVersionMinor = `${newVersion.split('.')[0]}.${newVersion.split('.')[1]}`;

    const localIdentity = localIdentityMapping.find((item) => {
      return item.machineName === newIdentity.machineName && item.version.startsWith(newVersionMinor);
    });

    if (localIdentity) {
      const localVersion = localIdentity.version;
      if (compareVersions(newVersion, localVersion) === 0) {
        return; // Versions are the same, skip
      }

      if (isNewerPatchVersion(localVersion, newVersion)) {
        removeDirectorySync(path.join(librariesPath, localIdentity.folderName));
      }
    }

    const existingLibraryPath = path.join(librariesPath, newIdentity.folderName);
    if (existsSync(existingLibraryPath)) {
      removeDirectorySync(existingLibraryPath);
    }

    renameSync(
      path.join(tempFolderPath, newIdentity.folderName),
      path.join(librariesPath, newIdentity.folderName)
    );
  });
};

export default class Importer {
  /**
   * Importer class to handle importing H5P content types.
   * @param {string} tempPath - Path to the temporary folder for extraction.
   * @param {string} libraryPath - Path to the local libraries.
   */
  constructor(tempPath = 'assets/temp', libraryPath = 'assets/libraries') {
    const dirname = path.dirname(fileURLToPath(import.meta.url));
    this.tempPath = path.join(dirname, '..', ...tempPath.split('/'));
    this.librariesPath = path.join(dirname, '..', ...libraryPath.split('/'));
  }

  /**
   * Import a Blob containing H5P content type and update the local libraries.
   * @param {Blob|string} input The Blob containing the H5P content type.
   * @returns {Promise<boolean>} True if the import was successful, false otherwise.
   */
  async import(input) {
    if (typeof input !== 'string' && !input instanceof Blob) {
      return false;
    }

    try {
      const tempFolderPath = createTempFolder(this.tempPath);

      let zipFilePath;
      if (typeof input === 'string') {
        zipFilePath = path.resolve(input);

      }
      else {
        zipFilePath = path.join(tempFolderPath, 'temp.zip');
        await writeBlobToFile(input, zipFilePath);
      }

      extractZip(zipFilePath, tempFolderPath);

      if (typeof input !== 'string') {
        unlinkSync(zipFilePath);
      }

      const newIdentityMapping = getIdentityMapping(tempFolderPath);
      const localIdentityMapping = getIdentityMapping(this.librariesPath);

      updateLibraries(tempFolderPath, this.librariesPath, newIdentityMapping, localIdentityMapping);

      removeDirectorySync(tempFolderPath);
      return true;
    }
    catch (error) {
      console.log(error);

      return false;
    }
  }
}
