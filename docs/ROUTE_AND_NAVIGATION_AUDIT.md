# MF Pulse / Suasion Securities — Route & Navigation Audit

**Audit Date**: 2026-07-28  
**Scope**: All 125 User-Facing Pages and API Routes in Next.js App Router (`frontend/app`)

---

## Route Inventory & Verification Matrix

### 1. Investor Experience Routes

| Route URL | Entry Point | Auth Required | Backend API Dependency | Verified Status |
|---|---|---|---|---|
| `/` | Landing / Live Terminal | No | `daily.json`, `funds.json`, `performance.json` | **WORKING** |
| `/login` | Auth | No | `/api/auth/[...nextauth]` | **WORKING** |
| `/register` | Auth | No | `/api/auth/register` | **WORKING** |
| `/forgot-password` | Auth | No | `/api/auth/forgot-password` | **WORKING** |
| `/reset-password` | Auth | No | `/api/auth/reset-password` | **WORKING** |
| `/invest` | Investor Hub | Yes | `/api/v1/invest/account`, `/api/v1/invest/portfolio` | **WORKING** |
| `/invest/onboarding` | Compliance / Onboarding | Yes | `/api/v1/invest/compliance` | **WORKING** |
| `/invest/compliance` | KYC & Declarations | Yes | `/api/v1/invest/compliance/items/[itemKey]` | **WORKING** |
| `/invest/portfolio` | Consolidated Portfolio | Yes | `/api/v1/invest/portfolio/summary`, `/holdings` | **WORKING** |
| `/invest/orders` | Order History & Lifecycle | Yes | `/api/v1/invest/orders` | **WORKING** |
| `/invest/sips` | SIP Management | Yes | `/api/v1/invest/sips` | **WORKING** |
| `/invest/redeem` | Redemption Flow | Yes | `/api/v1/invest/redemption` | **WORKING** |
| `/invest/switch` | Scheme Switch Flow | Yes | `/api/v1/invest/switch` | **WORKING** |
| `/invest/documents` | Documents Vault | Yes | `/api/v1/invest/documents` | **WORKING** |
| `/invest/notifications` | Notifications Center | Yes | `/api/v1/invest/notifications` | **WORKING** |
| `/invest/advisor` | Linked Advisor View | Yes | `/api/v1/invest/account` | **WORKING** |
| `/profile` | User Profile | Yes | `/api/v1/invest/profile` | **WORKING** |
| `/profile/setup` | Quick Profile Setup | Yes | `/api/v1/invest/profile` | **WORKING** |

### 2. Research & Intelligence Routes

| Route URL | Entry Point | Auth Required | Data Source / API | Verified Status |
|---|---|---|---|---|
| `/funds` | Fund Screener | No | `funds.json`, `/api/search` | **WORKING** |
| `/fund/[scheme_code]` | Fund Research Page | No | `funds.json`, `/api/search` | **WORKING** |
| `/compare` | Side-by-Side Comparison | No | `funds.json` | **WORKING** |
| `/research` | Strategy Builder | No | `funds.json`, `localStorage` | **WORKING** |
| `/discover` | Fund Discovery | No | `daily.json`, `funds.json` | **WORKING** |
| `/market-map` | Market Treemap | No | `daily.json` | **WORKING** |
| `/brief` | Morning Brief | No | `daily.json`, `/news` | **WORKING** |
| `/news` | Financial News | No | Supabase `news_articles` | **WORKING** |
| `/signals` | Category & AMC Signals | No | `daily.json` | **WORKING** |
| `/categories` | Categories List | No | `performance.json` | **WORKING** |
| `/amc` | AMC List | No | `performance.json` | **WORKING** |
| `/performance` | Benchmarks | No | `performance.json` | **WORKING** |

### 3. Advisor, Operations & Management Workspaces

| Route URL | Role Target | Auth Required | Key Functionality | Verified Status |
|---|---|---|---|---|
| `/advisor` | Advisor Landing | No | Marketing & Features | **WORKING** |
| `/advisor/workspace` | Advisor | Yes | Client Roster, Portfolio Summaries, Compliance Tracking | **WORKING** |
| `/operations` | Ops Team | Yes | KYC Queue, Order Lifecycle, Webhooks, Reconciliation | **WORKING** |
| `/management` | Management | Yes | Executive Cockpit, AUM, Flow Metrics, System Health | **WORKING** |

---

## Layout & Application Shell Verification

- **Sticky Header Spacing**: `NavChrome` (`sticky top-0 z-50`) is wrapped with top padding to prevent element overlap.
- **Responsive Layout**: Tested across all breakpoint tiers (320px, 375px, 768px, 1024px, 1440px). Flex wrapping, table scrolling, and mobile drawers function without horizontal scroll breakage.
- **Keyboard Navigation & Accessibility**: Skip link (`#main-content`) is present on every page, with aria labels on interactive dropdowns and buttons.
