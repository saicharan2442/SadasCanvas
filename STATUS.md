# Sadas Canvas — STATUS

## Latest update — recenter fix + rename

**Renamed to Sadas Canvas** across the title bar, menu brand, About/link
dialogs, status bar, icon and docs. Documents now save as **`.sadas`**;
existing `.canvaspad` files still open normally (drag-drop, Open dialog and
the loader all accept both).

**Recenter/fit fixed.** The old code read a *cached* viewport size that the
ResizeObserver updates only after layout, so any fit triggered in the same
frame as a layout change (toggling a panel or the sheets bar, switching
sheets, entering present mode) centred against stale dimensions. Fits now
measure the canvas element directly. Also:
- The 11px overlay scrollbars are excluded from the centring maths, so the
  sheet is optically centred instead of sitting slightly off.
- Camera positions are rounded to whole pixels — no more half-pixel blur.
- All paths (Fit sheet, Fit to screen, Fit selection, Actual size, present
  mode) share one `centerOn()` helper, so they behave identically.
- **Ctrl+0 (Actual Size)** now recentres as well as zooming to 100 %.
- New **Recenter** action — toolbar button, View menu, **Ctrl+.** — restores
  the sheet to the middle without changing zoom.

## Latest update — multi-page decks + presentation mode

Building a deck now works like Canva:
- **New sheets insert directly after the current one** (previously appended to
  the end), so pages build in reading order. Each thumbnail also has a hover
  **+** on its right edge to insert a sheet at that exact position.
- New sheets inherit the current sheet's size and orientation; a **Present**
  button sits in the sheets bar header.

**Presentation mode (F5 / Shift+F5):**
- Full-screen slideshow that reuses the live Konva canvas, so slides show
  exactly what you designed — images, filters and blend modes included — with
  the grid, margin guides, panels and scrollbars hidden on a dark backdrop.
- Navigate with → ← ↑ ↓, Space, Page Up/Down, Home/End, or by clicking
  (left third goes back, the rest advances).
- **G** opens an all-sheets overview to jump to any slide; **Esc** exits.
- Auto-hiding control bar with prev/next and a slide counter; leaving browser
  full screen ends the show, and editing shortcuts are suppressed throughout.

## Latest update — real Save dialogs, links, online/offline

**Save / Save As now ask where to put the file.** Using the File System Access
API: *Save As* always opens the native "Save file" dialog, and *Save* writes
straight back to the file you chose (prompting only the first time, or if the
file was moved or permission lapsed). Open uses the native picker too and
remembers the handle. Browsers without the API fall back to a download, and
the toast says which happened. A rotating `.bak` is still written before
every save.

**Links / URLs are supported.**
- **Ctrl+K** attaches a link to the selected object, or inserts a **link card**
  when nothing is selected (accent spine, title + tidy domain).
- Pasting a URL on the canvas creates a link card automatically.
- Double-click a linked object to open it; Alt+double-click edits its text.
- Link section in the properties panel: Open / Edit / Copy / Remove.
- Security: only `http`, `https` and `mailto` are accepted — `javascript:`,
  `data:` and `file:` are rejected, URLs are re-sanitised when a document is
  loaded, links never open silently (always a confirm dialog), and they open
  with `noopener,noreferrer`.

**Online and offline both work.** The app still makes zero network requests —
every feature (editing, saving, exporting, backups, recovery) is local. The
status badge now reports actual connectivity and marks the app "Local only",
so the only thing that needs the internet is following a link.

## Latest update — photo tools + Canva-style workspace

Offline image editing (all local, Konva filters — no AI, no network):
- **Adjustments panel** for images: Brightness, Contrast, Saturation, Hue,
  Sharpen, Blur, Pixelate and Grain sliders, plus B/W, Sepia and Invert chips
  and a one-click Reset.
- **Crop** with Free / 1:1 / 4:3 / 3:4 / 16:9 / 9:16 presets (centred window,
  non-destructive — the original pixels are kept and crop can be reset).
- **Blend modes** on every object (multiply, screen, overlay, soft-light,
  difference, hue/saturation/colour/luminosity, …).
- **Eyedropper (I)** samples any pixel on the canvas and applies it to the
  selection (text colour for text, fill otherwise) while saving it to a
  recent-swatch palette shown in the colour sections.
- Tools menu shortcuts: B/W, Sepia, Invert, Fit image to sheet, Reset.
- Filters only cache a node when an adjustment is actually active, so
  unedited images stay on the fast path.

Workspace restyle (Canva-like):
- Purple accent, softer surfaces, rounded 10/14px cards, pill-shaped buttons
  and chips, larger 34px tool targets with filled active state.
- Rounded menus, dialogs and command palette with deeper, softer shadows.
- Roomier side panels and friendlier inputs (filled, borderless until hover).

## Latest update — wheel navigation

The wheel now drives the sheet like a document viewer:
- **Wheel** scrolls the sheet up / down.
- **Shift + wheel** scrolls the sheet left / right.
- **Ctrl + wheel** zooms at the cursor (Alt + wheel also works); zoom also
  stays on the toolbar, Ctrl +/−, Ctrl+0 and the status-bar readout.
- Wheel deltas are normalised across pixel/line/page modes, so mice that
  report "lines" (common on Windows) no longer crawl a few pixels per notch.
- Trackpad horizontal gestures still pan sideways.

## Latest update — dot grid

The canvas background is now a **dot grid by default** (Figma/Canva style)
instead of ruled lines:
- Dots keep a constant on-screen size at every zoom level, with larger accent
  dots every 5th step for orientation.
- The grid lives on the **background board only** — the sheet paper is painted
  on top, so the sheet stays clean (dots are still hidden from exports).
