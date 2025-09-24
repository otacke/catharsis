import { existsSync, lstatSync, readdirSync, rmdirSync, statSync, unlinkSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Clean up temporary files
 */
export const cleanUpTempFiles = () => {
  try {
    const dirname = path.dirname(fileURLToPath(import.meta.url));
    clearDirectorySync(path.join(dirname, '..', 'assets', 'temp'));
  }
  catch (error) {
    console.error('Error cleaning up temporary files:', error);
  }
};

/**
 * Recursively remove a directory and its contents.
 * @param {string} dirPath The path to the directory to remove.
 */
export const removeDirectorySync = (dirPath) => {
  if (!existsSync(dirPath)) {
    return;
  }

  const items = readdirSync(dirPath);

  items.forEach((item) => {
    const itemPath = path.join(dirPath, item);
    const stats = lstatSync(itemPath);

    if (stats.isDirectory()) {
      removeDirectorySync(itemPath);
    }
    else {
      unlinkSync(itemPath);
    }
  });

  rmdirSync(dirPath);
};

/**
 * Remove all files and directories within a specified directory synchronously.
 * @param {string} dirPath The path to the directory to clear.
 */
export const clearDirectorySync = (dirPath) => {
  if (!existsSync(dirPath)) {
    return;
  }

  const files = readdirSync(dirPath);

  files.forEach((file) => {
    const filePath = path.join(dirPath, file);
    const stats = statSync(filePath);

    if (stats.isDirectory()) {
      clearDirectorySync(filePath);
      rmdirSync(filePath);
    }
    else {
      unlinkSync(filePath);
    }
  });
};
