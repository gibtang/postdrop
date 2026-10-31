import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Edge runtime: imports ONLY the mongoose-free authConfig. Do not import
// "@/auth" here — it pulls in mongoose and breaks the Edge bundle.
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/dashboard/:path*", "/settings/:path*", "/login", "/signup"],
};
