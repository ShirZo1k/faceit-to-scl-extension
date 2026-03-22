# Privacy Policy — FACEIT to SCL Demo Uploader

**Last updated:** March 22, 2026

## Overview

FACEIT to SCL Demo Uploader is a community browser extension that helps users upload FACEIT match demos to SCL (scl.gg). This extension is not affiliated with SCL or its creators.

## Data Collection

This extension **does not collect, store, or transmit any personal data** to external servers controlled by the extension developer.

## Data Stored Locally

The extension stores the following data locally on your device using the browser's built-in storage (`chrome.storage.local`):

- **Upload history**: A record of which FACEIT match demos have been uploaded to SCL, used solely to avoid duplicate uploads and to display upload status.

This data never leaves your device and is not accessible to the extension developer or any third party.

## Third-Party Services

The extension interacts with the following third-party services on behalf of the user:

- **FACEIT (faceit.com)**: To retrieve match details and download demo files. Requires the user to be logged in to FACEIT.
- **SCL (scl.gg / storage.scl.gg / api.scl.gg)**: To upload demo files and check processing status. Requires the user to be logged in to SCL. The extension uses the user's existing SCL session cookies for authentication.
- **Cloudflare Turnstile**: FACEIT's own CAPTCHA system, used by FACEIT's page (not loaded by the extension) to authorize demo downloads.

The extension does not send any data to any other services or servers.

## Cookies

The extension reads SCL session cookies solely to authenticate API requests to SCL on behalf of the user. No cookies are created, modified, or shared.

## Permissions

- **storage**: Store local upload history.
- **cookies**: Read SCL session cookies for authentication.
- **host_permissions**: Download demo files from FACEIT CDN and upload to SCL storage.

## Changes

This privacy policy may be updated from time to time. Changes will be reflected in this document.

## Contact

For questions about this privacy policy, open an issue at: https://github.com/ShirZo1k/faceit-to-scl-extension/issues
