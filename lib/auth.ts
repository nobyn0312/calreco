import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";

/**
 * JWT の署名・検証に必須。未設定だと App Router の `getServerSession` が常に null になり、
 * `/api/me` などが 401 になる一方、ブラウザのセッション表示だけ動くことがある。
 * 本番では必ず NEXTAUTH_SECRET（または AUTH_SECRET）を環境変数で設定すること。
 */
function authSecret(): string | undefined {
  const fromEnv = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.trim();
  if (process.env.NODE_ENV === "development") {
    return "__caloreco_local_dev_secret_change_in_env_for_production__";
  }
  return undefined;
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  secret: authSecret(),
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "ユーザー名", type: "text" },
        password: { label: "パスワード", type: "password" },
      },
      async authorize(credentials) {
        const username = credentials?.username?.trim();
        const password = credentials?.password;
        if (!username || !password) return null;

        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) return null;
        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          name: user.username,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.sub = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
};
