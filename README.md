# FACEIT to SCL Demo Uploader

> **Community extension** — This project is **not affiliated with, endorsed by, or associated with SCL (scl.gg) or its creators** in any way. Use at your own risk.

A Chrome/Firefox extension that lets you upload FACEIT match demos to [SCL](https://scl.gg) with one click, directly from the FACEIT match page.

I was inspired by the [FACEIT to Leetify extension](https://github.com/CSNADESgg/faceit-to-leetify-extension) when I built this. A lot of their source code has been re-used here but modified with the help of Claude. As mentioned in the FAQ below, I built this by reading the network tab on Chrome of SCL, so it relies on their internal API — they may change it at any time which could possibly break the extension.

Feel free to fork, modify, or create PRs.

## Features

- One-click upload from any FACEIT match page to SCL
- Supports multi-map matches (bo3/bo5) — each map gets its own upload button
- Real-time progress bar with download, upload, and parsing status
- Detects if a demo already exists on SCL (shows "ALREADY ON SCL")
- Progress widget on scl.gg so you can see upload status while browsing SCL
- Updates the SCL "Import FACEIT Demo" dialog when a demo becomes available
- Works on Chrome and Firefox

## How to use

1. Install the extension
2. Make sure you're logged in to both [FACEIT](https://www.faceit.com) and [SCL](https://scl.gg)
3. Navigate to a FACEIT match page
4. Click the **Upload to SCL** button
5. Wait for the download, upload, and parsing to complete

## Building from source

```bash
# Install dependencies
npm install

# Build for Chrome and Firefox
npm run build

# Output is in dist/chrome/ and dist/firefox/
```

To generate the extension icons:

```bash
node generate-icons.js
```

Load the extension in Chrome:
1. Go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist/chrome` folder

## FAQ

**Q: Why would I use this extension?**
A: SCL seems to hit some FACEIT API limits from time to time, so I use this as I hate to download/upload and delete demos manually.

**Q: Does this use any bandwidth on the user's end?**
A: Yes, unfortunately, SCL doesn't have an open endpoint to download from URL, so this extension downloads locally, then uploads from local temp. However, it all happens automatically so you just have to sit back and look at the progress.

**Q: How long does it take to import a match from FACEIT to SCL using this?**
A: I use cabled internet, and for me it takes about 40s for a demo, so I'm actually impressed.

**Q: Is it allowed to use this by SCL?**
A: I don't know, I couldn't find anything in their ToS that said otherwise. I built this with the help of reading the network tab on SCL though, so it relies on their internal API which may change at any moment.

## Disclaimer

This is an unofficial community project. It is not developed, maintained, or supported by SCL or its team. The extension interacts with SCL's internal APIs which are not officially documented or supported — they may change without notice, which could break this extension at any time.

## Credits

- Inspired by and based on [FACEIT to Leetify Demo Uploader](https://github.com/CSNADESgg/faceit-to-leetify-extension) by [CSNADES.gg](https://csnades.gg)
- Built with the help of [Claude](https://claude.ai)

## License

GPLv3
