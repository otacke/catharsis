import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

/**
 * Get all library folders from a specified base path.
 * @param {string} basepath The base path where the library folders are located.
 * @returns {string[]} An array of library folder names.
 */
export const getLibraryFolderNames = (basepath) => {
  return readdirSync(basepath)
    .filter((folder) => {
      const isDirectory = statSync(path.join(basepath, folder)).isDirectory();
      const hasLibraryJson = existsSync(path.join(basepath, folder, 'library.json'));
      return isDirectory && hasLibraryJson;
    });
};

/**
 * Read the library.json file from a specified folder.
 * @param {string} basepath The base path where the library folders are located.
 * @param {string} folder The folder name to read the library.json from.
 * @returns {object} The parsed content of the library.json file.
 */
export const readLibraryJson = (basepath, folder) => {
  const filePath = path.join(basepath, folder, 'library.json');
  return JSON.parse(readFileSync(filePath, 'utf8'));
};

/**
 * Decompose a library file name into its machine name, major version, and minor version.
 * @param {string} fileName The library file name to decompose.
 * @returns {object} The decomposed parts.
 */
export const decomposeLibraryFileName = (fileName = '') => {
  const parts = fileName.split('-');
  const versionPart = parts.pop();
  const [majorVersion, minorVersion, patchVersion] = versionPart.split('.');
  const machineName = parts.join('-');

  return {
    machineName,
    majorVersion,
    minorVersion,
    patchVersion,
  };
};

/**
 * Decompose an Uber name into its machine name, major version, and minor version.
 * @param {string} uberName The Uber name to decompose.
 * @returns {object} The decomposed parts.
 */
export const decomposeUberName = (uberName = '') => {
  const parts = uberName.split(' ');

  return {
    machineName: parts[0] || null,
    majorVersion: parts[1]?.split('.')[0] ?? null,
    minorVersion: parts[1]?.split('.')[1] ?? null,
    patchVersion: parts[1]?.split('.')[2] ?? null,
  };
};

/**
 * Find H5P dependencies in a semantics chunk.
 * @param {object} semanticsChunk The semantics chunk to search in.
 * @returns {string[]} An array of found H5P dependencies.
 */
export const findH5PDependenciesInSemantics = (semanticsChunk) => {
  let results = [];

  const search = (semanticsChunk) => {
    if (Array.isArray(semanticsChunk)) {
      semanticsChunk.forEach((item) => search(item));
    }
    else if (typeof semanticsChunk === 'object' && semanticsChunk !== null) {
      if (semanticsChunk.hasOwnProperty('options') && Array.isArray(semanticsChunk.options)) {
        const uberNames = semanticsChunk.options.filter((option) => /H5P\.[a-zA-Z]+ [0-9]+\.[0-9]+/.test(option));

        results = [...results, ...uberNames];
      }

      for (let key in semanticsChunk) {
        if (semanticsChunk.hasOwnProperty(key)) {
          search(semanticsChunk[key]);
        }
      }
    }
  };

  search(semanticsChunk);
  return results;
};
