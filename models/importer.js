import crypto from 'crypto';
import {
  chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, renameSync, unlinkSync, writeFileSync
} from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import AdmZip from 'adm-zip';

import { removeDirectorySync } from '../services/fs-utils.js';
import { getLibraryFolderNames, readLibraryJson } from '../services/h5p-utils.js';
import { compareVersions, isNewerPatchVersion } from '../services/utils.js';

/** @constant {number} LIBRARY_FILE_PERMISSIONS File permissions for library files. */
export const LIBRARY_FILE_PERMISSIONS = 0o644; // rw-r--r--

/** @constant {number} LIBRARY_DIRECTORY_PERMISSIONS File permissions for library directories. */
export const LIBRARY_DIRECTORY_PERMISSIONS = 0o755; // rwxr-xr-x

/** @constant {number} TEMP_DIRECTORY_PERMISSIONS File permissions for temporary directories. */
export const TEMP_DIRECTORY_PERMISSIONS = 0o700; // rwx------

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
  mkdirSync(tempFolderPath, { mode: TEMP_DIRECTORY_PERMISSIONS });
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

  validateZipEntries(zip, extractTo);
  zip.extractAllTo(extractTo, true);

  setPermissions(extractTo);
};

/**
 * Validate ZIP archive entries for path traversal attacks.
 * @param {AdmZip} zip The AdmZip instance.
 * @param {string} extractTo The directory to extract to.
 * @throws {Error} If path traversal is detected.
 */
const validateZipEntries = (zip, extractTo) => {
  const extractToReal = path.resolve(extractTo);
  const entries = zip.getEntries();

  for (const entry of entries) {
    const entryPath = path.resolve(extractTo, entry.entryName);
    if (!entryPath.startsWith(extractToReal + path.sep) && entryPath !== extractToReal) {
      throw new Error(`Path traversal detected in ZIP: ${entry.entryName}`);
    }
  }
};

/**
 * Recursively set permissions for files and directories.
 * @param {string} itemPath Item path to set permissions for.
 */
const setPermissions = (itemPath) => {
  const stats = lstatSync(itemPath);

  if (stats.isSymbolicLink()) {
    throw new Error(`Symbolic link not allowed in extracted content: ${itemPath}`);
  }

  if (stats.isDirectory()) {
    chmodSync(itemPath, LIBRARY_DIRECTORY_PERMISSIONS);
    const items = readdirSync(itemPath);
    items.forEach((item) => {
      setPermissions(path.join(itemPath, item));
    });
  }
  else {
    chmodSync(itemPath, LIBRARY_FILE_PERMISSIONS);
  }
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
      path.join(librariesPath, newIdentity.folderName),
    );
  });
};

/**
 * Validate that a file path is within allowed directories.
 * @param {string} filePath The file path to validate.
 * @param {string} allowedDirectory The allowed base directory.
 * @throws {Error} If path traversal or invalid file is detected.
 */
const validateFilePath = (filePath, allowedDirectory) => {
  const resolvedPath = path.resolve(filePath);
  const resolvedAllowed = path.resolve(allowedDirectory);

  if (!resolvedPath.startsWith(resolvedAllowed + path.sep)) {
    throw new Error('File path is outside allowed directory');
  }

  const stats = lstatSync(resolvedPath);

  if (stats.isSymbolicLink()) {
    throw new Error('Symbolic links are not allowed');
  }

  if (!stats.isFile()) {
    throw new Error('Path does not point to a file');
  }
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
    if (typeof input !== 'string' && !(input instanceof Blob)) {
      return false;
    }

    let tempFolderPath;
    try {
      tempFolderPath = createTempFolder(this.tempPath);

      let zipFilePath;
      if (typeof input === 'string') {
        validateFilePath(input, this.tempPath);
        // Copy validated file to temp directory to prevent TOCTOU
        const copiedZipPath = path.join(tempFolderPath, 'uploaded.zip');
        copyFileSync(input, copiedZipPath);
        zipFilePath = copiedZipPath;
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
      if (tempFolderPath && existsSync(tempFolderPath)) {
        removeDirectorySync(tempFolderPath);
      }

      return false;
    }
  }
}
