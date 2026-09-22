import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

declare module "next-auth" {
  interface Session {
    user: {
      login?: string | null;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  session: { strategy: "jwt" },
  // Vercel sets VERCEL_URL, but preview deploys change host on every push; trust
  // the proxy headers so the callback URL matches whatever host served the page.
  trustHost: true,
  callbacks: {
    jwt({ token, profile }) {
      // `profile` is only present on the sign-in request.
      if (profile && typeof profile.login === "string") token.login = profile.login;
      return token;
    },
    session({ session, token }) {
      session.user.login = typeof token.login === "string" ? token.login : null;
      return session;
    },
  },
});
