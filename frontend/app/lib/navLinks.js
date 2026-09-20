export const NAV_GROUPS = [
  { label: "Advisory", links: [["Wealth Advisory Agent", "/advisor"], ["Risk Profile", "/advisor"], ["Compare Matched Funds", "/compare?mode=funds"]] },
  { label: "Mutual Funds", links: [["Research Home", "/funds"], ["Compare Funds", "/compare"], ["Categories", "/categories"], ["AMCs", "/amc"], ["Morning Brief", "/brief"]] },
  { label: "Portfolio", links: [["Portfolio Diagnosis", "/portfolio"], ["Dashboard", "/dashboard"], ["Watchlist", "/dashboard#watchlist"], ["Research Notebook", "/dashboard#notebook"]] },
  { label: "Learn", links: [["Learning Home", "/learn"], ["Mutual Fund Basics", "/learn#mutual-funds"], ["Methodology", "/methodology"], ["Data Quality", "/data-quality"], ["Data Status", "/data-status"]] },
  { label: "Profile", links: [["Profile", "/profile"], ["Settings", "/profile"], ["Sign in", "/login"], ["Create account", "/register"]] },
  { label: "Help", links: [["Help Center", "/help"], ["Data Status", "/data-status"], ["Service Status", "/status"], ["About MFPulse", "/about"]] },
];

export const PRIMARY_LINKS = [
  ["Home", "/"],
  ["Advisory", "/advisor"],
  ["Mutual Funds", "/funds"],
  ["Portfolio", "/portfolio"],
  ["Learn", "/learn"],
  ["Profile", "/profile"],
  ["Help", "/help"],
];

export const ALL_LINKS = NAV_GROUPS.flatMap((group) => group.links);

export const MOBILE_PRIMARY_LINKS = [
  ["Home", "/", "pulse"],
  ["Search", "#search", "search"],
  ["Advisor", "/advisor", "funds"],
  ["Portfolio", "/portfolio", "portfolio"],
  ["Menu", "#menu", "menu"],
];
