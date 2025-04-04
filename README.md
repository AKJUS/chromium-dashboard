Chrome Platform Status
==================

### Mission

[chromestatus.com](https://chromestatus.com/) is the official tool used for for tracking feature launches in Blink (the browser engine that powers Chrome and many other web browsers).  This tool guides feature owners through our [launch process](https://www.chromium.org/blink/launching-features/) and serves as a primary source for developer information that then ripples throughout the web developer ecosystem.

### Get the code

For a one-click setup that leverages devcontainers, check out the devcontainer
[README](.devcontainer/README.md). Otherwise, to continue setting up locally:

    git clone https://github.com/GoogleChrome/chromium-dashboard

### Installation
1. Install gcloud and needed components:
    1.  Before you begin, make sure that you have a java JRE (version 8 or greater) installed. JRE is required to use the DataStore Emulator and [openapi-generator-cli](https://github.com/OpenAPITools/openapi-generator-cli).
    1. [Google App Engine SDK for Python](https://cloud.google.com/appengine/docs/standard/python3/setting-up-environment). Make sure to select Python 3.
    1. `gcloud init`
    1. `gcloud components install cloud-datastore-emulator`
    1. `gcloud components install beta`
1. Install other developer tools commands
    1. node and npm.
    1. Gulp: `npm install --global gulp-cli`
    1. Python virtual environment: `sudo apt install python3.11-venv`
1. We recommend using an older node version, e.g. node 18
    1. Use `node -v` to check the default node version
    2. `nvm use 18` to switch to node 18
1. `cd chromium-dashboard`
1. Install JS an python dependencies: `npm run setup`
    1. Note: Whenever we make changes to package.json or requirements.txt, you will need to run `npm run clean-setup`.


If you encounter any error during the installation process, the section **Notes** (later in this README.md) may help.

### Developing

To start the main server and the notifier backend, run:

```bash
npm start
```
Then visit `http://localhost:7777/`.

To start front end code watching (sass, js lint check, babel, minify files), run

```bash
npm run watch
```

To run lint & lit-analyzer:

```bash
npm run lint
```

To run unit tests:

```bash
npm test
```

This will start a local datastore emulator, run unit tests, and then shut down the emulator.

To update test_html_rendering.html, modify the `test_html_rendering` method in
the corresponding test file, uncomment the line that looks like:

```python
 # TESTDATA.make_golden(template_text, 'test_html_rendering.html')
```

Then run the test again (and maybe one more time), and then you can revert
your change of the test files.

To run the Playwright visual tests (aka end-to-end tests), the command to use is:
```bash
npm run pwtests
```

If there are errors, they will be displayed in the console.
If you need to update any of the screenshot images, you will see differences in
the `packages/playwright/test-results` directory, and if they look correct,
then you can update _all_ images for all tests with:
```bash
npm run pwtests-update
```

The updated images are also added to the __screenshots__ directory.  Images that
did not need to be updated do not show up as having been changed.
If you change the test file names, or the test method names, or the screenshot
image file names, then new files will be generated, and you will need to manually delete the old files.  You could simply delete all screenshots and
update all, but that will take a fairly long time.

You can update images for just one test file by adding `--filename=some_pwtest.js`
to the `pwtests-update` command.  The `some_pwtest.js` name does not need to be
a full path.

If there are error reported by the GitHub CI playwright action, you can look at
the error log, but if the problem is a difference in some of the images, you
should probably download the artifact `.zip` file containing all the differences.

There is some additional information for developers in developer-documentation.md.

### Origin Trials
To test the functionality of this application locally that interacts with data from the Origin Trials API, an API key will need to be acquired. To do this, run the following command:

```bash
npm run dev-ot-key
```

Note: *Only developers with access to the cr-status-staging GCP project will be able to successfully run this command. If you need to test this and you don't have access, open an issue.*

**Notes**

- If you get an error saying `No module named protobuf` or `No module named six` or `No module named enum` , try installing them locally with `pip install six enum34 protobuf`.

- When installing the GAE SDK, make sure to get the version for python 3.

- If you run the server locally, and then you are disconnected from your terminial window, the jobs might remain running which will prevent you from starting the server again.  To work around this, use `npm run stop-emulator; npm stop`.  Or, use `ps aux | grep gunicorn` and/or `ps aux | grep emulator`, then use the unix `kill -9` command to terminate those jobs.

- If you need to test or debug anything to do with dependencies, you can get a clean start by running `npm run clean-setup`.

- Occasionally, the Google Cloud CLI will requires an update, which will cause a failure when trying to run the development server with `npm start`. An unrelated error message `Failed to connect to localhost port 15606 after 0 ms: Connection refused` will appear. Running the `gcloud components update` command will update as needed and resolve this issue.

#### Blink components

Chromestatus currently gets the list of Blink components from the file `hack_components.py`.

#### Seed the blink component owners

Visit http://localhost:7777/admin/blink/populate_blink to see the list of Blink component owners.

#### Debugging / settings

[`settings.py`](https://github.com/GoogleChrome/chromium-dashboard/blob/master/settings.py) contains a list
of globals for debugging and running the site locally.

### Deploying

If you have uncommitted local changes, the appengine version name will end with `-tainted`.
It is OK to test on staging with tainted versions, but everything should be committed
(and thus not tainted) before staging a version that can later be pushed to prod.

**Note** you need to have admin privileges on the `cr-status-staging` and `cr-status`
cloud projects to be able to deploy the site.

Run the npm target:

    npm run staging

Open the [Google Developer
Console for the staging site](https://console.cloud.google.com/appengine/versions?project=cr-status-staging)
and flip to the new version by selecting from the list and clicking *MIGRATE TRAFFIC*. Make sure to do this for both the 'default' service as well as for the 'notifier' service.

Alternatively, run `npm run staging-rc` to  upload the same code to a version named `rc` for "Release candidate".  This is the only version that you can test using Google Sign-In at `https://rc-dot-cr-status-staging.appspot.com`.

If manual testing on the staging server looks good, then repeat the same steps to deploy to prod:

    npm run deploy

Open the [Google Developer
Console for the production site](https://console.cloud.google.com/appengine/versions?project=cr-status)

The production site should only have versions that match versions on staging.

### LICENSE

Copyright (c) 2013-2022 Google Inc. All rights reserved.

Apache2 License.


[![Analytics](https://ga-beacon.appspot.com/UA-39048143-2/GoogleChrome/chromium-dashboard/README)](https://github.com/igrigorik/ga-beacon)
