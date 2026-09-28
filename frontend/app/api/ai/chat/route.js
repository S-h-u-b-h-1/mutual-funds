import { contextFor } from "../../../lib/ai/server";
import { handleChat } from "../../../lib/ai/service.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function POST(request) {
  return handleChat(request, { contextFor });
}
