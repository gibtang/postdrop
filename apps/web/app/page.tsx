import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bot, Globe, KeyRound, ShieldCheck, Upload } from "lucide-react";

export const metadata: Metadata = {
  title: "Postdrop — share web-renderable artifacts from your agents",
  description:
    "Agents upload artifacts with a bearer token, share a link, and anyone can open the result in a browser. View-only, no accounts, open source.",
  openGraph: {
    title: "Postdrop — share web-renderable artifacts from your agents",
    description:
      "Upload with a token over the remote MCP server or REST API, share a link, and humans view it right in the browser.",
    siteName: "Postdrop",
    type: "website",
  },
};

const valueProps = [
  {
    icon: Bot,
    title: "Agents upload with a token",
    description:
      "One bearer key for the remote MCP server or REST API. Your agent POSTs a file to /v1/artifacts — or streams larger ones straight to storage via presigned uploads.",
  },
  {
    icon: Globe,
    title: "Share a renderable link",
    description:
      "Every artifact gets a share link. Recipients open it in any browser and see the file rendered inline — images, PDFs, video, audio, or text. No download, no account.",
  },
  {
    icon: ShieldCheck,
    title: "View-only by design",
    description:
      "Links are read-only and can carry an expiry. Revoke from the dashboard and the link stops working instantly. Active formats are sandboxed away from Postdrop's origin.",
  },
];

const FORMAT_SENTENCE =
  "Postdrop accepts web-renderable formats only: PNG, JPEG, GIF, WebP, AVIF, SVG, PDF, MP4, WebM, MP3, WAV, OGG, TXT, MD, HTML, JSON, CSV, and XML.";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Postdrop",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Web",
  url: "https://thepostdrop.dev",
  description:
    "Agents upload artifacts with a bearer token, share a link, and anyone can open the result in a browser. View-only, no accounts, open source.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  author: { "@type": "Organization", name: "Postdrop" },
};

function Brand() {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5" aria-label="Postdrop home">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#635bff] text-sm font-bold tracking-tight text-white shadow-sm">
        pd
      </span>
      <span className="text-[17px] font-semibold tracking-[-0.04em] text-[#17172d]">postdrop</span>
    </Link>
  );
}

