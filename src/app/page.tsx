import { headers } from "next/headers";
import { App } from "@/components/App";
import { AuthButtons } from "@/components/AuthButtons";
import { resolveViewer } from "@/lib/authz";
import { type LinkPlan, type ParamBag } from "@/lib/link";
import { planFromParams } from "@/lib/linkPlan";
import { listActivity, listTickets } from "@/lib/tickets";
import type { Viewer } from "@/lib/types";

export const dynamic = "force-dynamic";

async function currentOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function SetupNotice({ origin, detail }: { origin: string; detail: string }) {
  return (
    <div className="wrap">
      <header className="top">
        <div>
          <h1>Wave Ledger</h1>
          <p className="sub">Not wired up yet.</p>
        </div>
      </header>
      <div className="panel doc">
        <div>
          <h2>The board cannot reach its database</h2>
          <p>
            <code>{origin}</code> is deployed, but something it needs is missing. Set these in the
            Vercel project&rsquo;s environment variables, then redeploy:
          </p>
          <ul>
            <li>
              <code>DATABASE_URL</code> — Postgres connection string (Vercel&rsquo;s Storage tab
              injects this when you attach Neon).
            </li>
            <li>
              <code>AUTH_SECRET</code> — any long random string.
            </li>
            <li>
              <code>AUTH_GITHUB_ID</code> and <code>AUTH_GITHUB_SECRET</code> — from a GitHub OAuth
              app whose callback is <code>{origin}/api/auth/callback/github</code>.
            </li>
            <li>
              <code>WRITER_LOGINS</code> — comma-separated GitHub logins allowed to write.
            </li>
            <li>
              <code>WAVE_LEDGER_TOKEN</code> — the bearer token Claude sessions use.
            </li>
          </ul>
          <p>
            Then run the migration and seed once: <code>npm run db:migrate</code> and{" "}
            <code>npm run db:seed</code>. The README has the full runbook.
          </p>
          <div className="pre">
            <pre>{detail}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function Page({ searchParams }: { searchParams: Promise<ParamBag> }) {
  const origin = await currentOrigin();
  const sp = await searchParams;

  let viewer: Viewer = {
    login: null,
    name: null,
    image: null,
    handle: null,
    canWrite: false,
    canDelete: false,
    openBoard: false,
    signInAvailable: false,
  };
  try {
    viewer = await resolveViewer();
  } catch {
    // A missing AUTH_SECRET should not take the whole board down; it just means
    // nobody is signed in yet.
  }

  try {
    const [tickets, activity] = await Promise.all([listTickets(), listActivity({ limit: 100 })]);
    const plan: LinkPlan = await planFromParams(sp);

    return (
      <App
        initialTickets={tickets}
        initialActivity={activity}
        viewer={viewer}
        plan={plan}
        origin={origin}
        auth={<AuthButtons viewer={viewer} />}
      />
    );
  } catch (err) {
    return <SetupNotice origin={origin} detail={err instanceof Error ? err.message : String(err)} />;
  }
}
