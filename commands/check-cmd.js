import { fileURLToPath } from 'url';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'fs';
import path from 'path';

import Ajv from 'ajv';
import chalk from 'chalk';

import Libraries from '../models/libraries.js';
import { decomposeLibraryFileName } from '../services/h5p-utils.js';

const getSegmentByPath = (jsonData, path) => {
  const segments = path.split('/').filter((segment) => segment !== '');

  let current = jsonData;
  let propertyName = null;

  for (const segment of segments) {
    if (current && typeof current === 'object' && segment in current) {
      propertyName = segment;
      current = current[segment];
    }
    else {
      return undefined;
    }
  }

  const processedValue = processSegment(current);

  return {
    key: propertyName,
    value: processedValue
  };
};

const processSegment = (segment) => {
  if (Array.isArray(segment)) {
    return '[array]';
  }
  else if (segment && typeof segment === 'object' && segment !== null) {
    const processedObject = {};
    for (const key in segment) {
      if (segment.hasOwnProperty(key)) {
        processedObject[key] = processSegment(segment[key]);
      }
    }
    return processedObject;
  }
  else {
    return segment;
  }
};

const createMessage = (text, uberName) => {
  if (!uberName) {
    return text;
  }

  return `${uberName}: ${text}`;
};

const display = (text, level = 'error') => {
  if (level === 'info') {
    console.warn(chalk.cyan(`- ${text}`));
  }
  else if (level === 'warning') {
    console.warn(chalk.yellow(`- ${text}`));
  }
  else {
    console.error(chalk.red(`- ${text}`));
  }
};

export default class CheckCmd {

  /**
   * @class
   */
  constructor() {
    this.libraries = new Libraries();
  }

  checkAll() {
    console.warn(chalk.blue('Running checks...'));

    this.checkH5PSpecification();
    // TODO: Make that function return a list of mesages including ubername, text and level

    console.warn(chalk.blue('Done running checks'));
  }

  checkH5PSpecification() {
    console.warn(chalk.blue('Checking H5P specification...'));

    const basePath = this.libraries.getBasePath();
    const libaryFolderNames = this.libraries.getLibraryFolderNames();
    libaryFolderNames.forEach((folder) => {
      const fullPath = path.join(basePath, folder);
      const libraryJson = this.checkLibraryJson(fullPath);
      this.checkPreloadedFiles(fullPath, libraryJson, 'preloadedJs', 'JS');
      this.checkPreloadedFiles(fullPath, libraryJson, 'preloadedCss', 'CSS');
      const semanticsJson = this.checkSemanticsJson(fullPath, libraryJson);
      this.checkTranslations(fullPath, libraryJson, semanticsJson);
      this.checkIcon(fullPath, libraryJson);
    });

    console.warn(chalk.blue('Done checking H5P specification'));
  }

  /**
   * Check if preloaded files exist.
   * @param {string} fullPath Full path to the library folder
   * @param {object} libraryJson Library JSON object
   * @param {string} property Property to check ('preloadedJs' or 'preloadedCss')
   * @param {string} fileTypeLabel Label for error messages ('JS' or 'CSS')
   */
  checkPreloadedFiles(fullPath, libraryJson, property, fileTypeLabel) {
    if (!libraryJson?.[property]?.length > 0) {
      return;
    }

    const { machineName, majorVersion, minorVersion } = decomposeLibraryFileName(path.basename(fullPath));
    const uberName = `${machineName} ${majorVersion}.${minorVersion}`;

    libraryJson[property].forEach((file) => {
      const filePath = path.join(fullPath, file.path);
      if (!existsSync(filePath)) {
        const message = createMessage(`Preloaded ${fileTypeLabel} file not found: "${file.path}"`, uberName);
        display(message, 'error');
      }
    });
  }

  checkLibraryJson(folder) {
    const { machineName, majorVersion, minorVersion } = decomposeLibraryFileName(path.basename(folder));
    const uberName = `${machineName} ${majorVersion}.${minorVersion}`;

    const libraryJsonPath = path.join(folder, 'library.json');
    if (!existsSync(libraryJsonPath)) {
      const message = createMessage('File "library.json" not found', uberName);
      display(message, 'error');
      return;
    }

    let libraryJson = readFileSync(libraryJsonPath, 'utf8');
    try {
      libraryJson = JSON.parse(libraryJson);
    }
    catch (error) {
      const message = createMessage(`File "library.json" is invalid: ${error.message}`, uberName);
      display(message, 'error');

      return;
    }

    const currentFilePath = fileURLToPath(import.meta.url);
    const schemaPath = path.join(path.dirname(currentFilePath), '..', 'schemas', 'library-json-schema.json');
    const h5pLibraryJsonSchema = JSON.parse(readFileSync(schemaPath, 'utf8'));

    const ajv = new Ajv();
    const validate = ajv.compile(h5pLibraryJsonSchema);

    const valid = validate(libraryJson);
    if (!valid) {
      validate.errors.forEach((error) => {
        if (error.keyword === 'additionalProperties') {
          const message = createMessage(
            `In file "library.json", property "${error.params.additionalProperty}" is not allowed`,
            uberName
          );
          display(message, 'warning');
        }
        else if (error.keyword === 'required') {
          const message = createMessage(`File "library.json" ${error.message}`, uberName);
          display(message, 'warning');
        }
        else {
          const message = createMessage(
            `In file "library.json", property value of "${error.instancePath}" ${error.message}`,
            uberName
          );
          display(message, 'warning');
        }
      });
    }

    return libraryJson;
  }

