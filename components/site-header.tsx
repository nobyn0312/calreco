"use client";

import Link from "next/link";
import { NavAuth } from "@/components/nav-auth";

export function SiteHeader() {
  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
        <Link href="/" className="text-lg font-semibold tracking-tight text-neutral-900">
          Calreco
        </Link>
        <NavAuth />
      </div>
    </header>
  );
}