- Drawn as two batched paths per frame (not one path per dot).
- Lines remain available: View → Grid Style, the status-bar picker, Settings →
  Canvas, right-click the toolbar grid button, or **Ctrl+'** to toggle.

## Latest update — freehand fixes + sheets

Freehand tools repaired:
- Pen/pencil/highlighter **stay selected** after a stroke (previously the app
  jumped back to Select after every single line).
- New strokes are **no longer auto-selected**, so the transform box stops
  blocking the next stroke.
- A quick tap now leaves a **dot** instead of being discarded.
- **Colour + thickness controls** per tool appear in the toolbar while a
  freehand tool is active (persisted between sessions).
- Unified **mouse + touch + stylus** input, so drawing works with a finger,
  pen or trackpad; strokes also end correctly when the pointer is released
  outside the window.
- Per-tool smoothing (pen glides, pencil tracks tightly, highlighter is a flat
  band), screen-space point thinning, a 4,000-point cap and cheaper stroke
  drawing, plus eraser no longer "erases" the empty background.
- Fixed name-counter spam (one object name per drawing, not one per frame).

Sheets (Canva-style) added:
- A **Sheet menu**, sheet settings in the properties panel (when nothing is
  selected) and a **sheets bar** at the bottom with live SVG thumbnails.
- Sizes: A3, A4, A5, Letter, Legal, Square, Slide 16:9, Custom, Infinite.
- Portrait/landscape, margin guides, paper colour, true-size PNG/JPG export
  cropped to the sheet, grid clipped to the paper, snapping to sheet edges and
  margins, and Ctrl+1 "Fit sheet".

## Done (in this web build)

- Part 1  App shell: menu bar, toolbar, left panel, canvas, properties panel,
          status bar, light/dark theme, compact Windows-style UI.
- Part 2  Core model + command-pattern undo/redo with merging + dev self-tests.
- Part 3  Konva stage: pan/zoom (25–400 %, Ctrl+wheel, Fit, Actual Size),
          adaptive grid, text objects, click/shift/rubber-band selection,
          nudge 1/10 px, Tab cycle, Esc deselect, Alt+drag duplicate,
          copy/cut/paste/duplicate/delete.
- Part 4  Properties panel (X/Y/W/H, rotation, opacity, solid/gradient fill,
          stroke, corner radius, shadow), layers panel (hide/lock/reorder),
          group/ungroup, align + distribute, object snapping guides, grid snap.
- Part 5  `.canvaspad` (JSON container), Save/Open, tabs, dirty indicator,
          debounced session save, rotating backups (3), crash-recovery banner,
          lenient recovery parse on damaged files.
- Part 6  Font family/size, B/I/U/S, color, align, line/letter spacing,
          spell check, live Lines/Words/Chars, Create-N-rows dialog
          (custom start incl. zero-based, continuous numbering).
- Part 7  Ctrl+F document-wide find + Replace/Replace All, case/whole-word/regex,
          results navigate + center on match with page and object shown.
- Part 8  Drag-drop & clipboard-paste images (PNG/JPG/GIF/WEBP/BMP/SVG with
          script/event-handler sanitising), image tools (opacity, border, radius,
          shadow, brightness/contrast, flip), paste plain text as text object.
- Part 9  Shapes with editable text labels, arrows with head options, pen /
          pencil / highlighter / eraser, sticky notes, preset swatches,
          format paint via properties panel multi-select.
- Part 12 Pages sidebar (add/delete/duplicate/rename/reorder), infinite canvas.
- Part 13 PNG/JPG export at 2× with exact object positions; `.canvaspad` export.
- Part 14 Auto-save interval settings (Off/30 s/1/5/10 min), crash recovery
          prompt, command palette, distraction-free + full-screen modes,
          Settings window (no AI section), local-only storage.
- Part 15 Viewport culling, memoised immutable object rendering, debounced
          session writes, single-file production build.

## Assumptions & adaptations

- Delivered as a web build of the same spec (this environment) instead of the
  Tauri/NSIS packaging steps; everything runs fully offline in one HTML file.
  Browser-reserved chords (Ctrl+W, Ctrl+N) work in installed/desktop shells
  but may be intercepted by the browser during web preview.
- Damaged-file handling: lenient parse repair + rotating backups + recovery
  banner, replacing the native three-button dialog.
- Underline + strikethrough together render underline (Konva draws one
  decoration per text run).
- Not in this build (noted per protocol): CodeMirror code blocks, tables,
  connectors with auto-attach, file cards, DOCX/PDF/HTML/MD/SVG/TXT export,
  document-mode page sizes, rulers/minimap, printing, AES encryption.

## Test checklist

- Draw every tool; select/move/resize/rotate with transformer handles.
- Wheel scrolls the sheet vertically; Shift+wheel scrolls horizontally;
  Ctrl+wheel zooms to cursor; Space+drag and middle-drag pan; Fit/100 % work.
- Grid toggle + grid size; snap to grid; drag near edges shows pink guides.
- Double-click text/sticky/shape → inline editing; Ctrl+Enter or click-away commits;
  empty text objects are removed on commit.
- Shift+click, rubber band, Ctrl+G/ungroup, align/distribute buttons.
- Ctrl+Z/Y walks through every change (typing merges into one undo).
- Ctrl+F: search across pages, Enter/Shift+Enter cycles, Replace All.
- Drag an image and an .svg onto canvas; paste an image from clipboard.
- Save downloads `.canvaspad`; re-open it; tabs + dirty dots; Ctrl+S.
- Reload page → session restores; crash flag shows recovery banner after an
  unclean exit; Settings → backups restore a prior state.
- Export PNG/JPG → exact positions preserved.
- Toggle dark/light; F for distraction-free; Ctrl+Shift+P palette runs everything.
