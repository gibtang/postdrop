import type { NextAuthConfig } from "next-auth";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    passwordHash?: string | null;
    emailVerified?: Date | null;
  }
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

export const EMAIL_NOT_VERIFIED = "EMAIL_NOT_VERIFIED";

/**
 * Edge-safe slice of the Auth.js config. NO mongoose, node:crypto, or model
 * imports here — middleware.ts runs on the Edge runtime and imports ONLY
 * this file. Node-bound pieces (MongoDB adapter, Credentials authorize)
 * live in auth.ts.
 *
 * JWT sessions (not database): the Edge middleware cannot reach the Mongo
 * adapter, so the session must be verifiable from AUTH_SECRET alone. Users
 * and OAuth accounts still persist via the adapter in auth.ts.
 */
export const authConfig = {
  providers: [], // real providers are added in auth.ts (node runtime)
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    authorized({ request, auth: session }) {
      const path = request.nextUrl.pathname;
      const isAuthed = !!session?.user;
      const isProtected = path.startsWith("/dashboard") || path.startsWith("/settings");
      if (!isAuthed && isProtected) return false; // redirects to pages.signIn
      if (isAuthed && (path === "/login" || path === "/signup")) {
        return Response.redirect(new URL("/dashboard", request.nextUrl));
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
