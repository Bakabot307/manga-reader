# Manga Reader — Chrome Extension

A lightweight Chrome extension for reading manga directly from Google Drive. It automatically scans image files in a folder and opens them in a built-in reader with a dark interface, zoom/pan controls, keyboard shortcuts, and more.

---

## Features

- **Auto-scan images** — Detects all image files (JPG, PNG, WebP, GIF) in a Google Drive folder
- **Built-in reader** — Dark-themed manga viewer with smooth navigation
- **Zoom & Pan** — Ctrl+Scroll to zoom, drag to pan
- **Fit Width mode** — Scale images to full width and scroll vertically
- **Lock Zoom** — Preserve zoom level when switching pages
- **Keyboard shortcuts** — Full set of shortcuts for navigation, zoom, and fullscreen
- **Page list sidebar** — Collapsible sidebar with page list for quick jumping
- **Click navigation** — Click the left/right half of the viewer to go to the previous/next page

---

## Download

### Option 1: Download ZIP

1. Click the **Code** button on the GitHub page, then **Download ZIP**
2. Extract the ZIP to a folder

### Option 2: Clone with Git

```bash
git clone https://github.com/Bakabot307/manga-reader.git
```

---

## Manual Installation (Developer Mode)

Since this extension is not published on the Chrome Web Store, you need to install it manually.

### Step 1 — Open the Extensions page

- Open **Google Chrome**
- Navigate to:
  ```
  chrome://extensions
  ```
- Or go to **Menu (three dots)** > **Extensions** > **Manage Extensions**

### Step 2 — Enable Developer Mode

- In the **top-right corner** of the Extensions page, toggle **Developer mode** on

### Step 3 — Load the Extension

- Click **Load unpacked**
- Select the folder containing the extension source code (the folder with `manifest.json`)
- Click **Select Folder**

### Step 4 — Verify

- **Manga Reader** should now appear in the extensions list
- The extension icon will show up in the Chrome toolbar

> **Tip:** Click the puzzle piece icon in the toolbar and pin **Manga Reader** for quick access.

---

## Usage

1. Open **Google Drive** and navigate to a folder containing manga images
2. Click the **Manga Reader** icon in the Chrome toolbar
3. Click **"Load Manga from Google Drive"**
4. The extension will scan the folder and open the reader automatically

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Left/Right Arrow` or `A/D` | Previous / Next page |
| `Space` | Next page |
| `Ctrl + Scroll` | Zoom in / out |
| `Scroll` | Pan (when zoomed) or scroll (Fit Width) |
| `Drag` | Pan (when zoomed) or scroll (Fit Width) |
| `Click` | Left / right half to go prev / next |
| `Enter` | Jump to page (from input) |
| `Esc` | Reset zoom |
| `F` | Toggle fullscreen |

---

## Project Structure

```
manga-reader/
├── manifest.json       # Chrome Extension config (Manifest V3)
├── background.js       # Service worker for message handling
├── content.js          # Content script that scans images from Google Drive
├── popup.html          # Popup UI when clicking the extension icon
├── popup.js            # Popup logic
├── reader.html         # Manga reader UI
├── reader.js           # Reader logic (zoom, pan, navigation)
└── icons/
    ├── icon16.png      # 16x16 icon
    ├── icon32.png      # 32x32 icon
    └── icon128.png     # 128x128 icon
```

---

## Notes

- This extension only works on **Google Drive** pages (`drive.google.com`)
- You must be signed in to Google and have access to the folder
- Images are loaded via Google Photos CDN (`lh3.google.com`), so an internet connection is required
- After updating the source code, go to `chrome://extensions` and click the **reload** button to apply changes

---

## License

MIT License — Free to use and modify.