  checkSemanticsJson(folder, libraryJson) {
    const isRunnable = libraryJson?.runnable === 1;

    const { machineName, majorVersion, minorVersion } = decomposeLibraryFileName(path.basename(folder));
    const uberName = `${machineName} ${majorVersion}.${minorVersion}`;

    const semanticsPath = path.join(folder, 'semantics.json');
    if (!existsSync(semanticsPath)) {
      if (!isRunnable) {
        return false;
      }
      else {
        const message = createMessage('File "semantics.json" not found', uberName);
        display(message, 'warning');
        return false;
      }
    }

    let semanticsJson = readFileSync(semanticsPath, 'utf8');
    try {
      semanticsJson = JSON.parse(semanticsJson);
    }
    catch (error) {
      if (isRunnable) {
        const message = createMessage(`File "semantics.json" is invalid: ${error.message}`, uberName);
        display(message, 'error');
        return false;
      }
    }

    const currentFilePath = fileURLToPath(import.meta.url);
    const schemaPath = path.join(path.dirname(currentFilePath), '..', 'schemas', 'semantics-schema.json');
    const semanticsSchema = JSON.parse(readFileSync(schemaPath, 'utf8'));

    const ajv = new Ajv();
    const validate = ajv.compile(semanticsSchema);
    const valid = validate(semanticsJson);
    if (!valid) {
      validate.errors.forEach((error) => {
        if (error.keyword === 'if') {
          return; // Ignore this error, there should be a more specific error
        }

        const { key, value } = getSegmentByPath(semanticsJson, error.instancePath);

        const parts = [
          `In file "semantics.json", property value of field "${key}" ("${error.instancePath}") ${error.message}`,
          `The problematic value is: ${JSON.stringify(value)}.`
        ];

        if (error.keyword === 'additionalProperties') {
          parts.push(`The invalid additional property is "${error.params.additionalProperty}".`);
        }

        const message = createMessage(parts.join(' '), uberName);
        display(message, 'warning');
      });
    }

    return semanticsJson;
  }

  checkIcon(folder, libraryJson) {
    if (libraryJson?.runnable !== 1) {
      return; // Only content types should have an icon
    }

    const { machineName, majorVersion, minorVersion } = decomposeLibraryFileName(path.basename(folder));
    const uberName = `${machineName} ${majorVersion}.${minorVersion}`;

    const iconPath = path.join(folder, 'icon.svg');
    if (!existsSync(iconPath)) {
      const message = createMessage('File "icon.svg" is missing', uberName);
      display(message, 'warning');
    }
    else {
      const iconContent = readFileSync(iconPath, 'utf8');
      if (!iconContent.includes('xmlns="http://www.w3.org/2000/svg"')) {
        const message = createMessage('File "icon.svg" is not a valid SVG file', uberName);
        display(message, 'warning');
      }
    }
  }

  checkTranslations(folder, libraryJson, semanticsJson) {
    const hasSemanticsJson = semanticsJson && Object.keys(semanticsJson).length > 0;
    if (!hasSemanticsJson) {
      return; // No semantics.json, no translations
    }

    const translationsPath = path.join(folder, 'language');
    if (!existsSync(translationsPath) || !lstatSync(translationsPath).isDirectory()) {
      return;
    }

    const { machineName, majorVersion, minorVersion } = decomposeLibraryFileName(path.basename(folder));
    const uberName = `${machineName} ${majorVersion}.${minorVersion}`;
    const isEditorLibrary = libraryJson?.runnable !== 1 && machineName.startsWith('H5PEditor.');

    const translationFiles = readdirSync(translationsPath);

    if (!isEditorLibrary && translationFiles.includes('.en.json')) {
      const message = createMessage('In "language" folder, template file ".en.json" should not exist', uberName);
      display(message, 'error');
    }
    else if (isEditorLibrary && !translationFiles.includes('en.json')) {
      const message = createMessage('In "language" folder, template file "en.json" is missing', uberName);
      display(message, 'error');
    }

    translationFiles.forEach((file) => {
      if (!file.endsWith('.json')) {
        const message = createMessage(
          `In "language" folder, "${file}" is not a JSON file`,
          uberName
        );
        display(message, 'error');
      }

      const languageCode = path.basename(file, '.json');
      if (!isEditorLibrary && languageCode === 'en') {
        const message = createMessage(
          'In "language" folder, template file "en.json" must be removed',
          uberName
        );
        display(message, 'error');
      }
      else if (isEditorLibrary && languageCode === '.en') {
        const message = createMessage(
          'In "language" folder, template file ".en.json" must be renamed to `en.json`',
          uberName
        );
        display(message, 'error');
      }

      if (languageCode.startsWith('.') && languageCode !== '.en') {
        const message = createMessage(
          `In "language" folder, "${file}" must not start with a dot`,
          uberName
        );
        display(message, 'error');
      }

      if (languageCode !== languageCode.toLowerCase()) {
        const message = createMessage(
          `In "language" folder, "${file}" must be in lowercase`,
          uberName
        );
        display(message, 'error');
      }

      // TODO: Check translation file against [.]en.json, create if it does not exist
    });
  }
}
