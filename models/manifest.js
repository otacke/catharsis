import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import chalk from 'chalk';

import { decomposeUberName } from '../services/h5p-utils.js';
import { loadConfig } from '../services/utils.js';

/** @constant {number} JSON_INDENTATION Intentation for json file. */
const JSON_INDENTATION = 2;

/**
 * @constant {string[]} WANTED_MANIFEST_PROPERTIES Properties that are wanted for manifest.
 * version and coreApiVersionNeeded will be fetched from library.json directly.
 * createdAt and updatedAt could be fetched, but should match what a mirror may have supplied.
 */
const WANTED_MANIFEST_PROPERTIES = [
  'id',
  'title',
  'summary',
  'description',
  'icon',
  'createdAt',
  'updatedAt',
  'isRecommended',
  'popularity',
  'screenshots',
  'license',
  'owner',
  'example',
  'tutorial',
  'keywords',
  'categories'
];

/**
 * Sanitize the manifest data.
 * @param {object} manifestData The manifest data object.
 * @returns {object} The sanitized manifest data object.
 */
const sanitize = (manifestData = {}) => {
  manifestData.contentTypes = manifestData.contentTypes || [];

  manifestData = removeInvalidEntries(manifestData);
  manifestData = removeUnwantedProperties(manifestData);
  manifestData = setFallbackValues(manifestData);

  return manifestData;
};

/**
 * Remove invalid entries from manifest data.
 * @param {object} manifestData The manifest data object.
 * @returns {object} The manifest data object with invalid entries removed.
 */
const removeInvalidEntries = (manifestData = {}) => {
  manifestData.contentTypes = (manifestData.contentTypes ?? []).filter((contentType) => !!contentType.id);
  return manifestData;
};

/**
 * Remove unwanted properties from manifest data.
 * @param {object} manifestData The manifest data object.
 * @returns {object} The manifest data object with unwanted properties removed.
 */
const removeUnwantedProperties = (manifestData = {}) => {
  manifestData.contentTypes = (manifestData.contentTypes ?? []).map((contentType) => {
    Object.keys(contentType).forEach((key) => {
      if (!WANTED_MANIFEST_PROPERTIES.includes(key)) {
        delete contentType[key];
      }
    });

    return contentType;
  });

  return manifestData;
};

/**
 * Set fallback values for missing properties in manifest data.
 * @param {object} manifestData The manifest data object.
 * @returns {object} The manifest data object with fallback values set.
 */
const setFallbackValues = (manifestData = {}) => {
  manifestData.contentTypes = (manifestData.contentTypes ?? []).map((contentType) => {
    contentType.title ??= '';
    contentType.isRecommended ??= false;
    contentType.screenshots ??= [];
    contentType.categories ??= ['Other'];
    contentType.summary ??= '';
    contentType.description ??= '';
    contentType.owner ??= 'Unknown';
    contentType.example ??= '';
    contentType.tutorial ??= '';
    contentType.keywords ??= [];
    contentType.license ??= { id: 'U' };

    const licenseAttributes = setLicenseAttributes(contentType.license.id);
    if (licenseAttributes) {
      contentType.license.attributes = licenseAttributes;
    }

    return contentType;
  });

  return manifestData;
};

/**
 * Set license attributes based on license ID.
 * @param {string} licenseId The license ID.
 * @returns {object|null} The license attributes or null if not found.
 */
const setLicenseAttributes = (licenseId) => {
  // TODO: Complete for other licenses (not used so far)
  if (licenseId === 'MIT') {
    return {
      useCommercially: true,
      modifiable: true,
      distributable: true,
      sublicensable: true,
      canHoldLiable: false,
      mustIncludeCopyright: true,
      mustIncludeLicense: true
    };
  }
  else if (licenseId === 'U') {
    return {
      useCommercially: false,
      modifiable: false,
      distributable: false,
      sublicensable: false,
      canHoldLiable: false,
      mustIncludeCopyright: true,
      mustIncludeLicense: true,
    };
  }

  return null;
};

export default class Manifest {

  /**
   * @class
   * @param {string} manifestPath Relative path to manifest.json file.
   */
  constructor(manifestPath = 'assets/manifest.json') {
    const dirname = path.dirname(fileURLToPath(import.meta.url));
    this.filePath = path.join(dirname, '..', ...manifestPath.split('/'));

    this.config = loadConfig();

    this.data = this.read();
  }

