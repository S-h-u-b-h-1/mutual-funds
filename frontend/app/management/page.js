import { notFound } from "next/navigation";
import { ManagementDashboard } from "../components/invest/InternalConsole";
import { requireRole } from "../lib/apiAuth";

export const metadata = { title: "Management Dashboard | Suasion Securities" };

// H6 (docs/LAUNCH_BLOCKER_REPORT.md): see app/advisor/workspace/page.js for the full rationale --
// same fix, same reasoning. No admin role grant flow exists yet, so this 404s for everyone today.
export default async function Page() {
  const user = await requireRole(["admin"]);
  if (!user) notFound();
  return <ManagementDashboard />;
}
