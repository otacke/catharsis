import { fileURLToPath } from 'url';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'fs';
import path from 'path';

import Ajv from 'ajv';
import chalk from 'chalk';

import Libraries from '../models/libraries.js';
import { decomposeLibraryFileName, decomposeUberName  } from '../services/h5p-utils.js';
import { compareLanguages, removeUntranslatables } from '../services/translation-utils.js';
import { compareVersions } from '../services/utils.js';

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
    value: processedValue,
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

const displayMessages = (messages = [], options = {}) => {
  options.groupedBy = options.groupedBy ?? 'uberName';

  messages.sort((a, b) => {
    if (a[options.groupedBy] < b[options.groupedBy]) {
      return -1;
    }
    if (a[options.groupedBy] > b[options.groupedBy]) {
      return 1;
    }
    return 0;
  });

  messages.forEach((message) => {
    const text = (message.uberName) ? `${message.uberName}: ${message.text ?? ''}` : message.text ?? '';

    if (message.level === 'info') {
      console.log(chalk.cyan(`- ${text}`));
    }
    else if (message.level === 'warning') {
      console.log(chalk.yellow(`- ${text}`));
    }
    else {
      console.error(chalk.red(`- ${text}`));
    }
  });
};

export default class CheckCmd {

  /**
   * @class
   */
  constructor() {
    this.libraries = new Libraries();
  }

  checkAll() {
    console.log(chalk.blue('Running all checks...'));
    const messages = [];
    messages.push(...this.checkH5PSpecification());
    messages.push(...this.checkDependencies());

    displayMessages(messages, { groupedBy: 'level' });

    console.log(chalk.blue('Done running all checks.'));
  }

  checkH5PSpecification() {
    const messages = [];

    const basePath = this.libraries.getBasePath();
    const libaryFolderNames = this.libraries.getLibraryFolderNames();

    libaryFolderNames.forEach((folder) => {
      const fullPath = path.join(basePath, folder);
      const { machineName, majorVersion, minorVersion } = decomposeLibraryFileName(folder);
      const uberName = `${machineName} ${majorVersion}.${minorVersion}`;

      messages.push(...this.checkLibraryJson(fullPath));

      const libraryJson = this.libraries.getLibraryJson(uberName);
      if (!libraryJson) {
        return messages;
      }

      messages.push(...this.checkPreloadedFiles(fullPath, libraryJson, 'preloadedJs', 'JS'));
      messages.push(...this.checkPreloadedFiles(fullPath, libraryJson, 'preloadedCss', 'CSS'));
      messages.push(...this.checkSemanticsJson(fullPath, libraryJson));
      messages.push(...this.checkIcon(fullPath, libraryJson));
      messages.push(...this.checkTranslations(fullPath, libraryJson));

    });

    return messages;
  }

  /**
   * Check if preloaded files exist.
   * @param {string} fullPath Full path to the library folder
   * @param {object} libraryJson Library JSON object
   * @param {string} property Property to check ('preloadedJs' or 'preloadedCss')
   * @param {string} fileTypeLabel Label for error messages ('JS' or 'CSS')
   * @returns {object[]} Array of error messages.
   */
  checkPreloadedFiles(fullPath, libraryJson, property, fileTypeLabel) {
    if (!libraryJson?.[property]?.length > 0) {
      return [];
    }

    const messages = [];
    const { machineName, majorVersion, minorVersion } = decomposeLibraryFileName(path.basename(fullPath));
    const uberName = `${machineName} ${majorVersion}.${minorVersion}`;

    libraryJson[property].forEach((file) => {
      const filePath = path.join(fullPath, file.path);
      if (!existsSync(filePath)) {
        messages.push({
          uberName: uberName,
          text: `Preloaded ${fileTypeLabel} file not found: "${file.path}"`,
          level: 'error',
        });
      }
    });

    return messages;
  }

