# Site Editor

A visual editor for plain HTML/CSS websites. Open your site, change it like a design file, and download the updated files.

## Run it

Host this folder anywhere that serves static files. The simplest way is its own GitHub repo with GitHub Pages turned on. Then open the page and choose your site's folder (or a ZIP of it).

Everything stays in your browser. Nothing is uploaded anywhere, and your work is saved in the browser automatically, so you can close the tab and pick up later.

## What it does

- **Select and change anything.** Click to select, double-click text to type, and use the right panel for font, size, weight, spacing, colors, fill, size, corners and outline.
- **Just this one, or every one like it.** "Every one like this" edits the shared style in your stylesheet, so every matching button or heading on every page updates.
- **Right-click → Turn into.** Turn any shape into a **Button**, then pick where it goes: a page, a website, a document, or an email. Or turn it into a **Countdown**.
- **Countdowns with queued dates.** Choose Days, Days + hours, or To the second. Add dates in order; when one passes, the next starts. Choose what shows at zero and after the last date, and preview the switch before it happens.
- **Motion.** Quick effects (fade, slide, grow, spin, float, pulse) that play on load, on scroll, on hover or on click.
- **Timeline.** Turn on *Record moves*, move the playhead, and change Turn / Left-right / Up-down / Size / Visible; each change becomes a step. Smooth motion is automatic. Set where a part bends with the Pivot tool (O). Works on SVG parts too.
- **Team Kit.** Your site's colors and fonts. Click a color to change it everywhere; **+** adds a new color or any Google Font.
- **Media.** Add images and documents, then insert or link them.
- **Pages.** Switch pages, open several in tabs, or make a new page from an existing one.
- **Light / dark mode**, desktop / tablet / phone view, undo / redo, and a Preview mode where your site's own scripts run.

## Getting changes live

Click **Download**. You'll see every change in plain words, then get a ZIP with just the changed files (or the whole site). Unzip it and upload the contents to your site's host. For GitHub Pages: drag the files into the repo and commit.

If a page uses a countdown, motion effect or timeline, the ZIP also includes `se-widgets.js` and `se-widgets.css`, and those pages link to them. Keep both files next to your pages.

## Keyboard

V select · M rectangle · T text · I image · O pivot point · P preview · Enter edit text · Delete delete · Ctrl/⌘+Z undo · Shift+Ctrl/⌘+Z redo · Ctrl/⌘+D duplicate · Ctrl/⌘+S download · Esc deselect

## Good to know

- While editing, your site's own JavaScript is paused so it can't fight the editor. Use **Preview** to see it running.
- Pages you change are rewritten when downloaded. They work the same, but spacing and line breaks in the HTML may look different from how you typed them. Pages you don't touch are left exactly as they were.
- This version is single-person and saved per browser. Accounts, team invites and live editing together need a small backend (sign-in, a database for each team's files, and a live connection between browsers).

## Files

- `index.html` is the app shell.
- `editor.css` holds the app styles, with dark and light themes.
- `editor.js` is the editor.
- `runtime.js` is the code that powers countdowns, motion and timelines. The editor copies it into your site as `se-widgets.js`.
