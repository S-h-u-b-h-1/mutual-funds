// Single source of truth for site navigation — Nav.jsx (desktop, top bar) and MobileNav.jsx
// (hamburger sheet) previously hand-maintained separate, silently-diverged LINKS arrays: mobile
// had Analytics + Data status, desktop had neither, so desktop users had no primary-nav path to
// either page. PRIMARY = the top-bar set (kept short by design); ALL = primary + secondary
// utility pages, shown in the mobile sheet where there's room for a longer list.
export const PRIMARY_LINKS = [
  ["Funds", "/funds"],
  ["Performance", "/performance"],
  ["Categories", "/categories"],
  ["News", "/news"],
  ["Discover", "/discover"],
  ["Compare", "/compare"],
  ["Research", "/research"],
];

export const ALL_LINKS = [
  ...PRIMARY_LINKS,
  ["Analytics", "/analytics"],
  ["Data status", "/data-status"],
];
