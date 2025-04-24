import crypto from 'crypto';
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import chalk from 'chalk';
import express from 'express';
import multer from 'multer';
import cron from 'node-cron';

import MirrorCmd from './mirror-cmd.js';
import UpdateCmd from './update-cmd.js';
import { clearDirectorySync } from '../services/fs-utils.js';
import { isValidUUID, loadConfig } from '../services/utils.js';

/** @constant {number} HTTP_ERROR_BAD_REQUEST Error code for bad request. */
const HTTP_ERROR_BAD_REQUEST = 400;

/** @constant {number} HTTP_ERROR_NOT_FOUND Error code for file not found. */
const HTTP_ERROR_NOT_FOUND = 404;

class H5PServer {

  /**
   * @class
   */
  constructor() {
    this.config = loadConfig();

    this.dirname = path.dirname(fileURLToPath(import.meta.url));

    this.app = express();
    this.upload = multer();

    this.cronJobs = [];
    this.mirror = new MirrorCmd();
    this.update = new UpdateCmd();

    this.server = null;
  }

  /**
   * Start cron jobs.
   */
  startCronJobs() {
    (this.config.mirrors ?? []).forEach((mirror) => {
      console.warn(chalk.blue(`Scheduling mirroring for ${mirror.url}`));

      const cronJob = cron.schedule(mirror.cron, async () => {
        const uberNamesUpdated = await this.mirror.mirror(mirror.url);

        this.update.updateServedData(uberNamesUpdated);
      });

      this.cronJobs.push(cronJob);
      cronJob.start();
    });
  }

  /**
   * Stop cron jobs.
   */
  stopCronJobs() {
    if (!this.cronJobs.length) {
      return;
    }

    console.warn(chalk.blue('Unscheduling mirroring'));
    this.cronJobs.forEach((job) => {
      job.stop();
    });
    this.cronJobs = [];
  }

  /**
   * Clean up temporary files
   */
  cleanUpTempFiles() {
    console.warn(chalk.blue('Cleaning up temporary files'));
    clearDirectorySync(path.join(this.dirname, '..', 'assets', 'temp'));
  }

  /**
   * Set up routes and middleware
   */
  setupMiddleware() {
    this.app.use('/libraries', express.static('assets/libraries'));
    this.app.use('/files', express.static('assets/files'));

    this.app.use(express.urlencoded({ extended: true }));

    // Extra error handler, since multer crashes when receiving malformed requests
    this.app.use((err, req, res, next) => {
      if (err instanceof multer.MulterError) {
        return res.status(HTTP_ERROR_BAD_REQUEST).json({});
      }
      next(err);
    });
  }

  /**
   * Configure API routes
   */
  setupRoutes() {
    this.app.get('/sites', this.handleGetSites.bind(this));
    this.app.post('/sites', this.handlePostSites.bind(this));

    this.app.get('/content-types', this.upload.none(), this.handleGetHubRegistry.bind(this));
    this.app.post('/content-types', this.upload.none(), this.handleGetHubRegistry.bind(this));

    this.app.get('/content-types/:machineName', this.handleGetContentType.bind(this));
    this.app.post('/content-types/:machineName', this.handleGetContentType.bind(this));
  }

  /**
   * Handle GET /sites.
   * @param {Request} req Request object.
   * @param {Response} res Response object.
   */
  handleGetSites(req, res) {
    res.json({ uuid: crypto.randomUUID() });
  }

  /**
   * Handle POST /sites.
   * @param {Request} req Request object.
   * @param {Response} res Response object.
   */
  handlePostSites(req, res) {
    res.json({ uuid: crypto.randomUUID() });
  }

  /**
   * Handle POST /content-types.
   * @param {Request} req Request object.
   * @param {Response} res Response object.
   * @returns {object|undefined} JSON response.
   */
  handleGetHubRegistry(req, res) {
    if (!req.body?.uuid || !isValidUUID(req.body.uuid)) {
      return res.status(HTTP_ERROR_BAD_REQUEST).json({ error: 'Missing or invalid UUID' });
    }

    const filePath = path.join(this.dirname, '..', 'assets', 'hub-registry.json');
    const hubRegistryData = JSON.parse(readFileSync(filePath, 'utf8'));
    res.json(hubRegistryData);
  }

  /**
   * Handle POST /content-types/:machineName
   * @param {Request} req Request object.
   * @param {Response} res Response object.
   * @returns {object|undefined} JSON response.
   */
  handleGetContentType(req, res) {
    const { machineName } = req.params;

    const exportsPath = path.join(this.dirname, '..', 'assets', 'exports');
    const exportFiles = readdirSync(exportsPath);

    const exportFile = exportFiles.find((file) => file.startsWith(`${machineName}-`));
    if (!exportFile) {
      return res.status(HTTP_ERROR_NOT_FOUND).json({ error: 'Export not found' });
    }

    res.download(path.join(exportsPath, exportFile));
  }

  /**
   * Set up signal handlers for graceful shutdown
   */
  setupSignalHandlers() {
    process.on('SIGINT', this.shutdown.bind(this));
    process.on('SIGTERM', this.shutdown.bind(this));
  }

  /**
   * Gracefully shut down the server
   */
  shutdown() {
    this.stopCronJobs();
    this.cleanUpTempFiles();

    console.warn(chalk.blue('H5P Content Type Hub Server stopping...'));
    this.server.close(() => {
      console.warn(chalk.blue('H5P Content Type Hub Server stopped successfully.'));
      process.exit(0);
    });
  }

  /**
   * Start the server
   */
  start() {
    this.startCronJobs();

    this.setupMiddleware();
    this.setupRoutes();
    this.setupSignalHandlers();

    this.server = this.app.listen(this.config.port, this.config.ip, () => {
      writeFileSync(this.config.pidFile, process.pid.toString());
    });
  }
}

const server = new H5PServer();
server.start();
