---
name: Homebox Terminal
description: A warehouse move terminal that reads like a printed thermal label, black print on white paper.
colors:
  ink: "#000000"
  paper: "#ffffff"
  ink-soft: "#333333"
  wash: "#ececec"
typography:
  display:
    fontFamily: "Roboto Flex Variable, system-ui, sans-serif"
    fontSize: "3.75rem"
    fontWeight: 820
    lineHeight: 1.05
    letterSpacing: "0.02em"
    fontVariation: "'wdth' 40"
  headline:
    fontFamily: "Roboto Flex Variable, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 820
    lineHeight: 1.05
    letterSpacing: "0.02em"
    fontVariation: "'wdth' 40"
  numeral:
    fontFamily: "Roboto Flex Variable, system-ui, sans-serif"
    fontSize: "4.5rem"
    fontWeight: 900
    lineHeight: 0.9
    letterSpacing: "-0.01em"
    fontFeature: "'tnum' 1"
    fontVariation: "'wdth' 55"
  body:
    fontFamily: "Roboto Flex Variable, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 500
    lineHeight: 1.5
    fontFeature: "'tnum' 1"
    fontVariation: "'wdth' 100"
  label:
    fontFamily: "Roboto Flex Variable, system-ui, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 600
    letterSpacing: "0.06em"
    fontVariation: "'wdth' 80"
rounded:
  none: "0px"
spacing:
  frame: "3px"
  gap: "0.75rem"
  cell: "1.25rem"
  section: "2rem"
  gutter-phone: "1rem"
  gutter-wide: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.headline}"
    rounded: "{rounded.none}"
    padding: "0 1.75rem"
    height: "4rem"
  button-primary-hover:
    backgroundColor: "{colors.ink-soft}"
    textColor: "{colors.paper}"
  button-primary-active:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
  button-primary-disabled:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-soft}"
  button-outline:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.headline}"
    rounded: "{rounded.none}"
    padding: "0 1.75rem"
    height: "4rem"
  button-outline-hover:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.ink}"
  button-outline-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  input-search:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0 1.25rem"
    height: "5rem"
  list-row:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "1rem 1.25rem"
  list-row-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  app-rail:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    height: "4rem"
---

# Design System: Homebox Terminal

## Overview

**Creative North Star: "The Printed Warehouse Label"**

Every screen is one bold label read at arm's length on a warehouse floor: white thermal paper, black print, thick die-cut frames, condensed heavy caps and big tabular numerals. The terminal is not an admin panel. It refuses cards, soft shadows and colour; hierarchy comes from type size, frame weight and inversion, never from hue or depth. The confirmed move "prints" a fresh label, the one authored motion in the system.

Density is low and the scale is large. The root font size is 18px, instructions run at 6xl, shelf names at 5-6xl and quantities at 7-8xl, because staff wear gloves and work in harsh or poor light. Every hit target is at least 64px. State is carried by print devices that survive a black-and-white printer: inversion for selected and pressed, a diagonal hatch for pending, a cross-hatch for attention, a dashed frame for unavailable.

Light only. Black-and-white is a strict brand commitment, not a phase.

**Key Characteristics:**
- Two inks: print black on thermal white, plus one soft ink and one wash for secondary text and hover.
- 3px square die-cut frames and 3px rules partition every surface; zero radius everywhere.
- Condensed heavy caps (Roboto Flex wdth 40, weight 820) for words; a wider black tabular face (wdth 55, weight 900) for digits only.
- State by inversion, hatch, cross-hatch and dashed frame; never by colour.
- Flat: no shadows, no elevation, no blur.
- 64px minimum hit size; gloved-hand ergonomics drive every control.

## Colors

A strict monochrome print palette: black ink on white paper, with two greys that exist only to soften secondary text and mark hover.

### Primary
- **Print Black** (ink): all text, all frames and rules, the app rail, primary buttons, and every inverted (selected, pressed, error, done) surface.

### Neutral
- **Thermal White** (paper): the page, every framed surface, the text colour on inverted controls, and the chip behind a hatched message.
- **Faded Ink** (ink-soft): secondary metadata (model, UID, location under an item name), placeholders, hint lines under primary actions, disabled glyphs and text. Never used for frames.
- **Paper Wash** (wash): hover fill on paper controls and rows. Loading placeholders use the diagonal pending hatch, not wash. Never a resting state, never a disabled fill.

