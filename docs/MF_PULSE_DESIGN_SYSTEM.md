# MF Pulse Design System

## Concept: The Evidence Network

MF Pulse visualizes long-term investment research as a connected evidence network: funds sit within categories, AMCs, benchmarks, managers, portfolios, and market events. The interface is calm and editorial at the overview level, precise and compact inside research workspaces, and explicit about freshness and missing evidence.

Principles: clarity before density; evidence before claims; context before rankings; calm before urgency; research before action.

## Identity

The primary identity combines institutional teal with mineral neutrals and a restrained research-gold accent. Warm ivory makes the light theme suited to reading and printing. Deep spruce-graphite, rather than pure black, reduces glare in dark mode. Positive and negative colors are semantic only and always accompanied by labels, symbols, or explanatory text.

## Semantic color tokens

Tokens live in `frontend/app/globals.css`; Tailwind aliases in `tailwind.config.js` reference the same variables. Both themes define canvas, surface, raised surface, strong surface, border, strong/muted/faint text, brand, brand hover, positive, negative, warning, information, confidence, missing-data, and focus colors. Components must use semantic aliases rather than literal colors. Print forces a white canvas and removes decorative shadows.

## Typography

Manrope is the sole editorial and interface family. IBM Plex Mono is reserved for financial values, dates, IDs, scores, and table measures. Both are production-safe open-source web fonts loaded through Next.js. The working scale is: 42px page/hero display on desktop (32px mobile), 20px section title, 18px card title, 16px body, 14px compact body, 13px metadata, and 11px labels/badges. Financial figures use tabular numerals and slashed zeroes. Weight 700 is reserved for a decisive output; 600 establishes hierarchy; 500 labels controls; 400 supports reading.

## Surfaces and spacing

The base unit is 4px, with primary spacing steps of 8, 12, 16, 24, 32, 48, and 64px. Surfaces use real opaque theme colors, a subtle border, and restrained elevation—no backdrop blur. Page width is 1240px with responsive 16/24/32px gutters. Reading text is capped near 68 characters.

## Status and trust

Freshness is one of current, delayed, stale, or unknown and never inferred from decorative motion. Confidence and completeness are distinct from freshness. Missing data remains visible through a neutral limitation notice. Green and red are never the only carriers of meaning.

## Motion

Durations are 120ms (control response), 200ms (state transition), and 360ms (panel/route context). Motion uses one ease-out curve and stops under `prefers-reduced-motion`. Persistent pulsing, blinking, scroll hijacking, and decorative motion are prohibited.

## Accessibility and responsive rules

All routes include a visible-on-focus skip link, semantic landmarks, a high-contrast focus ring, and touch targets of at least 40px (44px for primary mobile controls). Charts require a prose summary or data-table fallback. Desktop tables transform into prioritized records on small screens rather than merely shrinking. At 320px the interface must retain identity, primary conclusion, freshness, and primary action.
