# Discord RPC for SoundCloud and VK Music

Shows what you are listening to **on the website** of SoundCloud or VK Music in your Discord profile: track, artist,
artwork and a progress bar ("elapsed / end"). Pause or close the tab and the status disappears by itself.

[Русская версия → README.md](README.md)

| Service | Status |
|---|---|
| SoundCloud (soundcloud.com) | works |
| VK Music (vk.com) | **experimental**: relies on VK's internal player, may behave differently on other accounts/site versions. See [Troubleshooting](#troubleshooting) |

## Requirements

- **Windows 10 or 11** (the installer and autostart are Windows-only; Linux/macOS: see the bottom)
- The **Discord desktop app** (not the browser tab)
- **[Node.js](https://nodejs.org)** 18 or newer (the "LTS" download)
- A browser with **[Tampermonkey](https://www.tampermonkey.net/)** (Firefox, Chrome, Edge...)

## Quick start

1. **Create a Discord application** at https://discord.com/developers/applications → **New Application**, any name.
   On **General Information** copy the **Application ID** (17–20 digits).
2. **Download this project** (**Code → Download ZIP**) and unzip it somewhere permanent with a simple path,
   e.g. `C:\discord-rpc`.
3. **Double-click `install.bat`.** It checks Node.js, installs the dependencies, asks for your Application ID, adds the
   program to autostart (it runs **hidden in the background** at every Windows login) and starts it.
4. **Install the userscripts in Tampermonkey.** Files in `userscripts/`: `soundcloud.user.js`, `vk.user.js`. Open a file
   on GitHub, click **Raw**, and Tampermonkey offers to install it. (Or: Tampermonkey → *Create a new script* → paste the
   whole file → save.) If Tampermonkey asks for access to `127.0.0.1`, choose **Always allow**.
5. **Discord → Settings → Activity Privacy:** enable showing your activity status.
6. Open soundcloud.com or vk.com and play a track. The status appears within a couple of seconds.

## Settings

`companion\config.json` (created by the installer; run `install.bat` again to restart after changes):

| Field | Values | Meaning |
|---|---|---|
| `clientId` | Application ID | required |
| `statusDisplay` | `"artist"` (default) / `"app"` | show the artist or the service name in the status header |
| `showButton` | `false` (default) / `true` | "Listen on …" button with the track link (others see it, you don't) |

If both services play at once, the one started later is shown; when it is paused, the first one comes back.

## Troubleshooting

Check **`companion.log`** in the project folder first.

- *Could not connect to Discord* → start the Discord desktop app and wait a few seconds; it retries by itself.
- *Cannot find module '@xhayper/discord-rpc'* → run `npm install` in the `companion` folder, then `install.bat` again.
- No `Играет: …` line in the log → the browser is not reaching the program: make sure the userscript is enabled and
  access to `127.0.0.1` is allowed in Tampermonkey.
- `Играет: …` is in the log but Discord shows nothing → check step 5 and the `clientId` in `config.json`.
- **VK not working?** On vk.com press `F12` → **Console** and look for `[VK→Discord]` lines ("playing", "not playing" or
  "VK player not found") and attach them to an Issue.

## Uninstall

Run **`uninstall.bat`**, then delete the folder and the userscripts in Tampermonkey.

## Privacy and security

- The scripts send track title, artist, artwork/track links and time **only to `127.0.0.1`** (your own computer).
- The program listens on `127.0.0.1` only, accepts data only from SoundCloud/VK pages (it checks `Origin`, `Host` and a
  custom header), rejects everything else, and only passes links to these services' domains.
- Discord, of course, receives what you listen to, that is what an activity status is.
- The code is small and open: `companion/` and `userscripts/`.

## How it works

```
Browser (Tampermonkey userscript reads the page's player)
        │  once a second, to 127.0.0.1:47612 only
        ▼
Program (Node.js, background) ──► Discord desktop app ──► your status
```

## Linux / macOS

No installer, but everything else works: install Node.js 18+, then
`cd companion && npm install && cp config.example.json config.json` (put your Application ID in) `&& node index.js`.
Install the userscripts the same way and set up autostart with your OS tools.

## Development

`cd companion && npm test` (no Discord or browser needed).

## Credits and disclaimer

- The idea and SoundCloud player selectors come from [soundcloud-rpc](https://github.com/richardhbtz/soundcloud-rpc)
  (MIT); Discord is reached through [@xhayper/discord-rpc](https://www.npmjs.com/package/@xhayper/discord-rpc).
- Unofficial; **not affiliated** with SoundCloud, VK or Discord. Names belong to their owners.
- If a site changes its markup or player, the scripts may stop working until updated.

## License

[MIT](LICENSE)
