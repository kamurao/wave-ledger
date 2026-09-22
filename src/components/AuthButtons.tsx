import { signIn, signOut } from "@/lib/auth";
import type { Viewer } from "@/lib/types";

/**
 * The whole reason the board left the artifact runtime: here, we decide who may
 * write, rather than the host deciding it for us.
 */
export function AuthButtons({ viewer }: { viewer: Viewer }) {
  if (!viewer.login && !viewer.signInAvailable) {
    // No OAuth app configured. On an open board that is the intended setup, so
    // say what the viewer can do rather than offering a button that cannot work.
    return (
      <span className="auth">
        <span className={`role${viewer.canWrite ? " writer" : ""}`}>
          {viewer.canWrite ? "open board" : "read only"}
        </span>
      </span>
    );
  }

  if (!viewer.login) {
    return (
      <form
        action={async () => {
          "use server";
          await signIn("github");
        }}
      >
        <button className="btn sm" type="submit">
          Sign in with GitHub
        </button>
      </form>
    );
  }

  return (
    <span className="auth">
      {viewer.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={viewer.image} alt="" width={22} height={22} />
      )}
      <span className="name">@{viewer.login}</span>
      <span className={`role${viewer.canWrite ? " writer" : ""}`}>
        {viewer.canWrite ? "writer" : "reader"}
      </span>
      <form
        action={async () => {
          "use server";
          await signOut();
        }}
      >
        <button className="btn sm" type="submit">
          Sign out
        </button>
      </form>
    </span>
  );
}
