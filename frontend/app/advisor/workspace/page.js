import { notFound } from "next/navigation";
import AdvisorWorkspace from "../../components/invest/AdvisorWorkspace";
import { requireRole } from "../../lib/apiAuth";

export const metadata = { title: "Advisor Workspace | Suasion Securities" };

// H6 (docs/LAUNCH_BLOCKER_REPORT.md): this route rendered an inert internal-console shell to any
// visitor, unauthenticated or not -- no advisor/admin role grant flow exists anywhere yet, so this
// 404s for everyone today (matching the report's own recommendation) and starts working the
// moment a real role-granting mechanism ships, with no further change needed here.
export default async function Page() {
  const user = await requireRole(["advisor", "admin"]);
  if (!user) notFound();
  return <AdvisorWorkspace />;
}