### Named Rules
**The Two Inks Rule.** There is no hue anywhere in the interface: not for errors, not for success, not for destructive actions, not in photos (item images and the camera feed are rendered grayscale). A destructive action differs from a safe one only by its words and icon.

**The Inversion Rule.** Selected, pressed, error and done states invert: black ground, white print. Inversion is the strongest signal the system has; spend it on the one thing that is chosen or true right now.

**The Hatch Rule.** Pending is a diagonal hatch (2px ink lines every 11px at -45deg). Needs attention is a cross-hatch (the same lines at both -45deg and 45deg). Unavailable is a dashed frame. These three print devices are the whole state vocabulary besides inversion.

## Typography

**Display / Label Font:** Roboto Flex Variable, condensed to wdth 40 (with system-ui, sans-serif)
**Numeral Font:** Roboto Flex Variable at wdth 55, weight 900, tabular
**Body Font:** Roboto Flex Variable at wdth 100, tabular figures on

**Character:** One variable family stretched to three voices: the narrow heavy caps of a printed label, a wider black numeral face for digits, and a plain normal-width body for sentences. Root size is 18px, so every rem is large.

### Hierarchy
- **Display** (820, 3.75rem at sm and up / 2.25rem on phones, 1.05, caps): the screen instruction on the search screen, the item name on the card, the shelf name under "where it is", the result headline.
- **Headline** (820, 1.875rem-3rem, 1.05, caps): section names ("Сколько", "Куда"), move header item name, location names in rows (1.5rem), button labels.
- **Numeral** (900, 4.5rem-6rem for quantity on card and result; 3rem in rows; 0.9 line-height, tabular): quantities, step numbers, UIDs. Digits only.
- **Body** (500-600, 1.125rem-1.5rem): sentences, outcomes, metadata, field values (field values at 1.25rem semibold).
- **Label** (600, 0.8rem, 0.06em, caps, wdth 80): field names inside a ruled cell ("Где лежит", "В наличии", "Откуда"), unit suffixes ("шт"), the rail's scanner status.

### Named Rules
**The Digits-Only Numeral Rule.** The wide black numeral face is for digits: quantities, step numbers, UIDs. Shelf and location names, even "Полка 01", are words and use the condensed caps face.

**The No-Kicker Rule.** No eyebrow or kicker labels above a heading. The name or instruction leads. The small label face is allowed only as a field name inside a ruled cell, directly attached to its value.

## Layout

A single centred column, max 1280px, with a 1rem gutter on phones and 2rem from sm up. Sections stack with 2rem gaps; related controls sit 0.75rem apart. Framed surfaces are internally partitioned by 3px rules into cells with 1.25rem padding, like fields on a printed label; secondary partitions inside a list or definition grid use 1px rules.

A black rail (64px tall, sticky) tops every screen. On the move screen a confirmation bar is fixed to the bottom edge, separated by a 3px top rule, so the confirm action and the exact outcome are always in reach. Layout steps: grids collapse to one column on phones; the search field and its Find/Camera buttons go side by side at lg; the step labels go three-up at sm; cells that sit side by side at sm stack with a 3px top rule on phones.

**The Arm's Length Rule.** Minimum hit size is 64px in both dimensions for anything tappable (primary actions are 80-96px tall). Gloves are the design case, not the edge case.

## Elevation & Depth

None. The system is completely flat: no box-shadows, no blur, no tonal layering. Separation comes from 3px frames and rules; emphasis comes from inversion. The only z-axis is functional: the sticky rail, the fixed confirmation bar and the full-screen camera overlay, each bounded by a rule or a full black ground rather than a shadow.

**The Paper Has No Depth Rule.** A label is one sheet. If something needs to stand out, frame it, rule it, or invert it.

## Shapes

Square everywhere (0px radius on every token and component). Frames are 3px solid ink, die-cut and uniform; the camera viewfinder uses a 6px paper frame on the black overlay. Unavailable surfaces swap the frame to dashed, never remove it. Photos are square-cropped, grayscale with raised contrast, and sit inside the label behind a 3px rule.

## Components

