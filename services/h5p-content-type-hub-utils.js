import crypto from 'crypto';

/**
 * Fetch list of availablke content types from the specified URL.
 * @param {string} url URL to fetch the content types list from.
 * @returns {Promise<JSON|string>} - JSON object containing content types or an error message.
 */
export const fetchContentTypeCache = async (url) => {
  const uuid = crypto.randomUUID();

  const formData = new FormData();
  formData.append('uuid', uuid);

  try {
    const response = await fetch(url, { method: 'POST', body: formData });

    if (!response.ok) {
      return `Error: HTTP status ${response.status}`;
    }

    const data = await response.json();
    return data.contentTypes;
  }
  catch (error) {
    return `Error fetching content types: ${error.message}`;
  }
};

/**
 * Fetch H5P content type from specified URL.
 * @async
 * @param {string} url URL to fetch the content type from.
 * @returns {Promise<Blob|string>} Content type blob or an error message.
 */
export const fetchH5PContentType = async (url) => {
  try {
    const response = await fetch(url, { method: 'POST' });

    if (!response.ok) {
      return `Error: HTTP status ${response.status}`;
    }

    return await response.blob();
  }
  catch (error) {
    return `Error downloading content type: ${error.message}`;
  }
};
