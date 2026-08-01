export const NAV_GROUPS = [
  { label: "Mutual Funds", links: [["Fund Research", "/funds"], ["Compare Funds", "/compare"], ["Categories", "/categories"], ["AMCs", "/amc"], ["Suasion MF Invest", "/invest"]] },
  { label: "Stocks", links: [["Stocks Home", "/stocks"], ["Company Screener", "/stocks/screener"], ["Sectors", "/stocks/sectors"], ["Stock Learning", "/learn/stocks"]] },
  { label: "Portfolio", links: [["MF Portfolio", "/portfolio"], ["Invest Portfolio", "/invest/portfolio"], ["Dashboard", "/dashboard"], ["Watchlist", "/dashboard#watchlist"], ["Research Notebook", "/dashboard#notebook"]] },
  { label: "Markets", links: [["Markets", "/markets"], ["Market Map", "/market-map"], ["Raw Materials", "/markets/raw-materials"], ["News", "/news"], ["Signals", "/signals"]] },
  { label: "Support", links: [["Methodology", "/methodology"], ["Data Status", "/data-status"], ["Advisor", "/advisor"], ["About", "/about"]] },
];

export const PRIMARY_LINKS = [
  ["Mutual Funds", "/funds"],
  ["Stocks", "/stocks"],
  ["Portfolio", "/portfolio"],
  ["Markets", "/markets"],
  ["Learn", "/learn/stocks"],
  ["Compare", "/compare"],
];

export const ALL_LINKS = NAV_GROUPS.flatMap((group) => group.links);

export const MOBILE_PRIMARY_LINKS = [
  ["Pulse", "/", "pulse"],
  ["Search", "#search", "search"],
  ["Stocks", "/stocks", "funds"],
  ["Portfolio", "/portfolio", "portfolio"],
  ["Menu", "#menu", "menu"],
];
