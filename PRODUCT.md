# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Warehouse staff without technical background. They move network and IT equipment between warehouses,
rooms and shelves and need the move recorded in Homebox immediately. They often wear gloves and work
in poor or very bright light; some sessions are a rush of many moves in a row, others are calm office work.

## Product Purpose

A warehouse terminal on top of Homebox for one job: find or scan equipment, choose where it goes, how
many, confirm. Homebox stays the system of record; the terminal does not duplicate its features.
Success: a move takes seconds, the result is visible in Homebox at once, and the data never drifts.

## Positioning

A single-purpose terminal for moves: scanner-first, with guarantees Homebox's own UI lacks — no
negative stock, no double execution, no loss on partial moves, recovery after network failures.

## Operating Context

- Primary device: a stationary PC/all-in-one with a USB barcode scanner (HID keyboard mode) that is
  always connected; mouse or touch monitor. Tablets and desktops must also work.
- Equipment is found by scanning Homebox labels (QR/barcode), by name, model/article or UID (`000-011`).
- Target shelves are chosen both ways equally: by scanning a shelf label or by picking in the location tree.
  Shelves are numbered (01–25) inside rooms and warehouses.
- ~800 records. Quantity 1 = individually tracked unit with its own history; quantity > 1 = quantity-tracked.
- System on-screen keyboard must work for manual input.

## Capabilities and Constraints

- MVP: search, scan, item card, location tree, whole and partial moves, merge into a matching record,
  confirmation, error handling, full-screen terminal, Docker Compose.
- Later stages (not now): move journal/audit, handover between employees, send → accept, receiving,
  bulk moves, inventory, label printing.
- No success shown before the server confirms; operations can be "pending" (finished automatically)
  or "needs attention".
- Interface language: Russian only.
- Rules of moves are specified in `logic/` (README and Gherkin scenarios).

## Brand Commitments

- Strict black-and-white theme (explicit user requirement).

## Product Principles

1. Speed of the warehouse operation over everything: scan → shelf → confirm.
2. Minimal interface complexity: one decision per screen, defaults that are right.
3. Never show a state the server has not confirmed; never let data drift from Homebox.
4. Errors are plain-language and say what to do next.

## Accessibility & Inclusion

Gloved hands: large hit areas, nothing small or precise. Poor/bright light: maximum contrast, large type.
Users without technical background: no jargon (no "entity", "UUID", "saga").
