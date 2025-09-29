import { spawn } from 'child_process';
import { existsSync, readFileSync, unlinkSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import chalk from 'chalk';

import { cleanUpTempFiles } from '../services/fs-utils.js';
import { loadConfig } from '../services/utils.js';

/** @constant {number} KILL_TIMEOUT_MS Timeout for killing the process in ms. */
const KILL_TIMEOUT_MS = 2000;

export default class ServerCmd {

  /**
   * @class
   */
  constructor() {
    this.config = loadConfig();
  }

  /**
   * Start the server.
   * @param {boolean} [detached] If true, start the server in detached mode.
   */
  start(detached = true) {
    if (existsSync(this.config.pidFile)) {
      const pid = parseInt(readFileSync(this.config.pidFile, 'utf8'), 10);
      try {
        process.kill(pid, 0);
        console.log(chalk.yellow(`H5P Content Type Hub Server is already running with PID: ${pid}`));
        return;
      }
      catch (error) {
        unlinkSync(this.config.pidFile);
      }
    }

    const dirname = path.dirname(fileURLToPath(import.meta.url));
    const serverScript = path.join(dirname, 'server-process.js');

    const spawnOptions = {
      cwd: path.join(dirname, '..'),
      stdio: this.config.detached ? 'ignore' : 'inherit',
      detached: this.config.detached,
    };

    const child = spawn('node', [serverScript], spawnOptions);

    const runDetached = detached ?? this.config.detached;

    // If in detached mode, unref the child process to allow parent to exit
    if (runDetached) {
      child.unref();
    }
    else {
      // For non-detached mode, handle process events
      child.on('error', (err) => {
        console.error(chalk.red(`Failed to start H5P Content Type Hub Server: ${err.message}`));
      });

      child.on('exit', (code, signal) => {
        console.log(chalk.yellow(`H5P Content Type Hub Server process exited with code ${code} and signal ${signal}`));

        // Clean up PID file when the server exits
        if (existsSync(this.config.pidFile)) {
          unlinkSync(this.config.pidFile);
        }
      });
    }

    console.log(chalk.blue(
      [
        'H5P Content Type Hub Server is running on',
        `http://${this.config.domain ?? this.config.hostname}:${this.config.port} with PID ${process.pid}`,
      ].join(' '),
    ));

    if (runDetached) {
      console.log(chalk.blue('Use \'node catharsis.js server stop\' to stop the server.'));
    }
    else {
      console.log(chalk.blue('Press Ctrl+C to stop the server.'));
    }
  }

  /**
   * Stop the server.
   */
  stop() {
    console.log(chalk.blue('Cleaning up temporary files'));
    cleanUpTempFiles();

    if (!existsSync(this.config.pidFile)) {
      console.log(chalk.blue('H5P Content Type Hub Server is not running.'));
      return;
    }

    const pid = parseInt(readFileSync(this.config.pidFile, 'utf8'), 10);
    try {
      // Send SIGTERM signal to the process
      process.kill(pid, 'SIGTERM');
      console.log(chalk.blue(`Stop signal sent to H5P Content Type Hub Server (PID: ${pid}).`));

      setTimeout(() => {
        try {
          process.kill(pid, 0);
          console.error(chalk.red('Server did not stop gracefully. Force killing...'));
          process.kill(pid, 'SIGKILL');
        }
        catch (error) {
          // Process doesn't exist anymore, which means it stopped successfully
        }

        if (existsSync(this.config.pidFile)) {
          unlinkSync(this.config.pidFile);
        }
      }, KILL_TIMEOUT_MS);
    }
    catch (error) {
      console.log(chalk.yellow(`No process found with PID: ${pid}. Cleaning up.`));
      unlinkSync(this.config.pidFile);
    }
  }
}