  /**
   * Read the manifest.json file.
   * @returns {object} The manifest data object.
   */
  read() {
    let manifestData;
    try {
      manifestData = JSON.parse(readFileSync(this.filePath, 'utf8'));
    }
    catch (error) {
      manifestData = { contentTypes: [] };
    }

    manifestData = sanitize(manifestData);

    return manifestData;
  }

  /**
   * Get the manifest data object.
   * @returns {object} The manifest data object.
   */
  getData() {
    return this.data;
  }

  /**
   * Write the manifest.json file.
   */
  write() {
    this.data = sanitize(this.data);
    try {
      writeFileSync(this.filePath, JSON.stringify(this.data, null, JSON_INDENTATION));
    }
    catch (error) {
      console.log(chalk.red(
        'Error: Unable to write to manifest.json. Please check permissions on the assets directory.'
      ));
    }
  }

  /**
   * Remove machine names that are not served anymore and add new machine names that should be served.
   * @param {string[]} machineNamesOfContentTypes Machine names of content types that should be served.
   */
  syncMachineNames(machineNamesOfContentTypes) {
    const machineNamesInManifest = this.data.contentTypes.map((contentType) => contentType.id);

    this.data.contentTypes = this.data.contentTypes.filter((contentType) =>
      machineNamesOfContentTypes.includes(contentType.id)
    );

    machineNamesOfContentTypes.forEach((machineName) => {
      if (!machineNamesInManifest.includes(machineName)) {
        this.data.contentTypes.push({ id: machineName });
      }
    });
  }

  /**
   * Retrieve the content type entry from manifest.json.
   * @param {string} machineName Machine name of the content type to be retrieved.
   * @returns {object|undefined} Content type entry if found, undefined otherwise.
   */
  getEntry(machineName) {
    return this.data.contentTypes.find((entry) => entry.id === machineName);
  }

  /**
   * Remove entry from manifest.json. It's important to remove assets separately!
   * @param {string} uberName Uber name of the content type to be removed.
   */
  removeEntry(uberName) {
    const { machineName, majorVersion, minorVersion } = decomposeUberName(uberName);

    const entry = this.data.contentTypes.find((entry) => {
      return entry.id === machineName &&
        entry.version?.major?.toString() === majorVersion &&
        entry.version?.minor?.toString() === minorVersion;
    });

    if (!entry) {
      return;
    }

    this.data.contentTypes = this.data.contentTypes.filter((contentType) => contentType.id !== machineName);

    this.write();
  }

  updateEntry(newData) {
    if (typeof newData !== 'object') {
      return;
    }

    const entryIndex = this.data.contentTypes.findIndex((entry) => entry.id === newData.id);
    if (entryIndex !== -1) {
      Object.keys(newData).forEach((key) => {
        if (newData[key] === '' || newData[key] === null || newData[key] === undefined) {
          delete newData[key];
        }
      });

      this.data.contentTypes[entryIndex] = { ...this.data.contentTypes[entryIndex], ...newData };
    }
    else {
      this.data.contentTypes.push(newData);
    }

    this.write();
  }

  updateFromLibraries(libraries) {
    const machineNames = this.getMachineNames();
    const libraryJsons = libraries.getLibraryJsons(machineNames);

    this.data.contentTypes = this.data.contentTypes.map((contentType) => {
      const libraryJson = libraryJsons.find((libraryJson) => libraryJson.machineName === contentType.id);

      if (!libraryJson) {
        return contentType;
      }

      /*
       * Not storing data that can be derived from library.json, e.g. version numbers.
       * Those are put into the hub registry later.
       */
      contentType.title = (contentType.title || libraryJson.title) ?? '';

      const fileDate = libraries.getFileDate(contentType.id);
      contentType.createdAt = contentType.createdAt || fileDate;
      contentType.updatedAt = fileDate;

      const localIconURL = libraries.getIconURL(libraryJson.machineName) ?? '';
      contentType.icon = (localIconURL) ? localIconURL : contentType.icon ?? '';

      if (!contentType.license && libraryJson.license) {
        const licenseId = libraryJson.license;
        contentType.license = { id: licenseId };
      }

      contentType.owner = contentType.owner || libraryJson.author;
      if (contentType.owner === 'Joubel') {
        contentType.owner = 'H5P Group'; // H5P Group didn't update library.json files
      }

      return contentType;
    });
  }

  getMachineNames() {
    return this.data.contentTypes.map((contentType) => contentType.id);
  }
}