export default function Home() {
  return (
    <main className="landing-shell min-h-screen text-[#15152b]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header className="mx-auto max-w-6xl px-5 pt-5 sm:px-8">
        <nav
          aria-label="Main navigation"
          className="flex items-center justify-between rounded-2xl border border-white/80 bg-white/75 px-4 py-3 shadow-[0_8px_28px_rgba(38,40,82,0.05)] backdrop-blur"
        >
          <Brand />
          <div className="flex items-center gap-4 text-sm font-medium text-[#62627b]">
            <a href="#how-it-works" className="hidden transition hover:text-[#635bff] sm:inline">
              How it works
            </a>
            <a
              href="https://github.com/gibtang/postdrop"
              className="hidden transition hover:text-[#635bff] sm:inline"
            >
              Docs
            </a>
            <Link
              href="/login"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#17172d] px-4 text-sm font-semibold text-white transition hover:bg-[#302f51]"
            >
              Get started
            </Link>
          </div>
        </nav>
      </header>

      <section className="mx-auto max-w-3xl px-5 pb-16 pt-20 text-center sm:px-8 lg:pt-24">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#dedbff] bg-white/80 px-3.5 py-2 text-xs font-semibold tracking-wide text-[#544bd6] shadow-sm">
          <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
          Agent-to-human, in the browser
        </div>
        <h1 className="text-[clamp(2.4rem,5.5vw,4rem)] font-semibold leading-[1.03] tracking-[-0.06em] text-[#17172d]">
          Your agent makes files.
          <br />
          Postdrop makes them shareable.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-[#606079]">
          Postdrop is the handoff between agents and humans: agents upload
          web-renderable artifacts with a bearer token, get a share link, and
          anyone can open the result in a browser — rendered inline, view-only,
          no account required.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/login"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#635bff] px-6 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(99,91,255,0.22)] transition hover:bg-[#554ce8]"
          >
            Get started <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <a
            href="https://github.com/gibtang/postdrop"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[#e2e1ed] bg-white/80 px-6 text-sm font-semibold text-[#282841] transition hover:border-[#c9c5ff] hover:text-[#544bd6]"
          >
            Read the docs
          </a>
        </div>
        <p className="mt-6 text-sm text-[#707088]">{FORMAT_SENTENCE}</p>
        <p className="mt-1 text-sm text-[#707088]">
          Up to 5 MB per artifact — uploads over 4.5 MB go direct to storage. 500 MB total quota per account.
        </p>
      </section>

      <section id="how-it-works" className="border-y border-[#e9e8f1] bg-white/65 py-20 lg:py-24">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <h2 className="text-center text-3xl font-semibold tracking-[-0.055em] text-[#17172d] sm:text-4xl">
            Token in, share link out.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-base leading-7 text-[#696980]">
            Three steps, no recipient setup.
          </p>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {valueProps.map(({ icon: Icon, title, description }) => (
              <article
                key={title}
                className="rounded-2xl border border-[#e5e4ef] bg-white/80 p-6 shadow-[0_5px_20px_rgba(39,37,94,0.035)]"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f0efff] text-[#6259ed]">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-lg font-semibold tracking-tight text-[#26263e]">{title}</h3>
                <p className="mt-2.5 text-sm leading-6 text-[#72728a]">{description}</p>
              </article>
            ))}
          </div>
          <div className="mx-auto mt-10 max-w-2xl overflow-hidden rounded-2xl border border-[#e5e4ef] bg-[#17172d] shadow-[0_24px_70px_rgba(39,37,94,0.13)]">
            <div className="border-b border-white/10 px-5 py-3 font-mono text-[11px] text-white/40">example · MCP server</div>
            <div className="space-y-4 p-5 font-mono text-xs leading-6 text-white sm:p-6 sm:text-[13px]">
              <p className="text-white/60"># point any agent at the remote MCP server — no install</p>
              <p>
                <span className="text-[#aaa5ff]">"mcpServers"</span>: {"{"}
              </p>
              <p className="pl-4">
                <span className="text-[#aaa5ff]">"postdrop"</span>: {"{"} "url":
                "https://thepostdrop.dev/api/mcp", "headers": {"{"} "Authorization": "Bearer
                pd_live_…" {"}"} {"}"}
              </p>
              <p>{"}"}</p>
              <p className="text-white/60">
                # tools: upload_artifact · upload_artifact_from_url · list_artifacts · get_artifact
                · share_artifact · unshare_artifact · delete_artifact
              </p>
              <p className="rounded-lg border border-white/10 bg-white/[0.045] p-3 text-[#9de0ba]">
                “upload ./chart.png and share it” → https://thepostdrop.dev/a/&lt;token&gt;
              </p>
              <p className="text-white/60">
                # agent docs: <a className="underline" href="/skills.md">/skills.md</a> · REST: /v1 · docs/CONTRACT.md
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-16 sm:px-8">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 rounded-[28px] bg-[#635bff] px-6 py-10 text-center text-white shadow-[0_18px_55px_rgba(99,91,255,0.2)] sm:px-10">
          <Upload className="h-6 w-6 text-white/80" aria-hidden="true" />
          <h2 className="max-w-xl text-2xl font-semibold leading-tight tracking-[-0.05em] sm:text-3xl">
            Give your agent a way to show its work.
          </h2>
          <Link
            href="/login"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-semibold text-[#393295] transition hover:bg-[#f1f0ff]"
          >
            Get started <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-[#e9e8f1] bg-white/55 px-5 py-7 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Brand />
            <span className="hidden h-4 w-px bg-[#dedde8] sm:block" />
            <span className="text-xs text-[#88879c]">Agent-to-human artifact sharing.</span>
          </div>
          <div className="flex items-center gap-5 text-xs font-medium text-[#77768e]">
            <a
              href="https://github.com/gibtang/postdrop"
              className="inline-flex items-center gap-1 transition hover:text-[#635bff]"
            >
              Open source · Apache-2.0
            </a>
            <Link href="/privacy" className="transition hover:text-[#635bff]">
              Privacy
            </Link>
            <Link href="/terms" className="transition hover:text-[#635bff]">
              Terms
            </Link>
            <Link href="/login" className="transition hover:text-[#635bff]">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
