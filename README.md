# Site Editor (v2)

A visual editor for plain HTML/CSS websites, laid out like Photoshop. Open your site, change it like a design file, and download the updated files.

## Run it

Host this folder anywhere that serves static files, like its own GitHub repo with GitHub Pages. Open the page and pick your site's folder or a ZIP of it. Everything stays in your browser and saves automatically.

## The layout

- **Menu bar:** File, Edit, Insert, Layer, View, Window.
- **Options bar:** shows settings for the current tool or selection.
- **Tool strip:** tools are grouped. A small triangle means more tools; right-click or hold to see them.
  - Select (V) / Select group (A)
  - Rectangle (M) / Ellipse (U) / Line (L)
  - Text (T)
  - Image (I) / Embed code
  - Pivot point (O)
  - Hand (H)
  - Zoom (Z)
- **Panels:** docked on the right in tabbed groups.
  - Drag a tab to another group, or to the empty strip at the bottom to make a new group.
  - Collapse a group with its arrow, or close a panel with ×.
  - The **Window** menu brings panels back, turns on Compact panels (icons only), saves your layout, or resets to Essentials.
- **Rulers and zoom:** the rulers highlight where the selection sits. Use ⌘/Ctrl + and −, ⌘0 to fit, ⌘1 for actual size, or ⌘/Ctrl + scroll. Hold Space to pan.
- **Floating action bar:** appears under whatever you select, with Turn into, Link, Motion, Lock, Duplicate and More. Right-click gives the full menu.

## Free placement

Everything can go anywhere, like Photoshop.

- **Dragging:** drag anything to move it. The first time you drag something, it and the things around it get pinned to exactly where they are, so nothing jumps. **Layer → Free-place everything on this page** does a whole page at once.
- **Snapping and resizing:** pink guides snap to edges and centers (hold Alt to skip snapping). Resize with the handles, and Shift keeps the shape.
- **Fine moves:** arrow keys nudge by 1px, Shift + arrow by 10px.
- **Stacking:** Layers order controls what's in front. Higher in the list means in front. Drag rows to restack, or drop onto the middle of a row to put something inside it.
- **Screen sizes:** switch Desktop / Tablet / Phone at the top. Changes made in Tablet view apply to tablets and phones; Phone view changes apply to phones only. **Stack what's inside** lines things up top to bottom for small screens.

## Layers

Each row has:
- **Eye:** hides it everywhere, including the published site.
- **Ghost:** vanishes it only while you edit, so you can reach what's underneath.
- **Lock:** click to cycle Locked → Position locked → Unlocked. Locked things can't be clicked on the page; clicks pass through to what's underneath. Position-locked things can still be restyled but not moved, resized or deleted.
- **Rename:** double-click a name.

## Building blocks (right-click → Turn into, or Insert)

- **Button:** pick where it goes: a page, a website, a file, an email address, or a pop-up.
- **Countdown:** show days, days + hours, or down to the second. Queue dates so the next one starts when one ends.
- **Pop-up:** stays hidden until a button opens it. Visitors close it with ×, Esc, or by clicking outside it.
- **Expanding row:** a title that opens to show more, optionally with a PDF inside that only loads when opened.
- **Section tabs:** a list of the page's sections that highlights the one on screen as visitors scroll.
- **Embed code:** paste a form, map or video embed. It shows as a placeholder while editing and works in Preview.

## Look and motion

- **Fill:** none, a solid team color, or a gradient (direction, angle, and any number of colors).
- **Hovered and Pressed looks:** pick the state, then change anything.
- **Quick effects:** fade, slide, grow, spin (either direction, exact seconds), float, pulse, and flowing color for gradients.
- **Timeline:** turn on Record moves, move the playhead, and use the sliders. Each change becomes a step, and motion is smoothed automatically.

## Panels

- **Properties:** name, apply to just this one or every one like it, position and size, pinning to the screen, show or hide per screen size, look, motion, lock, and sharing.
- **Character:** words, your site's own text styles, font, size, weight, spacing, alignment, capitals, and color.
- **Pages:** switch pages or make a new one.
- **History:** click any step to jump back to it.
- **Team Kit:** your colors and fonts. Click a color to change it everywhere; + adds a color or any Google Font.
- **Data:** edits lists inside your site's scripts, like `COMP_SCHEDULE`, without touching code.
- **Shared parts:** Edit → Make shared. It finds the same thing on your other pages and links them. After that, editing it on one page changes every page.

## Getting changes live

Click **Download** to see every change in plain words, then get a ZIP of what changed (or the whole site). Upload what's inside to your host.

The ZIP may include:
- **`se-styles.css`:** where the editor keeps positions and "just this one" styles. Pages link it automatically.
- **`se-widgets.js` and `se-widgets.css`:** what makes countdowns, pop-ups, expanding rows, section tabs and animations work.

## Good to know

- While editing, your site's own scripts are paused so they can't fight the editor. Use **Preview** to see them running.
- Free-placed layouts don't reflow. If text gets longer or the screen is narrower, things can overlap, so check Tablet and Phone views.
- Pages you change are rewritten when downloaded; pages you don't touch stay exactly as they were.
- Still to come: an interactions system (follow the cursor, step-by-step sequences, rigs like the robot arm), and accounts, teams and live editing together.
