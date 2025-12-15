# Catharsis
Catharsis is a Node.js based H5P Content Type Hub Server that you can use to serve [H5P](https://h5p.org) content types, both official ones and your own.

H5P integrations (aka plugins) usually receive new and updated H5P content types from H5P Group's H5P Content Type Hub Server (api.h5p.org/v1/sites and api.h5p.org/v1/content-types). While such a central service has its perks, it is not ideal in all cases, e.g. you wanting to share your content types on that server (H5P Group is a quite huge bottle neck with reviews often taking a year or more), or you wanting to share a limited/expanded set of content types within your organization.

Catharsis offers an alternative.

## Setup
The setup process is supposed to be streamlined in the future.

### Server
#### Prerequisites
- [Node.js](https://nodejs.org/en/download)
- [git](https://git-scm.com/downloads) if you want to clone this repository directly

#### Installation
Either [download the ZIP archive from github](https://github.com/otacke/catharsis/archive/refs/heads/master.zip) and unzip the folder to a suitable location on your server (not your docroot/htdocs directory!) or use git to clone the repository directly, e.g. into your home directory:

```
cd ~
git clone git@github.com:otacke/catharsis
```

You will currently have to fetch dependencies yourself, so you will need to change into the catharsis directory and then use npm to trigger the process:

```
cd ~/catharsis # assuming that `~/catharsis` is the correct path
npm install
```

For production, you should not leave hints on what's running on your server to nosy people, so you should remove some files if you're not certain those cannot be reached from the outside. Note though that this will make updating a little more inconvenient.
```
rm -rf .git
rm -f package.json package-lock.json
```

Catharsis is now installed, but you have to configure it, and you will need to make it available to the outside.

#### Setting up a subdomain
It makes sense to let Catharsis run on a subdomain, e.g. `catharsis.your-domain.com`. Setting that up will depend on where your domain is registered and where your web storage is located. Please consult your web providers in that matter. 

#### Changing the Configuration file
Catharsis will look for a configuration file named `.catharsis-config.json` in its own directory.

By default, Catharsis will try to determine things automatically/use fallbacks to determine the correct URL to serve your files.
- _protocol:_ https
- _hostname:_ localhost
- _port:_ 8080

If these do not suit your use case, please change those in the [configuration file](#changing-the-configuration-file).

The one property that you __must__ set in the configuration is `domain`. It's required to set absolute URLs correctly. Please set in in your [configuration file](#changing-the-configuration-file).

##### Options
| __Property__               | __Type__ | __Description__                                                                 | __Required__ |
| -------------------------- | -------- | ------------------------------------------------------------------------------- | ------------ |
| protocol                   | string   | Protocol to use for URLs, _Default: "https"_                                    | optional     |
| hostname                   | string   | Hostname or static IP address, _Default: "localhost"_                           | optional     |
| domain                     | string   | Domain that hosts catharsis, e.g. `catharsis.your-domain.com`                   | required     |
| listen                     | string   | IP address that Catharsis needs to listen to - may differ from your server IP!  | optional     |
| port                       | number   | Port address, _Default: 8080_                                                   | optional     |
| pidFile                    | string   | Name of file to store the process id when running, _Default: ".server.pid"_     | optional     |
| updateLockFile             | string   | Name of file to indicate an update is in progress, _Default: ".update.lock"_    | optional     |
| detached                   | boolean  | Default server running mode, _Default: false_                                   | optional     |
| mirrors                    | object[] | List of endpoints to mirror hub cache from                                      | optional     |
| mirrors[].url              | string   | URL to endpoint to mirror hub cache from                                        | required     |
| mirrors[].cron             | string   | schedule for mirroring in [crontab syntax](https://linux.die.net/man/5/crontab) | required     |
| mirrors[].referToOrigin    | boolean  | If `true`, redirect request for content type to original server                 | optional     |
| rateLimitWindowMS          | number   | Time in ms for rate limit window for an IP, _Default: 360000_                   | optional     |
| rateLimitMaxRequests       | number   | Maximum number of allowed requests per window and per IP. _Default: 250_        | optional     |

##### Example
An example that forces Catharsis to listen on the IP address `0.0.0.0`, to use the domain "catharsis.your-domain.com", and to mirror H5P Groups's content types from their H5P Content Type Hub server every six hours, and to redirect requests to the content types to the original server would look like this:

```
{
  "listen": "0.0.0.0",
  "domain": "catharsis.your-domain.com",
  "mirrors": [
    {
      "url": "https://api.h5p.org/v1/content-types",
      "cron": "0 0,6,12,18 * * *"
      "referToOrigin": true
    }
  ]
}
```

#### Configuring the web server
In order to make Catharsis accessable from the outside, you need to connect it to the webserver. The step required will vary depending on the web server that you are using, e.g. Apache or nginx.

Note that your web provider may not allow access to the web server configuration directly and may provide custom tools for connecting it to Node.js applications. Please consult your web service provider in that case.

##### Apache
1. Ensure that node.js is installed: `node -v` should display the version of node that you're running.
2. Enable the `proxy` module: `sudo a2enmod proxy`
3. Enable the `proxy_http` module: `sudo a2enmod proxy_http`
4. Restart apache: `sudo systemctl restart apache2`
5. Open or create a new configuration file, for instance: `sudo nano /etc/apache2/sites-available/catharsis.conf`
6. Add the following configuration and replace `catharsis.your-domain.com` with your respective (sub)domain that you set up and `8080` with the port number that you want to use (default is 8080 and this is the safest value to rule out hub clients having trouble).
```
<VirtualHost *:80>
    ServerName catharsis.your-domain.com

    # Proxy settings
    ProxyRequests Off
    ProxyPass / http://localhost:8080/
    ProxyPassReverse / http://localhost:8080/

    # Optional: Set up logging
    ErrorLog ${APACHE_LOG_DIR}/error.log
    CustomLog ${APACHE_LOG_DIR}/access.log combined
</VirtualHost>
```
7. Enable the new site configuration: `sudo a2ensite catharsis.conf`
8. Restart apache: `sudo systemctl restart apache2`

#### nginx
1. Ensure that node.js is installed: `node -v` should display the version of node that you're running.
2. Create a new configuration file for your site, for instance `sudo nano /etc/nginx/sites-available/catharsis`
3. Add the following configuration and replace `catharsis.your-domain.com` with your respective (sub)domain that you have set up and `8080` with the port number that you want to use (default is 8080 and this is the safest value to rule out hub clients having trouble).
```
server {
    listen 80;
    server_name catharsis.your-domain.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Optional: Set up logging
    error_log /var/log/nginx/your-site_error.log;
    access_log /var/log/nginx/your-site_access.log;
}
```
4. Enable the new site configuration by creating a symbolic link: `sudo ln -s /etc/nginx/sites-available/catharsis /etc/nginx/sites-enabled/`
5. Restart nginx: `sudo systemctl restart nginx`

#### Test the configuration
Change back to the directory where you installed Catharsis (assuming `~/catharsis) and start the server.
```
cd ~/catharsis
node ./catharsis.js server start attached
```

Catharsis should now be running and confirm this in the console. Assuming you are using TLS (https) and `catharsis.your-domain.com`, then pointing your browser to `https://catharsis.your-domain/sites` should yield something like
```
{"uuid":"cb1d8123-62ca-41ee-b9a1-16e2067f7998"}
```

Success!?

#### Minimal setup
To get a minimal setup to play with, stop your server (by pressing `Ctrl-C` if you ran it attached like explained above)

use the following [commands](#commands):
```
node ./catharsis.js mirror https://api.h5p.org/v1/content-types
node ./catharsis.js update
node ./catharsis.js server start attached
```

You should now be serving the same content types that H5P Group offers.

#### Further notes
In practice, you will want to let Catharsis be a service that can be started automatically and runs in the background. Depending on your server setup, how you do this will vary. A common way to do this is by relying on `supervisord`.

Assuming that's true in your case and assuming that catharsis is located in `~/catharsis`, you would create a daemon
service file named `catharsis.ini` in `~/etc/services.d` with these contents:

```
[program:catharsis]
directory=~/catharsis
command=node ./catharsis.js server start attached
autostart=true
autorestart=true
environment=NODE_ENV=production
startsecs=30
```

Afterwards, you need to make `supervisord` look for the new file:

```
supervisorctl reread
```

It should return `catharsis-daemon: available`. Then you can start the daemon:

```
supervisorctl update
```
It should return `catharsis-daemon: added process group`.

To later stop/start/restart the daemon you can use
- `supervisorctl stop catharsis-daemon`
- `supervisorctl start catharsis-daemon`
- `supervisorctl restart catharsis-daemon`

### Client
In order for H5P environments to fetch H5P content types from your, some changes are required. You will need to change the respective endpoint URL to your own, e.g. `https://subdomain.your-domain.com/content-types`.

#### Lumi Desktop
As of version 1.0.0-beta.23, the [Lumi desktop application](https://github.com/Lumieducation/Lumi/releases) allows to configure the endpoint for fetching H5P content types.
1. Open Lumi Desktop.
2. Go to the `Lumi` menu in the top bar and choose `Settings`. The settings page will open.
3. Click on `Libraries`. The libraries settings page will open.
4. Find the `Content Types Hub Endpoint` option and change the URL to your endpoint.
5. Restart Lumi Desktop.

#### WordPress
You can install the additional plugin [Sustainum H5P Conent Type Hub Manager](https://github.com/otacke/sustainum-h5p-content-type-hub-manager/) to change the endpoint (base) URL to your server comfortably.

Alternatively: The [H5P plugin for WordPress](https://wordpress.org/plugins/h5p/) used the hardcoded endpoint value from H5P core. You will need to replace it with your endpoint, but beware: Whenever the plugin gets updated, your changes will be overwritten, and the plugin will use the original endpoint.

1. Find the file h5p.classes.php of your WordPress instance.
2. Within the file find `api.h5p.org/v1/content-types` and replace it with your own. Note that you cannot specify the protocol here. The plugin will always try to use `https`, so you your server should support TLS.
3. Go to the admin dashboard of WordPress.
4. In the menu, find the `H5P Content` option and choose the submenu `Libraries`. The library settings page of H5P will open.
5. In the Content Type Cache section, click on the "Update" button.

#### Moodle (H5P plugin)
TODO

#### Moodle (own H5Pintegration)
TODO

#### Drupal
TODO

## Commands
You interact with the server via different commands. The following descriptions assume that you're inside the catharsis directory. You'd run the catharsis.js script with Node.js and pass a command and/or subcommannds and/or arguments

```
node ./catharsis.js COMMAND (SUBCOMMAND) ARGUMENT1 ARGUMENT2 ...
```

### Server
The `server` command operates your server. It accepts the subcommands `start` and `stop`.

#### start
The `start` subcommand will start your server. The `start` command has an optional argument:
- `attached`: The server will run attached to your console and block it. If you close the console (or hit `Ctrl-C`), the server will stop.
- `detached`: The server will run detached from your console in the background. You will need to stop it manually.

Example (starting the server in detached mode):
```
node ./catharsis.js server start detached
```

#### stop
The `stop` subcommand will stop your server.
```
node ./catharsis.js server stop
```

### Mirror
The mirror command will copy the content types from another H5P Content Type Hub Server. It knows the option `refer`.

#### without option
The `mirror` command requires the endpoint URL of another H5P Content Type Hub Server as argument. It will then copy all the H5P content types including metadata such as descriptions or screenshots to your server - if the other server holds a newer version. Note that mirroring manually does not make the newer versions available on your server automatically. You will need to trigger the [update process](#update) first.

Example to mirror all the files from H5P Group's H5P Content Type Hub:
```
node ./catharsis.js mirror https://api.h5p.org/v1/content-types
```

#### with option `refer`
When the `refer` option is used, when a content type is requested, it wil not be served from the local server, but from the original server instead via a redirect.

### Update
The `update` command will scan the `assets/libraries` directory where all the available H5P libraries are stored. Based
on what it finds, it will update the `assets/manifest.json` file accordingly. That file is like an inventory of the libraries and holds metadata that the H5P Hub client expects, e.g. descriptions and links to screenshots.
Based on the manifest, the `assets/hub-registry.json` file will be created/updated. That file is the one that gets served to clients.
Eventually, all the H5P library archives in the `assets/exports` directory will be updated. They contain the H5P files that will be served to clients.

Note that Catharsis does not automatically update the `assets/hub-registry.json` file or the export files. You will need to do this manually once you have made sure that everything is in order after adding or removing libraries or changing manifest entries.

The exception is when you added entries to the `mirrors` list in your configuration file. If the server that is mirrored automatically holds newer libraries, these will be fetched and their respective entries and export files will be updated automatically. Note that this is true for automated mirroring only. Manual mirroring will not trigger the update process.

```
node ./catharsis.js update
```

### Libraries
The libraries command is where you manipulate the available libraries on your server. It knows the subcommands `list`, `add`, `remove`, and `dependencies`

#### list
The `list` subcommand will return a list of all the H5P content types including their version number that can be found inside the `assets/libraries` directory like:

```
FontAwesome 4.5.4
H5P.AFrame 1.0.4
H5P.AFrameAR 3.1.1
...
```

The `list` sub command has an optional argument `runnable` which will suppress editor widgets or mere libraries, so it will only return the list of the actual "runnable" content types that can be picked in the H5P editor.

Example:
```
node ./catharsis.js libraries list
```

#### add
The `add` subcommand is used to add an H5P library (or multiple H5P libraries in one archive) to the `assets/libraries` folder. The subcommand expects an argument that holds the .h5p file with libraries.

Note that after you have added libraries, you need to trigger the [update](#update) command to see an effect.

Example to add the contents of `file.h5p`:
```
node ./catharsis.js libraries add /path/to/my/file.h5p
```

Please refer to the [manifest description] for learning about how to add descriptions, screenshots, etc.

#### remove
The `remove` subcommand is used to remove an H5P library from `assets/libraries`. The subcommand expects the so called machine name of an H5P library as an argument. If there are multiple versions for that machine name installed, Catharsis will issue a message. You will then have to specify the version number of the library as well in order to remove it.

Example to remove version 1.25 of CoursePresentation:
```
node ./catharsis.js libraries remove H5P.CoursePresentation 1.25
```

#### dependencies
The `dependencies` subcommand can be used to retrieve a list of all direct dependencies of a content type. The subcommand expects a machine name of a content type and the version number as arguments.

Example to list all direct dependencies of version 1.25 of Course Presentation:
```
node ./catharsis.js libraries dependencies H5P.CoursePresentation 1.25
```

Result:
```
Dependencies for H5P.CoursePresentation 1.25:
- FontAwesome 4.5
- H5P.JoubelUI 1.3
- H5P.FontIcons 1.0
...
```

#### dependencies-total
The `dependencies-total` subcommand works just like the [dependencies subcommand](#dependencies), but does not only list the direct dependencies, but their dependencies and their dependencies and ...

Note that this command may be renamed and/or the output may change in the future.

### Manifest
The manifest command can be used to interact with the information that will be served to the H5P Hub clients. Currently, there is only the `list` subcommand. Subcommands to modify the values still need to be implemented. For changing those manually, please refer to the [manifest description].

#### list
The `list` subcommand is meant to display metadata about a content type. It requires a `machine` name argument, (e.g. H5P.CoursePresentation) to select what content type the metadata should be listed. You can optionally add a `path` argument (e.g. `description` or `screenshots[1].url`) to only get that specific value.

### Check
The `check` command will perform a number of checks on all the H5P libraries inside the `assets/libraries` directory:
- Check whether the library.json file meets the specificiation.
- Check whether all JavaScript and CSS files that the content types need are available.
- Check whether the semantics.json file meets the specification.
- Check whether content types provide an icon for the H5P Hub client.
- Check whether translation files are named properly
- Check whether a translation template file is included
- Check whether the translation files are semantically correct and include all required properties.
- Check whether a library has mandatory library dependencies that cannot be fulfilled.
- Check whether a library has optional library dependencies that would be nice to have.
- Check whether a library has a dependency to an outdated other library and could be updated.
- Check whether a library has conflicting version dependencies across its dependency tree.

Note that the H5P specification is incomplete and partially even H5P Group's code violate their specification, cmp. e.g. https://h5ptechnology.atlassian.net/browse/HFP-4248 or https://h5ptechnology.atlassian.net/browse/HFP-4249. The `check` command may therefore not find all defects or declare defects where there are none.

```
node ./catharsis check
```

## Background

### How the process currently looks like
H5P Group provides two endpoints for handling content types, but only one is really relevant (at least for now).
- api.h5p.org/v1/content-types
  - for retrieving the list of served content types including metadata such as machineName, version information or links to screenshots and
  - for retrieving an H5P content (type) package that contains the libraries needed to run.
- api.h5p.org/v1/sites for retrieving a UUID that is supposed to identify your server and needs to be passed when using the other endpoint. But: Any UUID can be used. It seems that H5P Group does not limit access to a "valid" id.

H5P integrations use these endpoints to update their "content type cache" - the list of available content types - and to update the content types locally. The latter sometimes is done manually via the [H5P Hub client](https://github.com/h5p/h5p-hub-client), sometimes automatically by scheduled tasks.

The endpoints are hardcoded into the core of H5P, which sits underneath the content types and is shipped with H5P integrations.

### How Catharsis works
Catharsis allows you to offer alternative endpoints to fetch content types from - not from H5P Groups servers, but from your own. That allows you to fully control what content types are served. This can be useful if within your organization you want to limit or extend the number of available content types - there are plenty that are not served by H5P Group. Or maybe you want a feasible way to share your own content types with the H5P community. And there may be more reasons.

Since in most cases the endpoints are fixed in H5P core, Catharsis needs to be accompanied by changes to the platform that H5P runs on. This could be overwriting the endpoints manually or by additional plugins that do the job. Using additional plugins is the better approach, of course, as they allow to make the changes update-proof and they can offer extra features, e. g. fetching content types from multiple H5P Content Type Hub servers, fetching them in regular intervals, etc.

### Manifest description
If you want to add descriptions, screenshots, etc. have a look at `assets/manifest.json` and edit it manually for now. Beware that you must ensure a valid JSON structure.

An entry will look like this (the order of properties may vary):

```
  {
    "id": "H5P.Foo",
    "title": "Foo",
    "createdAt": "2025-05-02T16:56:56.556Z",
    "updatedAt": "2025-05-02T16:56:56.556Z",
    "icon": "https://catharsis.your-domain.com/libraries/H5P.Foo-1.0/icon.svg",
    "license": {
      "id": "MIT",
      "attributes": {
        "useCommercially": true,
        "modifiable": true,
        "distributable": true,
        "sublicensable": true,
        "canHoldLiable": false,
        "mustIncludeCopyright": true,
        "mustIncludeLicense": true
      }
    },
    "owner": "Foo Bar",
    "isRecommended": false,
    "screenshots": [],
    "categories": [
      "Other"
    ],
    "origin": "https://api.h5p.org/v1/content-types",
    "referToOrigin": false,
    "version": {
      "major": 1,
      "minor": 2,
      "patch": 3
    }
    "summary": "",
    "description": "",
    "example": "",
    "tutorial": "",
    "keywords": []
  }
```

The entry will contain values that can be determined from the `library.json` file. You may particularly be interested in:

#### screenshots
You can provide screenshots that will be shown in the H5P Hub client. To do so, rename your screenshots to meet the format `machineName-screenshot-index.extension` where
- `machineName` is the content types machine name (`id` in manifest.json),
- `index` is a numerical index for the screenshots, and
- `extension` is the common file type extension, e.g. `.png` for PNG images.

Example: `H5P.Foo-screenshot-0.png` for the 1st screenshot, `H5P.Foo-screenshot-1.png` for the 2nd screenshot, etc.

Then copy the screenshot files to `assets/files`.

Afterwards, modify the `screenshots` entry inside your `assets/manifest.json` file like this to add the URLs accompanied by an alternative text for the image:

```
"screenshots": [
  {
    "url": "https://catharsis.your-domain.com/files/H5P.Foo-screenshot-0.png",
    "alt": "1st screenshot"
  },
  {
    "url": "https://catharsis.your-domain.com/files/H5P.MultiMediaChoice-screenshot-1.png",
    "alt": "2nd screenshot"
  }
],
```

#### categories
It's not quite clear what this field is used for. It's obviously used for categorizing the content type and could hold multiple categories, but the options are not clear. All content types served by H5P Group only contain one item which is either "Tasks", "Larger Resources" or "Other". Not setting this value does not break anything.

Example: `"categories": [ "Other" ],`

#### summary
This property should hold a very short description of what the content type can bs used for. It will be displayed in the H5P Hub client directly underneath the content type title.

Example: `"summary": "Do foo and bar",`

#### description
This property holds a longer description to tell authors what they can do with this content type. In the H5P Hub client, the description is displayed on the "Details" view.

Example: `"description": "With foo, you can do bar, batz and yada. You can upload x and then let students do z with it.",

#### example
The `example` property is supposed to hold a URL that leads to sample content that the author can try out. If the property is supplied, in the H5P Hub client there will be a button linking to it in the "Details" view. Also, a button will show above the H5P editor form.

Example: `"example": "https://h5p.org/drag-the-words",`

#### tutorial
The `tutorial` property can hold a URL linking to a tutorial that can give authors some idea how to use the content type. If the property is supplied, above the H5P editor form, there will be a button linking to the URL.

Example: `"tutorial": "https://h5p.org/documentation/content-author-guide/tutorials-for-authors/drag-the-words",`

#### keywords
The `keywords` property can hold multiple keywords that are supposed to help the author find the content type when using the search field in the H5P Hub client.

Example: `"keywords": ["foo", "bar", "batz"],`

#### origin
The `origin` property can hold the URL to the content types endpoint on another H5P Content Type Hub Server.

#### referToOrigin
If `referToOrigin` is set to `true` and and `origin` is set, the server will relay the request for a content type library to the original server instead of providing the file. Note that it will be set (or should be) to false if you are serving the same library but in a newer version.

#### version
The `version` property object holds the `major`, `minor` and `patch` version number of the library.

## Future development
Catharsis is not done yet - what piece of software ever is? There are tasks left to do, there are new features that could make sense. See [issues on github](https://github.com/otacke/catharsis/issues)

## License
Catharsis is provided freely as open source software under the [MIT license](https://github.com/otacke/catharsis/blob/master/LICENSE).

## Contact
Catharsis was developed for [Sustainum](https://www.sustainum.de/) by [SNORDIAN](https://snordian.de). Feel free to reach out, but please keep in mind that "people who share their source code do not owe you anything" (Dylan Beattie).
