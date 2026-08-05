// Jednobarevné SVG ikonky (dědí currentColor) – žádné emoji.
"use strict";
const ICO = (p, extra = "") =>
  `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${p}</svg>`;

const I = {
  dumbbell: () => ICO('<path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10"/>'),
  chart: () => ICO('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  calendar: () => ICO('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  check: () => ICO('<path d="M4 12.5l5.2 5.2L20 7"/>'),
  close: () => ICO('<path d="M6 6l12 12M18 6L6 18"/>'),
  chevronL: () => ICO('<path d="M15 5l-7 7 7 7"/>'),
  chevronR: () => ICO('<path d="M9 5l7 7-7 7"/>'),
  plus: () => ICO('<path d="M12 5v14M5 12h14"/>'),
  minus: () => ICO('<path d="M5 12h14"/>'),
  skip: () => ICO('<path d="M5 5l9 7-9 7zM19 5v14"/>'),
  prev: () => ICO('<path d="M19 5L9 12l10 7zM5 5v14"/>'),
  next: () => ICO('<path d="M5 5l10 7L5 19zM19 5v14"/>'),
  play: () => ICO('<path d="M7 4l13 8-13 8z"/>'),
  pause: () => ICO('<path d="M9 4v16M15 4v16"/>'),
  music: () => ICO('<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>'),
  trophy: () => ICO('<path d="M7 4h10v5a5 5 0 01-10 0zM7 6H4v2a3 3 0 003 3M17 6h3v2a3 3 0 01-3 3M9 20h6M12 14v6"/>'),
  clock: () => ICO('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  flame: () => ICO('<path d="M12 3c4 4 6 6.5 6 10a6 6 0 01-12 0c0-2 1-3.5 2.5-5C9 9.5 11 7 12 3z"/>'),
  bolt: () => ICO('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
  history: () => ICO('<path d="M3 12a9 9 0 109-9 9 9 0 00-7.5 4M3 4v4h4"/><path d="M12 7v5l4 2"/>'),
  arrowUp: () => ICO('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  dot: () => ICO('<circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none"/>'),
  target: () => ICO('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/>'),
  gear: () => ICO('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1A1.7 1.7 0 008.9 19a1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1A1.7 1.7 0 004.6 8.9a1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V10a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'),
  undo: () => ICO('<path d="M3 8h11a6 6 0 010 12h-5M3 8l4-4M3 8l4 4"/>'),
  bulb: () => ICO('<path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.5.4.8 1 .8 1.6V16h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0012 3z"/>'),
  layers: () => ICO('<path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5"/>'),
};
