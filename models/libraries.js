import { readFileSync, statSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { removeDirectorySync } from '../services/fs-utils.js';
import {
  decomposeLibraryFileName, decomposeUberName, findH5PDependenciesInSemantics, getLibraryFolderNames, readLibraryJson
} from '../services/h5p-utils.js';
import { compareVersions, loadConfig } from '../services/utils.js';

export default class Libraries {

  /**
   * @class
   * @param {string} librariesPath Relative path to libraries directory.
   */
  constructor(librariesPath = 'assets/libraries') {
    const dirname = path.dirname(fileURLToPath(import.meta.url));
    this.basepath = path.join(dirname, '..', ...librariesPath.split('/'));
    this.config = loadConfig();

    this.update();
  }

  /**
   * Update library data from the filesystem.
   */
  update() {
    this.data = this.read();
  }

  /**
   * Get the folder names of H5P libraries.
   * @returns {string[]} An array of library folder names.
   */
  getLibraryFolderNames() {
    return getLibraryFolderNames(this.basepath);
  }

  getBasePath() {
    return this.basepath;
  }

  /**
   * Read library.json files from the library folders.
   * @returns {object[]} An array of parsed library.json objects.
   */
  read() {
    const libraryFolders = this.getLibraryFolderNames();
    return libraryFolders
      .map((folder) => readLibraryJson(this.basepath, folder));
  }

  /**
   * Get the list of libraries in a specific format.
   * @param {object} options Options for filtering the list.
   * @param {boolean} options.runnableOnly If true, only include runnable libraries.
   * @param {object} options.filter Filter options.
   * @param {string} options.filter.machineName Filter by machine name.
   * @returns {string[]} An array of formatted library strings.
   */
  getList(options = {}) {
    options.runnableOnly = options.runnableOnly ?? false;

    let list = this.data;
    if (options.runnableOnly) {
      list = list.filter((libraryJson) => libraryJson.runnable === 1);
    }
    if (options.filter?.machineName) {
      list = list.filter((libraryJson) => libraryJson.machineName === options.filter.machineName);
    }

    return list.map((libraryJson) => {
      const versionString = `${libraryJson.majorVersion}.${libraryJson.minorVersion}.${libraryJson.patchVersion}`;
      return `${libraryJson.machineName} ${versionString}`;
    });
  }

  compileTotalDependencyList(uberName, checked = [], dependencies = []) {
    const uberNameForMinorVersion = this.getUbernameForMinorVersion(uberName);
    if (checked.includes(uberNameForMinorVersion)) {
      return dependencies;
    }

    checked.push(uberNameForMinorVersion);

    const myDependencies = this.getDependencies(uberName);
    dependencies.push(...myDependencies);
    dependencies = [...new Set(dependencies)];

    if (checked.length === dependencies.length) {
      return dependencies;
    }

    const toCheck = dependencies.filter((dependency) => !checked.includes(dependency));

    let all = [...dependencies, ...this.compileTotalDependencyList(toCheck[0], checked, dependencies)];
    all = [...new Set(all)];

    return all;
  }

  getDependencies(uberName, options = {}) {
    options.type = options.type ?? 'all';
    const dependencies = [];

    const uberNameForMinorVersion = this.getUbernameForMinorVersion(uberName);
    if (options.type === 'all' || options.type === 'mandatory') {
      dependencies.push(uberNameForMinorVersion);

      const libraryJson = this.getLibraryJson(uberName, { exact: true });
      if (!libraryJson) {
        return [];
      }

      const preloadedDependencies = (libraryJson?.preloadedDependencies ?? []).map(
        (dependency) => `${dependency.machineName} ${dependency.majorVersion}.${dependency.minorVersion}`
      );
      dependencies.push(...preloadedDependencies);

      const editorDependencies = (libraryJson?.editorDependencies ?? []).map(
        (dependency) => `${dependency.machineName} ${dependency.majorVersion}.${dependency.minorVersion}`
      );
      dependencies.push(...editorDependencies);
    }

    if (options.type === 'all' || options.type === 'optional') {
      const semantics = this.getSemanticsJson(uberName);
      if (semantics) {
        const semanticsDependencies = findH5PDependenciesInSemantics(semantics);
        dependencies.push(...semanticsDependencies);
      }
    }

    return [...new Set(dependencies)];
  }

  getUbernameForMinorVersion(uberName) {
    const { machineName, majorVersion, minorVersion } = decomposeUberName(uberName);
    if (!majorVersion || !minorVersion) {
      const library = this.getLibraryJson(uberName);
      return `${machineName} ${library.majorVersion}.${library.minorVersion}`;
    }

    return `${machineName} ${majorVersion}.${minorVersion}`;
  }

  isEditorLibrary(uberName) {
    if (!uberName.startsWith('H5PEditor.')) {
      return false;
    }

    const libraryJson = this.getLibraryJson(uberName);
    if (!libraryJson) {
      return false;
    }

    if (libraryJson.runnable === 1) {
      return false;
    }

    const semantics = getSemanticsJson(uberName);
    if (!semantics) {
      return true;
    }

    return false;
  }

  /**
   * Remove a library folder from the filesystem.
   * @param {string} libraryFileName The name of the library file to remove.
   */
  remove(libraryFileName) {
    let { machineName, majorVersion, minorVersion } = decomposeLibraryFileName(libraryFileName);
    const folderPath = this.getFolderPath(`${machineName} ${majorVersion}.${minorVersion}`);
    if (!folderPath) {
      return;
    }

    removeDirectorySync(folderPath);

    this.update();
  }

  /**
   * Get the date of the library folder.
   * @param {string} machineName The machine name of the library.
   * @returns {Date|undefined} The date of the library folder or undefined if not found.
   */
  getFileDate(machineName) {
    const libraryJson = this.getLibraryJson(machineName);
    if (!libraryJson) {
      return;
    }

    let folder = `${machineName}-${libraryJson.majorVersion}.${libraryJson.minorVersion}.${libraryJson.patchVersion}`;
    if (!existsSync(path.join(this.basepath, folder))) {
      folder = `${machineName}-${libraryJson.majorVersion}.${libraryJson.minorVersion}`;
    }
    if (!existsSync(path.join(this.basepath, folder))) {
      return;
    }

    return statSync(path.join(this.basepath, folder)).mtime;
  }

  /**
   * Get the list of machine names of all content types.
   * @returns {string[]} An array of unique machine names.
   */
  getMachineNamesOfContentTypes() {
    return this.data
      .filter((library) => library.runnable === 1 && library.machineName)
      .map((library) => library.machineName)
      .filter((machineName, index, self) => self.indexOf(machineName) === index); // Remove duplicates
  }

  /**
   * Get library.json for the uber name or latest version found for machine name.
   * @param {string} uberName Uber name or machine name of the library.
   * @param {object} options Options for getting the library.json.
   * @param {boolean} options.exact If true, return the exact version specified in the uber name.
   * @returns {object} Library.json of the requested/latest version.
   */
  getLibraryJson(uberName, options = {}) {
    options.exact = options.exact ?? false;

    const { machineName, majorVersion, minorVersion } = decomposeUberName(uberName);

    let libraryJson;
    if (majorVersion && minorVersion) {
      libraryJson = this.data.find((library) => {
        return library.machineName === machineName &&
          library.majorVersion.toString() === majorVersion &&
          library.minorVersion.toString() === minorVersion;
      });
    }

    if (libraryJson) {
      return libraryJson;
    }
    else if (options.exact) {
      return undefined;
    }

    return this.data
      .filter((library) => library.machineName === machineName)
      .reduce((latestLibrary, library) => {
        const currentVersion = `${library.majorVersion}.${library.minorVersion}.${library.patchVersion}`;

        if (!latestLibrary || compareVersions(currentVersion, latestLibrary?.version ?? '0.0.0') > 0) {
          return library;
        }

        return latestLibrary;
      }, undefined);
  }

  /**
   * Get library.json objects for multiple machine names.
   * @param {string[]} machineNames An array of machine names.
   * @returns {object[]} An array of library.json objects.
   */
  getLibraryJsons(machineNames) {
    return machineNames
      .map((machineName) => this.getLibraryJson(machineName))
      .filter((libraryJson) => libraryJson !== undefined);
  }

  /**
   * Get the semantics.json file for the library specified by the uber name.
   * @param {string} uberName Uber name of the library.
   * @returns {object|undefined} Parsed semantics.json object or undefined if not found.
   */
  getSemanticsJson(uberName) {
    const { machineName, majorVersion, minorVersion } = decomposeUberName(uberName);

    const libraryJson = this.getLibraryJson(machineName);
    if (!libraryJson) {
      return;
    }

    let folder =
      `${machineName}-${majorVersion ?? libraryJson.majorVersion}.${minorVersion ?? libraryJson.minorVersion}`;

    let filePath = path.join(this.basepath, folder, 'semantics.json');

    if (!existsSync(filePath)) {
      folder = `${machineName}-${libraryJson.majorVersion}.${libraryJson.minorVersion}.${libraryJson.patchVersion}`;
      filePath = path.join(this.basepath, folder, 'semantics.json');
    }

    if (!existsSync(filePath)) {
      return;
    }

    return JSON.parse(readFileSync(filePath, 'utf8'));
  }

  /**
   * Check whether the library provides an icon.
   * @param {string} machineName Machine name of the library.
   * @returns {boolean} True if the library has an icon, false otherwise.
   */
  hasIcon(machineName) {
    const libraryJson = this.getLibraryJson(machineName);
    if (!libraryJson) {
      return false;
    }

    const folder = `${machineName}-${libraryJson.majorVersion}.${libraryJson.minorVersion}`;

    return existsSync(path.join(this.basepath, folder, 'icon.svg'));
  }

  /**
   * Get the icon URL for the library specified by the machine name.
   * @param {string} machineName Machine name of the library.
   * @returns {string|undefined} Icon URL or undefined if not found.
   */
  getIconURL(machineName) {
    const libraryJson = this.getLibraryJson(machineName);
    if (!libraryJson) {
      return;
    }

    let iconURL;
    if (this.hasIcon(machineName)) {
      const base = `${this.config.protocol}://${this.config.domain ?? this.config.hostname}`;
      iconURL = `${base}/libraries/${machineName}-${libraryJson.majorVersion}.${libraryJson.minorVersion}/icon.svg`;
    }

    return iconURL;
  }

  /**
   * Get the folder path for the library specified by the uber name.
   * @param {string} uberName Uber name of the library.
   * @returns {string|undefined} Folder path or undefined if not found.
   */
  getFolderPath(uberName) {
    const { machineName, majorVersion, minorVersion } = decomposeUberName(uberName);

    const libraryJson = this.getLibraryJson(machineName);
    if (!libraryJson) {
      return;
    }

    // TODO: Would be safer to have this.
    // if (
    //   majorVersion !== libraryJson.majorVersion.toString() ||
    //   minorVersion !== libraryJson.minorVersion.toString()
    // ) {
    //   return;
    // }

    const version = `${libraryJson.majorVersion}.${libraryJson.minorVersion}`;
    const folderPath = path.join(this.basepath, `${machineName}-${version}`);
    if (!existsSync(folderPath)) {
      return;
    }

    return folderPath;
  }

  /**
   * Get the latest library version that is served for the machine name.
   * @param {string} machineName Machine name of the library.
   * @returns {string|undefined} Latest version string or undefined if not found.
   */
  getLatestVersion(machineName) {
    const libraryJson = this.getLibraryJson(machineName);
    if (!libraryJson) {
      return;
    }

    return `${libraryJson.majorVersion}.${libraryJson.minorVersion}.${libraryJson.patchVersion}`;
  }
}
