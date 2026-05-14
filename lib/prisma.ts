import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

/** After `schema.prisma` changes, dev HMR can keep a stale PrismaClient without new delegates (e.g. `user`). */
function hasUserDelegate(client: unknown): boolean {
  if (typeof client !== "object" || client === null) return false;
  const u = (client as { user?: { create?: unknown } }).user;
  return typeof u?.create === "function";
}

const createClient = () =>
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

export const prisma: PrismaClient = (() => {
  const cached = globalThis.prisma;
  if (cached && hasUserDelegate(cached)) {
    return cached;
  }
  if (cached && process.env.NODE_ENV !== "production") {
    void cached.$disconnect();
  }
  const client = createClient();
  if (process.env.NODE_ENV !== "production") {
    globalThis.prisma = client;
  }
  return client;
})();