### Buttons
Heavy, square and inverting: a button is a punched-out block of print.
- **Shape:** square (0px), 3px ink frame, condensed caps label, 2.5px-stroke icons.
- **Primary:** ink ground, paper text. Hover softens to faded ink; pressed inverts to paper ground with ink text and nudges down 1px.
- **Outline:** paper ground, ink text and frame. Hover takes the wash; pressed inverts to ink.
- **Sizes in use:** touch (64px tall, 1.75rem padding, 1.25rem text) for every action on the floor, stretched to 80-96px for the screen's primary action; lg (56px) only for a retry inside an error strip.
- **Focus:** a 3px ink outline drawn inside the frame (offset -9px); on inverted controls the ring is paper.
- **Disabled:** dashed "unprinted" frame on paper, faded-ink text. Never a grey fill.

### Inputs / Fields
- **Style:** 3px ink frame on paper, square, 80px tall for the main search (64px for the location filter), 1.5rem semibold text, regular-weight faded-ink placeholder. Search icon sits inside the frame at the left.
- **Focus:** a 4px ink outline outside the frame, offset 3px.
- **Stepper:** a framed strip of minus / numeral field / plus, each button 80px wide separated by 3px rules, the value in the numeral face at 3.75rem. A disabled step button gets a dashed inner frame and faded-ink glyph.

### Lists and Rows
- **Item row:** a framed link with the name in caps (1.5-1.875rem), metadata in faded ink beneath, and the quantity in the numeral face at the right. Hover washes, pressed inverts.
- **Location tree:** a framed list, rows separated by 1px rules, 64px expand column and 64px-minimum pick rows, indentation per depth. The chosen row inverts with a check; the chosen destination is also repeated in an inverted strip above the tree. The current location cannot be picked: it is drawn unprinted (dashed inner frame, faded ink) with a «Сейчас здесь» caption under the name. Indentation is 0.75rem per level on phones, 1.75rem from sm.
- **Loading placeholder:** a framed block filled with the diagonal pending hatch, the same mark as a pending operation; never a grey pulse.
- **Location row:** a framed link for browsing places: warehouse icon, the name in caps (1.5–1.875rem), an optional faded-ink hint («Внутри: 2»), a chevron at the right; 80px minimum, hover washes, pressed inverts. Browse screens list places first («Внутри»), then the items lying directly there.
- **Letter keys:** square framed caps buttons (56px) that jump the full list; one key per Cyrillic first letter, Latin names share «A–Z», digits «0–9», the rest «#» — never two keys that print the same glyph.
- **Choice tiles (radio):** framed tiles at least 96px tall; the chosen one inverts and gains a check.

### Sign-in
- **Name tiles:** framed buttons at least 96px tall, person icon and the name in caps (1.5–1.875rem), two or three per row. Disabled employees are not listed.
- **PIN keypad:** a 3×4 grid of framed numeral keys (80px, 96px from sm) — digits, erase, and the inverted confirm key with a check; confirm stays an unprinted dashed key until 4 digits are entered. Entered digits print as filled 24px squares, empty places as open squares; never the digits themselves. On lg the name card sits left and the keypad right, so the whole form fits a 900px-high screen.

### Journal (admin)
- **Period keys:** framed caps buttons (56px) in a radio group; the chosen one inverts. «Период» reveals two framed date fields.
- **Totals strip:** one frame split by a 3px rule into «Операций» and «Перемещено» numerals.
- **Day heading:** the local date in caps above that day's entries.
- **Entry row:** a framed link in three ruled cells — time numeral with the employee's name under it; item name in caps with UID, the route «from → to» and the outcome line; the quantity numeral. An unfinished entry carries the same hatch chip as its status. Phones stack the cells.

### Employees (admin)
- A framed «Новый сотрудник» form (name, PIN, role tiles), then one framed row per employee with «Изменить» and «Отключить/Включить». A disabled employee is drawn unprinted (dashed frame, faded name). Editing opens a ruled panel inside the row.

