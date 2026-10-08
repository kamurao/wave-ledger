import { META } from "@/lib/containers";
import { json } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The enumerations a writer needs, so an agent never has to guess a legal value. */
export async function GET() {
  return json(META);
}
