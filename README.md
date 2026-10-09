# Sadas Canvas

A lightweight, **fully offline** free-form canvas editor that combines
Notepad-style simplicity, Word-style text formatting and a Canva/Figma-style
object canvas — rendered as a compact Windows-style desktop UI.

No database. No network calls. No telemetry. No AI features. Documents are
plain JSON `.sadas` files; sessions and rotating backups live in local
storage on the machine.

## Feature map

| Area | Highlights |
| --- | --- |
| Shell | Menu bar (File→Help), toolbar, document tabs, left Pages/Layers panel, right Properties panel, status bar, light/dark theme, distraction-free mode |
| Sheets | Per-sheet page sizes — A3, A4, A5, Letter, Legal, Square, 16:9 Slide, Custom or Infinite canvas — with portrait/landscape, margin guides, paper colour, and a Canva-style bottom strip of live thumbnails (click to switch, double-click to rename, drag to reorder, duplicate/delete). New sheets insert **after the current one**, or anywhere via the hover **+** between cards |
| Presenting | **F5** starts a full-screen slideshow that reuses the live canvas, so slides render at full fidelity with no grid, margins or UI. Arrows/Space/click to advance, **G** for an all-sheets overview, **Esc** to exit; auto-hiding controls with a slide counter |
| Canvas | Infinite canvas or paper sheet, wheel scrolls the sheet up/down, **Shift+wheel** scrolls left/right, **Ctrl+wheel** zooms 25–400 %, pan with Space/middle-drag, adaptive **dot grid** (or ruled lines) at 5/10/20/50 px on the background behind the sheet (the sheet itself stays clean), snap-to-grid, snap to objects **and sheet edges/margins** |
| Objects | Text, sticky notes, rect/rounded rect/ellipse/triangle/star (with editable labels), lines, arrows, pen/pencil/highlighter with colour + thickness controls, images (incl. sanitized SVG), eraser |
| Photo tools | Offline image adjustments — brightness, contrast, saturation, hue, sharpen, blur, pixelate, grain, B/W, sepia, invert — plus non-destructive aspect crop, blend modes on any object, an eyedropper that samples canvas pixels, and an **offline background remover** (edge-flood + colour threshold with live preview) |
| Text effects | 16 one-click text style presets (Bold, Heading, Shadow, Glow, Neon, Outline, Pop, Retro, Emboss, Fire, Ice, Warm, Mono, Elegant, Stamp, Plain) with live canvas-rendered thumbnails — click to apply instantly, fully undoable |
| Editing | Command-pattern undo/redo (Ctrl+Z/Y), multi-select + rubber band, group/ungroup, align/distribute, z-order, lock/hide, flip, Alt+drag duplicate, arrow-key nudge (1/10 px), Tab cycle |
| Text | Font family/size, B/I/U/S, color, alignment, line & letter spacing, inline editing, spell-check toggle, live Lines/Words/Chars stats, “Create N rows” numbered-row generator |
| Search | Ctrl+F across the whole document — with case/whole-word/regex options, match navigation, Replace / Replace All |
| Files | **Save / Save As with a real file-location picker** (File System Access API; Save rewrites the chosen file, with download fallback), Open via native picker, `.sadas` format (legacy `.canvaspad` files still open), multiple documents as tabs, dirty indicators, debounced session persistence, rotating backups (last 3), crash-recovery banner, PNG/JPG export (sheet-cropped at true size, or all content) |
| Links | **Ctrl+K** attaches a hyperlink to any object or inserts a link card; pasting a URL creates a card automatically. Only `http(s)`/`mailto` are accepted (re-sanitised on load), and links never open without an explicit confirmation |
| Connectivity | Works identically **online and offline** — no requests, uploads or telemetry. The status bar reports the connection purely so you know whether opening a link will reach the internet |
| Tools | Command palette (Ctrl+Shift+P), full shortcut map (Help → Keyboard Shortcuts) |

## Architecture

```
src/
  core/      types · history (command pattern) · commands · factory · store
             (zustand) · fileio (serialize/sanitize/backups) · text · selftest
  editor/    CanvasStage (Konva stage, tools, snapping, text editor) ·
             ObjectNode (immutable-rendered Konva nodes) · snapping
  ui/        MenuBar · Toolbar · TabStrip · LeftPanel · PropertiesPanel ·
             StatusBar · CommandPalette · FindReplace · Dialogs · actions
  hooks/     useHotkeys (chord → action registry)
```

Every content mutation is a reversible `HCommand` with `redo`/`undo` functions
over structurally-shared arrays — no whole-document snapshots. Dev builds run
history self-tests on startup (see console).

## Run

```bash
npm install
npm run dev      # development
npm run build    # production bundle in dist/
npm run preview  # serve the production build
```

The production build is a single self-contained `dist/index.html` that works
with the network cable unplugged.
# SadasCanvas
