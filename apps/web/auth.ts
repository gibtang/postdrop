import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import { z } from "zod";
import { authConfig, EMAIL_NOT_VERIFIED } from "./auth.config";
import { connectDb } from "./lib/db";
import { User } from "./lib/models";
import { verifyPassword } from "./lib/crypto";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

type AdapterClientPromise = Parameters<typeof MongoDBAdapter>[0];

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: MongoDBAdapter(
    connectDb().then((mongoose) => mongoose.connection.getClient()) as unknown as AdapterClientPromise,
  ),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // Let verified Google emails sign in to an existing Postdrop user.
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const email = parsed.data.email.toLowerCase();
        const user = await User.findOne({ email, passwordHash: { $ne: null } });
        if (!user || !user.passwordHash) return null;
        if (!(await verifyPassword(parsed.data.password, user.passwordHash))) return null;
        return {
          id: String(user._id),
          email: user.email,
          name: user.name ?? null,
          emailVerified: user.emailVerified ?? null,
          passwordHash: user.passwordHash,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, profile }) {
      if (account?.provider === "google" && profile?.email_verified !== true) {
        return false;
      }
      if (account?.provider === "credentials" && user.passwordHash && !user.emailVerified) {
        throw new Error(EMAIL_NOT_VERIFIED);
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        if (user.email) token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      // JWT strategy: identity comes from the signed token, not a DB session row.
      if (token.sub) session.user.id = token.sub;
      if (token.email) session.user.email = token.email;
      return session;
    },
  },
});
