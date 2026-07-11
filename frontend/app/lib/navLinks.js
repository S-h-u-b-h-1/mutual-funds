export const NAV_GROUPS = [
  { label: "Overview", links: [["Home", "/"], ["Morning Brief", "/brief"], ["Market Pulse", "/performance"]] },
  { label: "Research", links: [["Funds", "/funds"], ["Categories", "/categories"], ["AMCs", "/amc"], ["Compare", "/compare"], ["Discover", "/discover"]] },
  { label: "Intelligence", links: [["News Intelligence", "/news"], ["Signals", "/signals"], ["Market Map", "/market-map"], ["Research Queue", "/dashboard"]] },
  { label: "Workspace", links: [["Dashboard", "/dashboard"], ["Watchlist", "/dashboard#watchlist"], ["Research Notebook", "/dashboard#notebook"], ["Strategy Builder", "/research"], ["Portfolio Intelligence", "/portfolio"]] },
  { label: "Support", links: [["Methodology", "/methodology"], ["Data Status", "/data-status"], ["Advisor", "/advisor"], ["About", "/about"]] },
];

export const PRIMARY_LINKS = [
  ["Morning Brief", "/brief"],
  ["Funds", "/funds"],
  ["Compare", "/compare"],
  ["News", "/news"],
  ["Workspace", "/dashboard"],
];

export const ALL_LINKS = NAV_GROUPS.flatMap((group) => group.links);

export const MOBILE_PRIMARY_LINKS = [
  ["Home", "/", "⌂"],
  ["Search", "#search", "⌕"],
  ["Brief", "/brief", "◫"],
  ["Watchlist", "/dashboard#watchlist", "◇"],
  ["Workspace", "/dashboard", "▦"],
];