  checkLibraryJson(folder) {
    if (!folder) {
      return [];
    }

    const messages = [];

    const { machineName, majorVersion, minorVersion } = decomposeLibraryFileName(path.basename(folder));
    const uberName = `${machineName} ${majorVersion}.${minorVersion}`;

    const libraryJsonPath = path.join(folder, 'library.json');
    if (!existsSync(libraryJsonPath)) {
      messages.push({
        uberName,
        text: 'File "library.json" not found',
        level: 'error',
      });

      return messages;
    }

    let libraryJson = readFileSync(libraryJsonPath, 'utf8');
    try {
      libraryJson = JSON.parse(libraryJson);
    }
    catch (error) {
      messages.push({
        uberName,
        text: `File "library.json" is invalid: ${error.message}`,
        level: 'error',
      });

      return messages;
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
          messages.push({
            uberName,
            text: `In file "library.json", property "${error.params.additionalProperty}" is not allowed`,
            level: 'warning',
          });
        }
        else if (error.keyword === 'required') {
          messages.push({
            uberName,
            text: `File "library.json" ${error.message}`,
            level: 'warning',
          });
        }
        else {
          messages.push({
            uberName,
            text: `In file "library.json", property value of "${error.instancePath}" ${error.message}`,
            level: 'warning',
          });
        }
      });
    }

    return messages;
  }

  checkSemanticsJson(folder, libraryJson) {
    if (!folder || !libraryJson) {
      return [];
    }

    const messages = [];

    const isRunnable = libraryJson?.runnable === 1;

    const { machineName, majorVersion, minorVersion } = decomposeLibraryFileName(path.basename(folder));
    const uberName = `${machineName} ${majorVersion}.${minorVersion}`;

    const semanticsPath = path.join(folder, 'semantics.json');
    if (!existsSync(semanticsPath)) {
      if (!isRunnable) {
        return [];
      }
      else {
        messages.push({
          uberName,
          text: 'File "semantics.json" not found',
          level: 'error',
        });

        return messages;
      }
    }

    let semanticsJson = readFileSync(semanticsPath, 'utf8');
    try {
      semanticsJson = JSON.parse(semanticsJson);
    }
    catch (error) {
      if (isRunnable) {
        messages.push({
          uberName,
          text: `File "semantics.json" is invalid: ${error.message}`,
          level: 'error',
        });

        return messages;
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
          `The problematic value is: ${JSON.stringify(value)}.`,
        ];

        if (error.keyword === 'additionalProperties') {
          parts.push(`The invalid additional property is "${error.params.additionalProperty}".`);
        }

        messages.push({
          uberName,
          text: parts.join(' '),
          level: 'warning',
        });
      });
    }

    return messages;
  }

  checkIcon(folder, libraryJson) {
    if (libraryJson?.runnable !== 1) {
      return []; // Only content types should have an icon
    }

    const messages = [];

    const { machineName, majorVersion, minorVersion } = decomposeLibraryFileName(path.basename(folder));
    const uberName = `${machineName} ${majorVersion}.${minorVersion}`;

    const iconPath = path.join(folder, 'icon.svg');
    if (!existsSync(iconPath)) {
      messages.push({
        uberName,
        text: 'File "icon.svg" is missing',
        level: 'warning',
      });
    }
    else {
      const iconContent = readFileSync(iconPath, 'utf8');
      if (!iconContent.includes('xmlns="http://www.w3.org/2000/svg"')) {
        messages.push({
          uberName,
          text: 'File "icon.svg" is not a valid SVG file',
          level: 'warning',
        });
      }
    }

    return messages;
  }

  checkTranslations(folder, libraryJson) {
    if (!folder || !libraryJson) {
      return [];
    }

    const translationsPath = path.join(folder, 'language');
    if (!existsSync(translationsPath) || !lstatSync(translationsPath).isDirectory()) {
      return [];
    }

    const messages = [];

    const { machineName, majorVersion, minorVersion } = decomposeLibraryFileName(path.basename(folder));
    const uberName = `${machineName} ${majorVersion}.${minorVersion}`;

    const semanticsJson = this.libraries.getSemanticsJson(uberName);

    const isEditorLibrary = libraryJson?.runnable !== 1 && (!semanticsJson || machineName.startsWith('H5PEditor.'));

    const translationFiles = readdirSync(translationsPath);

    if (!isEditorLibrary && translationFiles.includes('.en.json')) {
      messages.push({
        uberName,
        text: 'In "language" folder, template file ".en.json" should not exist',
        level: 'error',
      });
    }
    else if (isEditorLibrary && !translationFiles.includes('en.json')) {
      messages.push({
        uberName,
        text: 'In "language" folder, template file "en.json" should be added.',
        level: 'warning',
      });
    }

    translationFiles.forEach((file) => {
      if (!file.endsWith('.json')) {
        messages.push({
          uberName,
          text: `In "language" folder, "${file}" is not a JSON file`,
          level: 'error',
        });
      }

      const languageCode = path.basename(file, '.json');
      if (!isEditorLibrary && languageCode === 'en') {
        messages.push({
          uberName,
          text: 'In "language" folder, template file "en.json" must be renamed to `.en.json`',
          level: 'error',
        });
      }
      else if (isEditorLibrary && languageCode === '.en') {
        messages.push({
          uberName,
          text: 'In "language" folder, template file ".en.json" must be renamed to `en.json`',
          level: 'error',
        });
      }

      if (languageCode.startsWith('.') && languageCode !== '.en') {
        messages.push({
          uberName,
          text: `In "language" folder, "${file}" must not start with a dot`,
          level: 'error',
        });
      }

      if (languageCode !== languageCode.toLowerCase()) {
        messages.push({
          uberName,
          text: `In "language" folder, "${file}" must be in lowercase`,
          level: 'error',
        });
      }

      let translationJson = readFileSync(path.join(translationsPath, file), 'utf8');
      try {
        translationJson = JSON.parse(translationJson);
      }
      catch (error) {
        messages.push({
          uberName,
          text: `Translation file "${file}" is invalid: ${error.message}`,
          level: 'error',
        });

        return messages;
      }

      let translation;
      let translationTemplate;
      if (isEditorLibrary) {
        translation = translationJson;
        try {
          translationTemplate = JSON.parse(readFileSync(path.join(translationsPath, 'en.json'), 'utf8'));
        }
        catch (error) {
          messages.push({
            uberName,
            text: `Could not check translation file "${file}", because template file "en.json" is invalid or missing.`,
            level: 'warning',
          });
          return messages;
        }
      }
      else {
        translation = translationJson.semantics;
        if (!translation) {
          messages.push({
            uberName,
            text: `Translation file "${file}" seems to be invalid.`,
            level: 'error',
          });
          return messages;
        }

        if (!semanticsJson) {
          messages.push({
            uberName,
            text: `Could not check translation file "${file}", because template file ".en.json" is invalid or missing.`,
            level: 'warning',
          });
          return messages;
        }

        translationTemplate = removeUntranslatables(semanticsJson);
      }

      const comparison = compareLanguages(translation, translationTemplate);

      if (comparison.errors?.length) {
        const combinedErrors = comparison.errors.map((error) => {
          return `${error.text} (${error.path})`;
        });

        messages.push({
          uberName,
          text: `Translation file "${file}" is invalid: ${combinedErrors.join(', ')}`,
          level: 'error',
        });
      }
    });

    return messages;
  }

  checkDependencies() {
    const messages = [];

    const libaryFolderNames = this.libraries.getLibraryFolderNames();

    libaryFolderNames.forEach((folder) => {
      const { machineName, majorVersion, minorVersion } = decomposeLibraryFileName(folder);
      const uberName = `${machineName} ${majorVersion}.${minorVersion}`;

      messages.push(...this.checkForConflictingDependencies(uberName));
      messages.push(...this.checkForOutdatedDependencyUse(uberName));
      messages.push(...this.checkForMissingDependencies(uberName));
    });

    return messages;
  }

  checkForMissingDependencies(uberName) {
    const messages = [];

    const mandatoryDependencyList = this.libraries.getDependencies(uberName, { type: 'mandatory' });
    mandatoryDependencyList.forEach((dependency) => {
      const libraryJson = this.libraries.getLibraryJson(dependency, { exact: true });
      if (!libraryJson) {
        messages.push({
          uberName: uberName,
          text: [
            `Has a mandatory dependency to "${dependency}, but it is not installed.`,
            'The dependency must be installed in order to use the library.',
          ].join(' '),
          level: 'error',
        });
      }
    });

    const optionalDependencyList = this.libraries.getDependencies(uberName, { type: 'optional' });
    optionalDependencyList.forEach((dependency) => {
      const libraryJson = this.libraries.getLibraryJson(dependency, { exact: true });
      if (!libraryJson) {
        messages.push({
          uberName: uberName,
          text: [
            `Has an optional dependency to "${dependency}", but it is not installed.`,
            'Would be nice to install the dependency, to give the users the full experience.',
          ].join(' '),
          level: 'warning',
        });
      }
    });

    return messages;
  }

  checkForOutdatedDependencyUse(uberName) {
    const messages = [];

    const dependencyList = this.libraries.getDependencies(uberName);

    dependencyList.forEach((dependency) => {
      const { majorVersion, minorVersion } = decomposeUberName(dependency);
      const usedVersion = `${majorVersion}.${minorVersion}`;

      const latestVersion = this.libraries.getLatestVersion(dependency);
      if (!latestVersion) {
        return;
      };

      // eslint-disable-next-line no-magic-numbers
      const latestMinorVersion = latestVersion.split('.').slice(0, 2).join('.');
      if (compareVersions(usedVersion, latestMinorVersion) === -1) {
        messages.push({
          uberName,
          text: [
            `Has a dependency to "${dependency}" with version ${usedVersion},`,
            `but version ${latestMinorVersion} is already available.`,
            'Should be updated to prevent copy&paste limitations.',
          ].join(' '),
          level: 'warning',
        });
      }
    });

    return messages;
  }

  checkForConflictingDependencies(uberName) {
    const dependencyList = this.libraries.compileTotalDependencyList(uberName);

    // Map dependencies to { machineName, version }
    const machineNameList = dependencyList.map((dependency) => {
      const { machineName, majorVersion, minorVersion } = decomposeUberName(dependency);
      return { machineName: machineName, version: `${majorVersion}.${minorVersion}` };
    });

    // Count occurrences of each machineName
    const machineNameCount = {};
    for (const entry of machineNameList) {
      machineNameCount[entry.machineName] = (machineNameCount[entry.machineName] || 0) + 1;
    }

    const duplicates = machineNameList.filter((entry) => machineNameCount[entry.machineName] > 1);
    if (duplicates.length === 0) {
      return [];
    }

    // Group versions by machineName
    const groupedMachineNames = {};
    for (const entry of duplicates) {
      if (!groupedMachineNames[entry.machineName]) {
        groupedMachineNames[entry.machineName] = [];
      }
      groupedMachineNames[entry.machineName].push(entry.version);
    }

    return Object.entries(groupedMachineNames).map(([machineName, versions]) => {
      return {
        uberName: uberName,
        text: [
          'There are conflicting dependencies throughout the dependency tree:',
          `"${machineName}" is required in multiple versions ${versions.join(', ')}.`,
          'Should be harmonized, or in some cases, this can cause content to crash.',
        ].join(' '),
        level: 'warning',
      };
    });
  }
}
