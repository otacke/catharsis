#!/usr/bin/env node
import { existsSync, mkdirSync } from 'fs';

import chalk from 'chalk';

import CheckCmd from './commands/check-cmd.js';
import LibrariesCmd from './commands/libraries-cmd.js';
import ManifestCmd from './commands/manifest-cmd.js';
import MirrorCmd from './commands/mirror-cmd.js';
import ServerCmd from './commands/server-cmd.js';
import UpdateCmd from './commands/update-cmd.js';
import Manifest from './models/manifest.js';
import HubRegistry from './models/hub-registry.js';

const DEFAULT_FOLDERS = ['assets', 'assets/libraries', 'assets/exports', 'assets/temp', 'assets/files'];

// TODO: Add check "ubername" command
// TODO: Add interface to edit manifest.json
// TODO: [Add interface to edit config (like git?)]
// TODO: [Make export files content archives, not mere library archives]
// TODO: Add browse mode
// TODO: Clean up .update.lock when shutting down.

class H5PContentTypeHub {
  constructor() {
    this.setupFolders();
    this.setupFiles();

    this.serverCmd = new ServerCmd();
    this.updateCmd = new UpdateCmd();
    this.mirrorCmd = new MirrorCmd();
    this.librariesCmd = new LibrariesCmd();
    this.manifestCmd = new ManifestCmd();
    this.checkCmd = new CheckCmd();

    this.commands = {
      server: (...args) => this.handleServer(args),
      update: (...args) => this.handleUpdate(args),
      mirror: (...args) => this.handleMirror(args),
      libraries: (...args) => this.handleLibraries(args),
      check: (...args) => this.handleCheck(args),
      manifest: (...args) => this.handleManifest(args),
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
        console.log(chalk.red('Missing or invalid server command'));
        break;
    }
  }

  async handleUpdate() {
    await this.updateCmd.updateReleases();
  }

  async handleMirror(args) {
    const [mirrorURL] = args;
    if (!mirrorURL) {
      console.log(chalk.red('> Missing mirror URL'));
      return;
    }

    await this.mirrorCmd.mirror(mirrorURL);
  }

  async handleLibraries(args) {
    const [command, arg1, arg2] = args;
    let machineName;

    switch (command) {
      case 'list':
        if (!arg1) {
          this.librariesCmd.list();
        }
        else if (arg1 === 'runnable') {
          this.librariesCmd.list({ runnableOnly: true });
        }
        else {
          console.log(chalk.red('> Invalid library command'));
        }
        break;

      case 'add':
        if (!arg1) {
          console.log(chalk.red('> Missing archive name'));
          return;
        }
        await this.librariesCmd.add(arg1);
        break;

      case 'remove':
        if (!arg1) {
          console.log(chalk.red('> Missing machine name/uber name'));
          return;
        }
        machineName = arg2 ? `${arg1} ${arg2}` : arg1;
        await this.librariesCmd.remove(machineName);
        break;

      case 'dependencies':
        if (!arg1) {
          console.log(chalk.red('> Missing machine name/uber name'));
          return;
        }
        machineName = arg2 ? `${arg1} ${arg2}` : arg1;
        this.librariesCmd.listDependencies(machineName);
        break;

      case 'dependencies-total':
        if (!arg1) {
          console.log(chalk.red('> Missing machine name/uber name'));
          return;
        }
        machineName = arg2 ? `${arg1} ${arg2}` : arg1;
        this.librariesCmd.listTotalDependencies(machineName);
        break;

      default:
        console.log(chalk.red('> Missing library command'));
        break;
    }
  }

  async handleCheck(args) {
    const [command, arg1, arg2] = args;

    switch (command) {
      default:
        this.checkCmd.checkAll();
        break;
    }
  }

  handleManifest(args) {
    const [command, machineName, path, value] = args;

    switch (command) {
      case 'list':
        if (!machineName) {
          console.log(chalk.red('> Missing machine name'));
          return;
        }

        this.manifestCmd.list(machineName, path, value);
        break;

      case 'edit':
        if (!machineName || !path || !value) {
          console.log(chalk.red('> Missing machine name, path or value'));
          return;
        }

        break;
      default:
        console.log(chalk.red('Missing or invalid manifest command'));
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

  setupFiles() {
    if (!existsSync('assets/manifest.json')) {
      const manifest = new Manifest();
      manifest.read();
      manifest.write();
    }

    if (!existsSync('assets/hub-registry.json')) {
      const hubRegistry = new HubRegistry();
      hubRegistry.write();
    }
  }

  executeCommand(command, args) {
    if (!command) {
      console.log(chalk.red('> Please provide a command'));
    }
    else if (typeof this.commands[command] === 'function') {
      this.commands[command](...args);
    }
    else {
      console.log(chalk.red(`> '${command}' is not a valid command`));
    }
  }
}

const h5pContentTypeHub = new H5PContentTypeHub();
// eslint-disable-next-line no-magic-numbers
h5pContentTypeHub.executeCommand(process.argv[2], process.argv.slice(3));
