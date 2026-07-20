export const NAV_GROUPS = [
  { label: "Suasion Invest", links: [["Invest Overview", "/invest"], ["Investment Readiness", "/invest/compliance"], ["Orders", "/invest/orders"], ["Documents", "/invest/documents"], ["Advisor", "/invest/advisor"]] },
  { label: "Overview", links: [["Home", "/"], ["Markets", "/performance"], ["Morning Brief", "/brief"]] },
  { label: "Research", links: [["Funds", "/funds"], ["Research", "/research"], ["Categories", "/categories"], ["AMCs", "/amc"], ["Compare", "/compare"], ["Discover", "/discover"]] },
  { label: "Intelligence", links: [["News", "/news"], ["Signals", "/signals"], ["Market Map", "/market-map"], ["Research Queue", "/dashboard"]] },
  { label: "Workspace", links: [["Dashboard", "/dashboard"], ["Portfolio", "/portfolio"], ["Watchlist", "/dashboard#watchlist"], ["Research Notebook", "/dashboard#notebook"], ["Strategy Builder", "/research"]] },
  { label: "Support", links: [["Methodology", "/methodology"], ["Data Status", "/data-status"], ["Advisor", "/advisor"], ["About", "/about"]] },
];

export const PRIMARY_LINKS = [
  ["Markets", "/performance"],
  ["Funds", "/funds"],
  ["Research", "/research"],
  ["Portfolio", "/portfolio"],
  ["Compare", "/compare"],
  ["News", "/news"],
  ["Dashboard", "/dashboard"],
];

export const ALL_LINKS = NAV_GROUPS.flatMap((group) => group.links);

export const MOBILE_PRIMARY_LINKS = [
  ["Pulse", "/", "pulse"],
  ["Search", "#search", "search"],
  ["Funds", "/funds", "funds"],
  ["Portfolio", "/portfolio", "portfolio"],
  ["Menu", "#menu", "menu"],
];
