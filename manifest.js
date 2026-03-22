export default (browser) => ({
  manifest_version: 3,
  version: "0.1.0",
  name: "FACEIT to SCL Demo Uploader",
  description: "Upload FACEIT match demos to SCL",
  browser_specific_settings:
    browser === "firefox"
      ? {
          gecko: {
            id: "faceit-to-scl@extension",
          },
        }
      : undefined,
  icons: {
    48: "icon.48.png",
    128: "icon.128.png",
  },

  content_scripts: [
    {
      matches: ["https://faceit.com/*", "https://www.faceit.com/*"],
      js: ["/faceit/contentScript.js"],
      css: ["styles.inject.css"],
    },
    {
      matches: ["https://faceit.com/*", "https://www.faceit.com/*"],
      js: ["/faceit/web.js"],
      world: "MAIN",
    },
    {
      matches: ["https://scl.gg/*", "https://www.scl.gg/*"],
      js: ["/scl/contentScript.js"],
      world: "MAIN",
    },
    {
      matches: ["https://scl.gg/*", "https://www.scl.gg/*"],
      js: ["/scl/extensionContentScript.js"],
    },
  ],
  background:
    browser === "firefox"
      ? {
          scripts: ["serviceWorker.js"],
        }
      : {
          service_worker: "serviceWorker.js",
          type: "module",
        },
  action: {
    default_popup: "public/popup.html",
  },

  web_accessible_resources: [
    {
      resources: ["faceit/web.js", "styles.inject.css"],
      matches: ["https://faceit.com/*", "https://www.faceit.com/*"],
    },
  ],
  externally_connectable:
    browser === "chrome"
      ? {
          ids: ["*"],
          matches: [
            "https://faceit.com/*",
            "https://www.faceit.com/*",
          ],
        }
      : undefined,
  permissions:
    browser === "chrome"
      ? ["storage", "cookies"]
      : ["storage", "cookies"],
  host_permissions: ["<all_urls>"],
});
