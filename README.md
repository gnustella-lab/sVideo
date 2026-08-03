# sVideo

A static video studio focused on privacy. Every operation runs in the browser, with no uploads, accounts, cookies, or analytics.

## Features

- metadata removal by re-encoding the frames and stripping known GPS, EXIF, XMP, user data, and writing-app blocks from MP4, MOV, and WebM files;
- local detection of known ISO BMFF (mp4/mov) and EBML (webm) metadata blocks;
- pixelation, blur, and solid covers for selected areas, applied to every frame;
- resizing with optional aspect ratio preservation;
- bitrate control for smaller files;
- conversion between MP4 and WebM using the browser's MediaRecorder;
- anonymous filenames generated with `crypto.getRandomValues`;
- output verification before download (the clean copy is scanned again before it is offered);
- offline app shell caching with a Service Worker;
- responsive and accessible interface.

## Run locally

Use a simple HTTP server because Service Workers do not run on `file://` URLs:

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Publish to GitHub Pages

This project includes `.github/workflows/deploy-pages.yml`.

1. Create a public GitHub repository named `sVideo`.
2. Push these files to the `main` branch.
3. Open `Settings > Pages` in GitHub.
4. Under `Build and deployment`, select `GitHub Actions`.
5. The workflow will publish the site automatically after every push to `main`.

With GitHub CLI:

```bash
git init
git add .
git commit -m "feat: create sVideo"
git branch -M main
gh repo create sVideo --public --source=. --remote=origin --push
```

If GitHub does not enable Pages automatically, select `GitHub Actions` in the repository Pages settings.

## Privacy and limitations

The browser decodes the source file and exports a fresh copy through the Canvas API and MediaRecorder. The generated file is then scanned again and any remaining metadata blocks are stripped from the container before the download starts.

- Export runs in real time: a 1-minute clip takes about 1 minute to re-encode.
- The audio track is preserved by default. Audio plays during the export so it can be captured; keep the tab visible.
- Color, audio, and codec details may change slightly during re-encoding.
- Very large videos depend on browser memory and Canvas limits.
- The tool does not detect faces or text automatically. The user manually selects areas to hide.
- The debug page (`?debug`) exposes `window.__sVideoTest` with the scanner and strippers for manual verification.

## Project structure

```text
index.html                 interface and content
styles.css                 visual design and responsive layout
app.js                     local video processing
sw.js                      offline app shell cache
manifest.webmanifest       installable app metadata
favicon.svg                vector icon
.github/workflows/         GitHub Pages deployment
```

## License

Licensed under the MIT License. See [LICENSE](LICENSE).
