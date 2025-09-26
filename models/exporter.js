import { cpSync, lstatSync, readdirSync, unlinkSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import chalk from 'chalk';
import AdmZip from 'adm-zip';

import { clearDirectorySync } from '../services/fs-utils.js';
import { decomposeUberName, findH5PDependenciesInSemantics } from '../services/h5p-utils.js';
import { createUUID } from '../services/utils.js';
import Libraries from './libraries.js';

export default class Exporter {

  /**
   * @class
   * @param {string} tempPath Relative path to temporary folder.
   * @param {string} exportsPath Relative path to exports folder.
   */
  constructor(tempPath = 'assets/temp', exportsPath = 'assets/exports') {
    const dirname = path.dirname(fileURLToPath(import.meta.url));
    this.tempPath = path.join(dirname, '..', ...tempPath.split('/'));
    this.exportsPath = path.join(dirname, '..', ...exportsPath.split('/'));
  }

  /**
   * Create export file for a library.
   * @param {string} machineName Machine name of the library to create the file for.
   * @param {Libraries} libraries Libraries instance.
   */
  async createExport(machineName, libraries) {
    let dependencyUberNames = this.compileDependencies(machineName, libraries);

    const tmpExportDir = createUUID();
    const tempExportPath = path.join(this.tempPath, tmpExportDir);

    dependencyUberNames
      .filter((dependencyUberName) => {
        // Check for dependencies that are not installed
        const { machineName: dependencyMachineName } = decomposeUberName(dependencyUberName);
        const child = libraries.getLibraryJson(dependencyMachineName);
        return child !== undefined;
      })
      .forEach((dependencyUberName) => {
        const sourceFolder = libraries.getFolderPath(dependencyUberName);
        if (!sourceFolder) {
          console.error(chalk.red(`Library source folder not found for ${dependencyUberName}`));
        }

        const destinationFolder = path.join(tempExportPath, path.basename(sourceFolder));

        cpSync(sourceFolder, destinationFolder, { recursive: true });
      });

    const library = libraries.getLibraryJson(machineName);

    // Remove previous export
    this.remove(`${machineName} ${library.majorVersion}.${library.minorVersion}`);

    const zipFilePath = path.join(
      this.exportsPath,
      `${machineName}-${library.majorVersion}.${library.minorVersion}.${library.patchVersion}.h5p`
    );
    await this.zipFolder(tempExportPath, zipFilePath);

    clearDirectorySync(tempExportPath);
  }

  /**
   * Compile dependencies for a library.
   * @param {string} uberName Uber name of the library to compile dependencies for.
   * @param {Libraries} libraries Libraries instance.
   * @param {string[]} checked List of already checked dependencies.
   * @returns {string[]} List of compiled dependencies.
   */
  compileDependencies(uberName, libraries, checked = []) {
    const { machineName, majorVersion, minorVersion } = decomposeUberName(uberName);

    const dependencies = this.getBaseDependencies(machineName, majorVersion, minorVersion, libraries);
    checked.push(dependencies[0]);

    const library = libraries.getLibraryJson(machineName);
    const allDependencies = [
      ...dependencies,
      ...this.getLibraryDependencies(library?.preloadedDependencies),
      ...this.getLibraryDependencies(library?.editorDependencies),
      ...this.getSemanticsDependencies(machineName, libraries),
    ];

    const children = this.getChildDependencies(allDependencies, libraries, checked);

    return this.getUniqueDependencies([...allDependencies, ...children]);
  }

  /**
   * Get the base dependencies for a library.
   * @param {string} machineName Machine name of the library.
   * @param {number} majorVersion Major version of the library.
   * @param {number} minorVersion Minor version of the library.
   * @param {Libraries} libraries Libraries instance.
   * @returns {string[]} Base dependency uber names.
   */
  getBaseDependencies(machineName, majorVersion, minorVersion, libraries) {
    if (!majorVersion || !minorVersion) {
      const library = libraries.getLibraryJson(machineName);
      return [`${machineName} ${library.majorVersion}.${library.minorVersion}`];
    }

    return [`${machineName} ${majorVersion}.${minorVersion}`];
  }

  /**
   * Get dependencies from a list of library dependencies.
   * @param {Array} dependencies List of dependencies.
   * @returns {string[]} Ubernames.
   */
  getLibraryDependencies(dependencies = []) {
    return dependencies.map(
      (dependency) => `${dependency.machineName} ${dependency.majorVersion}.${dependency.minorVersion}`
    );
  }

  /**
   * Get dependencies from the semantics of a library.
   * @param {string} machineName Machine name of the library.
   * @param {Libraries} libraries Libraries instance.
   * @returns {string[]} Semantics dependencies.
   */
  getSemanticsDependencies(machineName, libraries) {
    const semantics = libraries.getSemanticsJson(machineName);
    return findH5PDependenciesInSemantics(semantics);
  }

  /**
   * Recursively compile child dependencies.
   * @param {string[]} dependencies List of dependencies.
   * @param {Libraries} libraries Libraries instance.
   * @param {string[]} checked List of already checked dependencies.
   * @returns {string[]} Child dependencies.
   */
  getChildDependencies(dependencies, libraries, checked) {
    let children = [];

    dependencies.forEach((dependency) => {
      if (!checked.includes(dependency)) {
        children = [...children, ...this.compileDependencies(dependency, libraries, checked)];
      }
    });

    return children;
  }

  /**
   * Get unique dependencies from a list.
   * @param {string[]} dependencies List of dependencies.
   * @returns {string[]} Unique dependencies.
   */
  getUniqueDependencies(dependencies) {
    return [...new Set(dependencies)];
  }

  /**
   * Clear the export folder.
   */
  clearExport() {
    clearDirectorySync(this.exportsPath);
  }

  /**
   * Zip a folder programmatically using the adm-zip library.
   * @param {string} folderPath Path to the folder to zip.
   * @param {string} zipFilePath Path to the output zip file.
   */
  async zipFolder(folderPath, zipFilePath) {
    return new Promise((resolve, reject) => {
      try {
        const zip = new AdmZip();
        this.addFolderToZip(folderPath, zip, folderPath);
        zip.writeZip(zipFilePath);
        resolve();
      }
      catch (err) {
        console.error(chalk.red('Error while zipping the folder:', err.message));
        reject(err);
      }
    });
  }

  /**
   * Recursively add files and directories to the zip.
   * @param {string} currentPath Current folder path being processed.
   * @param {object} zip AdmZip instance.
   * @param {string} rootPath Root folder path to preserve folder structure.
   */
  addFolderToZip(currentPath, zip, rootPath) {
    const items = readdirSync(currentPath);
    items.forEach((item) => {
      const itemPath = path.join(currentPath, item);
      const stats = lstatSync(itemPath);

      if (stats.isDirectory()) {
        this.addFolderToZip(itemPath, zip, rootPath);
      }
      else {
        // Preserve subfolder structure
        const relativePath = path.relative(rootPath, itemPath);
        zip.addLocalFile(itemPath, path.dirname(relativePath));
      }
    });
  }

  /**
   * Remove all files related to a specific Uber name.
   * @param {string} uberName Uber name of the files to be removed.
   */
  remove(uberName) {
    const { machineName, majorVersion, minorVersion } = decomposeUberName(uberName);

    const files = readdirSync(this.exportsPath);
    const relevantFiles = files.filter((fileName) => {
      return fileName.startsWith(`${machineName}-${majorVersion}.${minorVersion}`);
    });

    relevantFiles.forEach((fileName) => {
      unlinkSync(path.join(this.exportsPath, fileName));
    });
  }
}