### Photos
- **Source:** the item's primary photo from Homebox, proxied by the terminal; lists use Homebox's ~500px WebP thumbnail, the card and the viewer the original.
- **Treatment:** always grayscale with raised contrast, square-cropped (`object-cover`) behind a 3px rule; no rounded corners, no placeholder when an item has no photo — the row simply starts with the name.
- **Item row:** the thumbnail fills the row's left edge (64px wide on phones, 112px from sm), separated by a 3px rule.
- **Move header:** the thumbnail sits before the item name (96px, 128px from sm).
- **Card:** the photo fills the right cell (4:3 on phones, square from lg) with an inverted «Увеличить» chip in the corner; tapping opens the viewer.
- **Viewer:** full-screen print black, the item name in caps and a paper-framed «Закрыть» (64px); the photo is contained, never cropped. Escape or a tap anywhere closes it.
- A photo that fails to load (or is not an image) disappears instead of showing a broken image.

### Cart
- **Rail link:** basket icon, «Корзина» and the count as an inverted numeral chip; shown only while the cart has lines.
- **Line:** a framed block — thumbnail, name in caps with UID, place and stock in faded ink, a 64–80px remove key behind a 3px rule; under a rule the quantity stepper (quantity-tracked records only), under another the check result: one outcome sentence, an inverted error strip, or the cross-hatched «выберите запись» band with compact framed choice tiles (64px) that invert when chosen. A freshly scanned line is outlined 4px for two seconds.
- **Target:** the same recent places and location tree as the move screen, under «Куда всё переместить».
- **Confirmation bar:** fixed at the bottom like the move screen: «N поз. · M шт. → place» in numerals and caps, and one primary «Переместить всё», printed dashed until every line is ready.
- **After moving:** an inverted «Перемещено: N» header over ruled rows linking to each operation's label; lines that failed stay in the cart.

### Status Strip
A framed strip with a 28px icon, optional caps title and a body message. Info is a plain frame on paper; error inverts. Pending and attention carry a full-height hatched cell (24px wide) on the leading edge, divided by a 3px rule.

**The Attention Band Rule.** Attention is a cross-hatched band at the full height of the message, with the message set on a paper chip on top of it. Never a small hatched square beside text: at that size it reads as a checkbox.

### Navigation
- **App rail:** black, 64px tall, sticky. The wordmark is condensed caps at 1.5rem; the scanner status is in the small label face. Rail controls are paper-framed (3px) on black, invert to paper on hover, and use a paper focus ring. Signed in, the rail stays quiet: admins get two plain caps links «Журнал» and «Сотрудники» (the current one underlined 3px); the employee's name is plain text at the right, followed by the one framed control, «Выйти». Fullscreen is an icon-only 48px square that shows a frame only on hover. Staff see no sections at all. Below sm the section links become icons (the current one gets a 3px paper bar under it), «Выйти» keeps only its icon and fullscreen hides; below md the name hides.
- **Back links:** caps text with a left arrow; hover adds a 3px underline.

### The Printed Label (signature)
The item card and the result are labels: a framed sheet headed by a full-width inverted band (record type and UID, or the result headline), then the name in display caps, then ruled cells for fields, location and quantity. The result label for a completed move feeds in from the top like paper leaving a printer (520ms, clip-path reveal plus 12px slide, cubic-bezier(0.16, 1, 0.3, 1)); pending and attention results replace the inverted band with the hatch and set the headline on a framed paper chip. The feed is the system's only authored motion and is disabled under reduced motion.

## Do's and Don'ts

### Do:
- **Do** use only Print Black and Thermal White for meaning; reserve Faded Ink for secondary text and Paper Wash for hover.
- **Do** frame every surface with a 3px square ink border and partition it with 3px rules into labelled cells.
- **Do** set words in condensed heavy caps and digits in the wide black tabular numeral face.
- **Do** express state by inversion (selected, pressed, error, done), diagonal hatch (pending), cross-hatch band with a paper chip (attention) and dashed frame (unavailable).
- **Do** make every tappable target at least 64px; make the primary action 80-96px.
- **Do** draw the focus ring as a 4px ink outline outside the element; on buttons draw it inside the frame; on inverted controls make it paper.
- **Do** render photos and the camera feed in grayscale.

### Don't:
- **Don't** use colour anywhere, including for errors, success or destructive actions.
- **Don't** use rounded corners, cards with soft shadows, blur or any elevation.
- **Don't** fill a disabled control with grey or fade it with opacity; print it as a dashed "unprinted" frame on paper with faded-ink text.
- **Don't** set location or shelf names in the numeral face.
- **Don't** put eyebrow or kicker labels above headings.
- **Don't** draw attention as a small hatched square next to text.
- **Don't** add a dark theme; the terminal is light only.
