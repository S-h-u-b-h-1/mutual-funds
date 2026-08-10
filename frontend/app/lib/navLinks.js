export const NAV_GROUPS = [
  { label: "Mutual Funds", links: [["Research Home", "/funds"], ["Compare Funds", "/compare"], ["Categories", "/categories"], ["AMCs", "/amc"], ["Morning Brief", "/brief"]] },
  { label: "Stocks", links: [["Stocks Home", "/stocks"], ["NIFTY 50 + BSE 100", "/stocks/universe"], ["Company Screener", "/stocks/screener"], ["Sectors", "/stocks/sectors"], ["Data Sources", "/stocks/sources"], ["Stock Learning", "/learn/stocks"]] },
  { label: "Markets", links: [["Market Overview", "/markets"], ["Market Map", "/market-map"], ["Raw Materials", "/markets/raw-materials"], ["News", "/news"], ["Signals", "/signals"]] },
  { label: "Portfolio", links: [["Mutual Fund Portfolio", "/portfolio"], ["Invest Portfolio", "/invest/portfolio"], ["Dashboard", "/dashboard"], ["Watchlist", "/dashboard#watchlist"], ["Research Notebook", "/dashboard#notebook"]] },
  { label: "Learn", links: [["Learning Home", "/learn"], ["Mutual Fund Basics", "/learn#mutual-funds"], ["Stock Research", "/learn/stocks"], ["Methodology", "/methodology"], ["Data Quality", "/data-quality"], ["Data Status", "/data-status"]] },
  { label: "Invest", links: [["Suasion Invest", "/invest"], ["Investment Readiness", "/invest/compliance"], ["Orders", "/invest/orders"], ["Documents", "/invest/documents"], ["Notifications", "/invest/notifications"]] },
  { label: "Profile", links: [["Profile", "/profile"], ["Settings", "/profile"], ["Sign in", "/login"], ["Create account", "/register"]] },
  { label: "Help", links: [["Help Center", "/help"], ["Data Status", "/data-status"], ["Service Status", "/status"], ["About MF Pulse", "/about"], ["Advisor Support", "/advisor"]] },
];

// Keep the highest-frequency decisions visible on wide screens. Secondary
// destinations live under More, while mobile still exposes every group.
export const DESKTOP_NAV_GROUPS = [
  { label: "Research", links: [["Mutual Funds", "/funds"], ["Stocks", "/stocks"], ["Compare Funds", "/compare"], ["Categories", "/categories"], ["AMCs", "/amc"]] },
  { label: "Markets", links: [["Market Overview", "/markets"], ["Morning Brief", "/brief"], ["Market Map", "/market-map"], ["News", "/news"], ["Signals", "/signals"]] },
  { label: "Portfolio", links: [["Portfolio Home", "/portfolio"], ["Dashboard", "/dashboard"], ["Watchlist", "/dashboard#watchlist"], ["Research Notebook", "/dashboard#notebook"]] },
  { label: "Learn", links: [["Learning Home", "/learn"], ["Mutual Fund Basics", "/learn#mutual-funds"], ["Stock Research", "/learn/stocks"], ["Methodology", "/methodology"], ["Data Quality", "/data-quality"]] },
  { label: "Invest", links: [["Suasion Invest", "/invest"], ["Investment Readiness", "/invest/compliance"], ["Orders", "/invest/orders"], ["Documents", "/invest/documents"], ["Notifications", "/invest/notifications"]] },
  { label: "More", links: [["Help Center", "/help"], ["Data Status", "/data-status"], ["Service Status", "/status"], ["Profile", "/profile"], ["About MF Pulse", "/about"]] },
];

export const PRIMARY_LINKS = [
  ["Home", "/"],
  ["Mutual Funds", "/funds"],
  ["Stocks", "/stocks"],
  ["Markets", "/markets"],
  ["Portfolio", "/portfolio"],
  ["Learn", "/learn"],
  ["Invest", "/invest"],
  ["Profile", "/profile"],
  ["Help", "/help"],
];

export const ALL_LINKS = NAV_GROUPS.flatMap((group) => group.links);

export const MOBILE_PRIMARY_LINKS = [
  ["Home", "/", "pulse"],
  ["Funds", "/funds", "funds"],
  ["Search", "#search", "search"],
  ["Portfolio", "/portfolio", "portfolio"],
  ["Menu", "#menu", "menu"],
];
