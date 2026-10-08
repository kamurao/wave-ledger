import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * The short, shareable form of a ticket link: /t/12 (or /t/t-frost-tower).
 * It only redirects to the board with the ticket open, so the address a
 * person pastes stays short and the board stays the one place that renders it.
 */
export async function GET(req: Request, ctx: { params: Promise<{ ref: string }> }) {
  const { ref } = await ctx.params;
  const url = new URL("/", req.url);
  url.searchParams.set("ticket", decodeURIComponent(ref).replace(/^#/, ""));
  return NextResponse.redirect(url, 307);
}
