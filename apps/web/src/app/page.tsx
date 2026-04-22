"use client";

import { useEffect, useState } from "react";

import { env } from "@my-better-t-app/env/web";
import { cn } from "@my-better-t-app/ui/lib/utils";

function apiBase() {
  return env.NEXT_PUBLIC_SERVER_URL.replace(/\/$/, "");
}

const TITLE_TEXT = `
 ██████╗ ███████╗████████╗████████╗███████╗██████╗
 ██╔══██╗██╔════╝╚══██╔══╝╚══██╔══╝██╔════╝██╔══██╗
 ██████╔╝█████╗     ██║      ██║   █████╗  ██████╔╝
 ██╔══██╗██╔══╝     ██║      ██║   ██╔══╝  ██╔══██╗
 ██████╔╝███████╗   ██║      ██║   ███████╗██║  ██║
 ╚═════╝ ╚══════╝   ╚═╝      ╚═╝   ╚══════╝╚═╝  ╚═╝

 ████████╗    ███████╗████████╗ █████╗  ██████╗██╗  ██╗
 ╚══██╔══╝    ██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║ ██╔╝
    ██║       ███████╗   ██║   ███████║██║     █████╔╝
    ██║       ╚════██║   ██║   ██╔══██║██║     ██╔═██╗
    ██║       ███████║   ██║   ██║  ██║╚██████╗██║  ██╗
    ╚═╝       ╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝
 `;

export default function Home() {
  const [health, setHealth] = useState<"checking" | "ok" | "error">("checking");

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch(`${apiBase()}/`, {
          method: "GET",
          cache: "no-store",
        });
        const body = await res.text().catch(() => "");
        if (cancelled) {
          return;
        }
        if (res.ok && body.trim() === "OK") {
          setHealth("ok");
        } else {
          setHealth("error");
        }
      } catch {
        if (!cancelled) {
          setHealth("error");
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="container mx-auto max-w-3xl px-4 py-2">
      <pre className="overflow-x-auto font-mono text-sm">{TITLE_TEXT}</pre>
      <div className="grid gap-6">
        <section className="rounded-lg border p-4">
          <h2 className="mb-2 font-medium">API Status</h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span
              className={cn(
                "inline-block size-2.5 shrink-0 rounded-full",
                health === "ok" &&
                  "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.65)]",
                health === "error" && "bg-red-500",
                health === "checking" && "animate-pulse bg-muted-foreground/50",
              )}
              aria-hidden
            />
            {health === "checking" && (
              <span>Checking backend root <span className="font-mono">{apiBase()}/</span>…</span>
            )}
            {health === "ok" && (
              <span className="text-foreground">
                API online — root returned <span className="font-mono">OK</span>
              </span>
            )}
            {health === "error" && (
              <span className="text-destructive">
                API unreachable — is the server running at {apiBase()}?
              </span>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
