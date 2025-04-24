#!/usr/bin/env node
import { existsSync, mkdirSync } from 'fs';

import chalk from 'chalk';

import LibrariesCmd from './commands/libraries-cmd.js';
import MirrorCmd from './commands/mirror-cmd.js';
import ServerCmd from './commands/server-cmd.js';
import UpdateCmd from './commands/update-cmd.js';

const DEFAULT_FOLDERS = ['assets', 'assets/libraries', 'assets/exports', 'assets/temp', 'assets/files'];

// TODO: Add validators
// TODO: Add interface to edit manifest.json
// TODO: [Add interface to edit config (like git?)]
// TODO: [Make export files content archives, not mere library archives]
// TODO: Add browse mode

class H5PContentTypeHub {
  constructor() {
    this.setupFolders();

    this.serverCmd = new ServerCmd();
    this.updateCmd = new UpdateCmd();
    this.mirrorCmd = new MirrorCmd();
    this.librariesCmd = new LibrariesCmd();

    this.commands = {
      server: (...args) => this.handleServer(args),
      update: (...args) => this.handleUpdate(args),
      mirror: (...args) => this.handleMirror(args),
      libraries: (...args) => this.handleLibraries(args),
    };
  }

  handleServer(args) {
    const [command, mode] = args;

    switch (command) {
      case 'start':
        if (mode === 'detached') {
          this.serverCmd.start(true);
        }
        else if (mode === 'attached') {
          this.serverCmd.start(false);
        }
        else {
          this.serverCmd.start();
        }
        break;

      case 'stop':
        this.serverCmd.stop();
        break;

      default:
        console.warn(chalk.red('Missing or invalid server command'));
        break;
    }
  }

  async handleUpdate() {
    await this.updateCmd.updateReleases();
  }

  async handleMirror(args) {
    const [mirrorURL] = args;
    if (!mirrorURL) {
      console.warn(chalk.red('> Missing mirror URL'));
      return;
    }

    await this.mirrorCmd.mirror(mirrorURL);
  }

  async handleLibraries(args) {
    const [command, arg1, arg2] = args;

    switch (command) {
      case 'list':
        if (!arg1) {
          this.librariesCmd.list();
        }
        else if (arg1 === 'runnable') {
          this.librariesCmd.list({ runnableOnly: true });
        }
        else {
          console.warn(chalk.red('> Invalid library command'));
        }
        break;

      case 'add':
        if (!arg1) {
          console.warn(chalk.red('> Missing archive name'));
          return;
        }
        await this.librariesCmd.add(arg1);
        break;

      case 'remove':
        if (!arg1) {
          console.warn(chalk.red('> Missing machine name/uber name'));
          return;
        }
        const machineName = arg2 ? `${arg1} ${arg2}` : arg1;
        await this.librariesCmd.remove(machineName);
        break;

      default:
        console.warn(chalk.red('> Missing library command'));
        break;
    }
  }

  setupFolders() {
    DEFAULT_FOLDERS.forEach((folder) => {
      if (!existsSync(folder)) {
        mkdirSync(folder);
      }
    });
  }

  executeCommand(command, args) {
    if (!command) {
      console.warn(chalk.red('> Please provide a command'));
    }
    else if (typeof this.commands[command] === 'function') {
      this.commands[command](...args);
    }
    else {
      console.warn(chalk.red(`> '${command}' is not a valid command`));
    }
  }
}

const h5pContentTypeHub = new H5PContentTypeHub();
// eslint-disable-next-line no-magic-numbers
h5pContentTypeHub.executeCommand(process.argv[2], process.argv.slice(3));
