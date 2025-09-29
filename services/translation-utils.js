import validator from 'validator';
import sanitizeHtml from 'sanitize-html';

export const isProbablyLanguageCode = (code) => {
  const lower = code.toLowerCase();

  // Exclude common English words that are also ISO codes
  const exceptions = ['be', 'am', 'no', 'or', 'pi'];
  if (exceptions.includes(lower)) {
    return false;
  }

  if (/^[a-z]{2}/.test(lower)) {
    return validator.isISO6391(lower);
  }

  if (/^[a-z]{2}(-[a-z]{2,4})?$/.test(lower)) {
    return validator.isISO6391(lower.split('-')[0]);
  }

  return false;
};

export const compareLanguages = (candidate, template, errors = [], path = '') => {
  if (Object.keys(candidate).length !== Object.keys(template).length) {
    return {
      errors: [...errors, { path: path || '/', text: 'Not the same number of fields' }],
    };
  }

  for (const [property, value] of Object.entries(template)) {
    // JSON Pointer syntax
    const currentPath = path ? `${path}/${property}` : `/${property}`;

    if (typeof value === 'string') {
      const isString = typeof candidate[property] === 'string';
      if (!isString) {
        errors.push({
          path: currentPath,
          text: `Mismatch for "${property}": Should be a string`,
        });
        continue;
      }

      if (candidate[property].trim().length === 0) {
        errors.push({
          path: currentPath,
          text: `Empty value for "${property}"`,
        });
        continue;
      }

      const isSafe = isStringSafe(candidate[property]);
      if (!isSafe) {
        errors.push({
          path: currentPath,
          text: `Unsafe translation for "${property}": ${candidate[property]}`,
        });
      }
    }
    else {
      // Template has a property that is missing in the candidate
      if (!candidate[property]) {
        errors.push({
          path: currentPath,
          text: `Missing translation for "${property}"`,
        });
        continue;
      }

      if (Object.keys(candidate[property]).length !== Object.keys(template[property]).length) {
        errors.push({
          path: currentPath,
          text: [
            `Mismatch for "${property}": Different length between `,
            `${JSON.stringify(candidate[property])} VS ${JSON.stringify(template[property])}`,
          ].join(' '),
        });
        continue;
      }
      compareLanguages(candidate[property], template[property], errors, currentPath);
    }
  }

  return { errors };
};

export const isStringSafe = (translationString) => {
  const sanitizedString = sanitizeHtml(
    translationString, {
      allowedClasses: {
        table: ['h5p-table'],
      },
      allowedAttributes: {
        th: ['scope'],
        a: ['target', 'href'],
      },
    });

  return translationString === sanitizedString;
};

export const removeUntranslatables = (field, name, parentName) => {
  if (Array.isArray(field)) {
    const processed = field
      .map((item) => removeUntranslatables(item, undefined, name))
      .filter((item) => item !== undefined);
    return processed.length > 0 ? processed : undefined;
  }

  if (typeof field === 'object' && field !== null) {
    let newField = Array.isArray(field) ? [] : {};

    // Special handling for options/select/library
    if (field.options && (field.type === 'select' || field.type === 'library')) {
      // Copy all properties except 'default'
      for (const [property, value] of Object.entries(field)) {
        if (property !== 'default') {
          const result = removeUntranslatables(value, property, name);
          if (result !== undefined) {
            newField[property] = result;
          }
        }
      }
    }
    else {
      for (const [property, value] of Object.entries(field)) {
        const result = removeUntranslatables(value, property, name);
        if (result !== undefined) {
          newField[property] = result;
        }
      }
    }

    // Remove empty objects unless parentName is 'fields'
    if (parentName !== 'fields' && Object.keys(newField).length === 0) {
      return;
    }

    // Remove unnecessary nested 'field' structures with only empty objects
    if (Array.isArray(newField.fields)) {
      const allEmpty = newField.fields.every(
        (subField) => typeof subField === 'object' && Object.keys(subField).length === 0,
      );
      if (allEmpty && Object.keys(newField).length !== 1) {
        delete newField.fields;
      }
      else if (allEmpty) {
        return;
      }
    }

    return newField;
  }

  if (!isFieldTranslatable(name, field)) {
    return;
  }

  return field;
};

/**
 * Check if a semantics field property is translatable.
 * @param {string} property An object's property.
 * @param {object} value Value of the property.
 * @returns {boolean} True, if item is translatable. False otherwise.
 */
export const isFieldTranslatable = (property, value) => {
  if (!property || !value) {
    return false;
  }

  if (
    property === 'label' ||
    property === 'entity' ||
    property === 'explanation' ||
    property === 'example' ||
    property === 'description' ||
    property === 'placeholder'
  ) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  if (property === 'default') {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return false; // Empty strings
    }
    if (!isNaN(value)) {
      return false; // Numeric value
    }
    if (!value.replace(/<\/?[a-z][^>]*>/ig, '')) {
      return false; // Empty HTML tag
    }

    // Color code regexes
    const colorRegexes = [
      /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
      /^#([A-Fa-f0-9]{8}|[A-Fa-f0-9]{4})$/,
      /^rgb(a)?\([\d\s,\.\/%]+\)$/,
      /^hsl(a)?\([\d\s,\.\/%]+\)$/,
      /^hsv?[\d\s,\.\/%]*$/,
      /^hwb\([\w\d\s,\.\/%]+\)$/,
    ];
    if (colorRegexes.some((re) => re.test(value))) {
      return false;
    }

    if (isProbablyLanguageCode(value)) {
      return false;
    }

    return true;
  }

  return false;
};
