import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Check,
  Clock3,
  Code2,
  FileCheck2,
  FileUp,
  Link2,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Terminal,
  UserRound,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Postdrop — file handoffs for AI agents",
  description:
    "Give your AI agent a simple way to send files to people, collect a reply or edited file, and keep every handoff on an expiring link.",
  openGraph: {
    title: "Postdrop — file handoffs for AI agents",
    description:
      "A small, agent-native bridge between generated files and human review.",
    url: "https://thepostdrop.dev",
    siteName: "Postdrop",
    type: "website",
  },
};

const steps = [
  {
    number: "01",
    icon: FileUp,
    title: "Your agent sends a file",
    description:
      "Call one MCP tool, CLI command, or API endpoint with a file and the person it is for.",
  },
  {
    number: "02",
    icon: UserRound,
    title: "A person reviews it",
    description:
      "They open an expiring link, download the file, and reply or upload a replacement. No account needed.",
  },
  {
    number: "03",
    icon: MessageSquare,
    title: "Your agent picks it back up",
    description:
      "Check the Drop for its status and Reply, then download any edited file through the CLI or API.",
  },
];

const surfaces = [
  {
    icon: Sparkles,
    name: "MCP server",
    label: "For tool-using agents",
    description:
      "Give an MCP client two focused tools: postdrop_send and postdrop_check.",
    code: "postdrop_send · postdrop_check",
  },
  {
    icon: Terminal,
    name: "CLI",
    label: "For scripts and shells",
    description:
      "Send a file in one command, check its status, and download an Edit when it comes back.",
    code: "postdrop drop ./report.pdf --to reviewer@example.com",
  },
  {
    icon: Code2,
    name: "HTTP API",
    label: "For custom integrations",
    description:
      "Use a small REST API with an Agent key scoped to one Agent.",
    code: "POST /v1/drops · GET /v1/drops/:id/result",
  },
];

const safetyPoints = [
  "One Agent key per Agent, with isolated access to its Drops",
  "Links expire in 1–720 hours; the default is 7 days",
  "File, Reply, and Edit content is purged when a Drop expires",
];

function Brand() {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5" aria-label="Postdrop home">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#635bff] text-sm font-bold tracking-tight text-white shadow-sm">
        pd
      </span>
      <span className="text-[17px] font-semibold tracking-[-0.04em] text-[#17172d]">
        postdrop
      </span>
    </Link>
  );
}

export default function Home() {
  return (
    <main className="landing-shell min-h-screen overflow-hidden text-[#15152b]">
      <header className="relative z-10 mx-auto max-w-7xl px-5 pt-5 sm:px-8 lg:px-10">
        <nav
          aria-label="Main navigation"
          className="flex items-center justify-between rounded-2xl border border-white/80 bg-white/75 px-4 py-3 shadow-[0_8px_28px_rgba(38,40,82,0.05)] backdrop-blur sm:px-5"
        >
          <Brand />
          <div className="hidden items-center gap-8 text-sm font-medium text-[#62627b] md:flex">
            <a href="#how-it-works" className="transition hover:text-[#635bff]">
              How it works
            </a>
            <a href="#for-agents" className="transition hover:text-[#635bff]">
              For agents
            </a>
            <a href="#pricing" className="transition hover:text-[#635bff]">
              Pricing
            </a>
          </div>
          <Link
            href="/login"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#17172d] px-4 text-sm font-semibold text-white transition hover:bg-[#302f51]"
          >
            Dashboard <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </nav>
      </header>

      <section className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-16 sm:px-8 sm:pt-20 lg:grid-cols-[0.98fr_1.02fr] lg:gap-8 lg:px-10 lg:pb-28 lg:pt-24">
        <div className="relative z-10 max-w-2xl">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#dedbff] bg-white/80 px-3.5 py-2 text-xs font-semibold tracking-wide text-[#544bd6] shadow-sm">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            A human handoff for your AI agent
          </div>
          <h1 className="max-w-[760px] text-[clamp(3rem,6.2vw,5.4rem)] font-semibold leading-[0.99] tracking-[-0.075em] text-[#17172d]">
            Let your agent
            <br className="hidden sm:block" /> hand the file
            <br className="hidden sm:block" /> back to a person.
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-[#606079] sm:text-[19px]">
            One small bridge from agent output to human review. Send a file,
            share an expiring link, and bring the Reply or edited file back into
            the workflow.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a
              href="#for-agents"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#635bff] px-5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(99,91,255,0.22)] transition hover:bg-[#554ce8]"
            >
              Explore agent setup <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[#e2e1ed] bg-white/80 px-5 text-sm font-semibold text-[#282841] transition hover:border-[#c9c5ff] hover:text-[#544bd6]"
            >
              Open dashboard <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[#707088]">
            <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-[#6259ed]" /> MCP, CLI, and REST API</span>
            <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-[#6259ed]" /> No recipient account</span>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[620px] lg:ml-auto">
          <div className="absolute -inset-8 rounded-[48px] bg-[radial-gradient(ellipse_at_center,rgba(124,114,255,0.18),transparent_68%)] blur-2xl" />
          <div className="relative rounded-[28px] border border-[#e4e2f2] bg-white/90 p-3 shadow-[0_28px_90px_rgba(39,37,94,0.14)] backdrop-blur">
            <div className="rounded-[20px] bg-[#17172d] p-5 text-white sm:p-6">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#635bff]">
                    <Bot className="h-[18px] w-[18px]" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">Agent handoff</p>
                    <p className="mt-0.5 text-[11px] text-white/45">Example workflow</p>
                  </div>
                </div>
                <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-200">
                  Ready
                </span>
              </div>

              <div className="mt-5 rounded-xl border border-white/10 bg-[#101020] p-4 font-mono text-xs leading-6 sm:text-[13px]">
                <p className="text-white/40">// MCP tool call</p>
                <p className="mt-1 text-[#aaa5ff]">postdrop_send({"{"}</p>
                <p className="pl-4 text-white/80">file_path: <span className="text-[#b4e5cc]">"./report.pdf"</span>,</p>
                <p className="pl-4 text-white/80">recipient_email: <span className="text-[#b4e5cc]">"alex@example.com"</span>,</p>
                <p className="pl-4 text-white/80">ttl_hours: <span className="text-[#f7cc8c]">72</span></p>
                <p className="text-[#aaa5ff]">{"}"})</p>
              </div>

              <div className="mt-4 flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.045] p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#635bff]/20 text-[#b9b4ff]">
                  <Link2 className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Expiring review link</p>
                    <span className="inline-flex items-center gap-1 text-[11px] text-white/50"><Clock3 className="h-3 w-3" /> 72 hours</span>
                  </div>
                  <p className="mt-1 truncate font-mono text-[11px] text-[#b9b4ff]">thepostdrop.dev/l/your-drop-link</p>
                </div>
              </div>

              <div className="my-4 flex items-center gap-3 px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
                <span className="h-px flex-1 bg-white/10" />
                Human review
                <span className="h-px flex-1 bg-white/10" />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/[0.045] p-3.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-white/85">
                    <UserRound className="h-3.5 w-3.5 text-[#aaa5ff]" /> Recipient
                  </div>
                  <p className="mt-2 text-[11px] leading-5 text-white/50">Opens link · reviews file · replies</p>
                </div>
                <div className="rounded-xl border border-emerald-200/15 bg-emerald-200/[0.06] p-3.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-100">
                    <MessageSquare className="h-3.5 w-3.5" /> Back to agent
                  </div>
                  <p className="mt-2 text-[11px] leading-5 text-white/55">Reply and edited file available</p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3 text-xs text-[#77768e]">
              <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#635bff]" /> Expiring link. No recipient login.</span>
              <span className="hidden font-mono text-[10px] sm:inline">postdrop_check</span>
            </div>
          </div>
          <div className="absolute -bottom-5 -left-5 hidden items-center gap-2 rounded-xl border border-[#e7e5f4] bg-white px-3.5 py-3 text-xs font-medium text-[#41415d] shadow-lg sm:flex">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f0efff] text-[#635bff]"><FileCheck2 className="h-4 w-4" /></span>
            A clear path back to your agent
          </div>
        </div>
      </section>

      <section className="border-y border-[#e9e8f1] bg-white/65" aria-label="Postdrop integrations">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-6 text-center sm:px-8 md:flex-row md:items-center md:justify-between md:text-left lg:px-10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9090a5]">Fits the way agents already work</p>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm font-semibold text-[#55556e] md:justify-end">
            <span className="inline-flex items-center gap-2"><Sparkles className="h-4 w-4 text-[#635bff]" /> MCP</span>
            <span className="inline-flex items-center gap-2"><Terminal className="h-4 w-4 text-[#635bff]" /> CLI</span>
            <span className="inline-flex items-center gap-2"><Code2 className="h-4 w-4 text-[#635bff]" /> HTTP API</span>
            <span className="inline-flex items-center gap-2"><Bot className="h-4 w-4 text-[#635bff]" /> Agent-scoped keys</span>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-7xl scroll-mt-8 px-5 py-24 sm:px-8 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#635bff]">The whole loop</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.055em] text-[#17172d] sm:text-5xl">A handoff that comes back.</h2>
          <p className="mt-5 text-base leading-7 text-[#696980] sm:text-lg">Files can leave an agent run without getting lost in a shared drive or stuck in a one-way link.</p>
        </div>
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {steps.map(({ number, icon: Icon, title, description }) => (
            <article key={number} className="rounded-2xl border border-[#e5e4ef] bg-white/80 p-6 shadow-[0_5px_20px_rgba(39,37,94,0.035)] sm:p-7">
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f0efff] text-[#6259ed]"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                <span className="font-mono text-xs text-[#a1a0b5]">{number}</span>
              </div>
              <h3 className="mt-6 text-lg font-semibold tracking-tight text-[#26263e]">{title}</h3>
              <p className="mt-2.5 text-sm leading-6 text-[#72728a]">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="for-agents" className="scroll-mt-8 bg-[#19192f] px-5 py-24 text-white sm:px-8 lg:py-28">
        <div className="mx-auto max-w-7xl lg:px-2">
          <div className="grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#aaa5ff]">Made for agent workflows</p>
              <h2 className="mt-4 max-w-xl text-3xl font-semibold leading-tight tracking-[-0.055em] sm:text-5xl">A tool call, not another workspace.</h2>
            </div>
            <p className="max-w-2xl text-base leading-7 text-white/60 sm:text-lg">Give your agent one key and a focused interface for sending a file out, checking whether it was answered, and picking up the next step.</p>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {surfaces.map(({ icon: Icon, name, label, description, code }) => (
              <article key={name} className="rounded-2xl border border-white/10 bg-white/[0.045] p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#635bff]/20 text-[#bbb6ff]"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                  <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-white/45">{label}</span>
                </div>
                <h3 className="mt-5 text-lg font-semibold">{name}</h3>
                <p className="mt-2 min-h-[72px] text-sm leading-6 text-white/55">{description}</p>
                <code className="mt-4 block overflow-x-auto rounded-lg border border-white/10 bg-[#101020] px-3 py-2.5 font-mono text-[11px] leading-5 text-[#c2beff]">{code}</code>
              </article>
            ))}
          </div>

          <div className="mt-5 grid gap-5 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-7 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="font-mono text-xs text-[#aaa5ff]">AGENT TOOL FLOW</p>
              <p className="mt-2 text-sm leading-6 text-white/65">Send a file with <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs text-white">postdrop_send</code>, then poll for a Reply or Edit with <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs text-white">postdrop_check</code>.</p>
            </div>
            <a href="#quick-start" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-semibold text-white transition hover:border-[#aaa5ff]/70 hover:bg-white/5">See example <ArrowRight className="h-4 w-4" /></a>
          </div>
        </div>
      </section>

      <section id="quick-start" className="mx-auto grid max-w-7xl gap-12 px-5 py-24 sm:px-8 lg:grid-cols-2 lg:items-center lg:px-10 lg:py-28">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#635bff]">Small surface area</p>
          <h2 className="mt-4 max-w-xl text-3xl font-semibold leading-tight tracking-[-0.055em] text-[#17172d] sm:text-5xl">Easy for an agent to call. Easy for a person to use.</h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-[#696980] sm:text-lg">Postdrop returns a Link and expiry. The Recipient can open it without signing in, and your Agent stays in control of its own Drops.</p>
          <div className="mt-8 space-y-4">
            {[
              "One Agent key, isolated to that Agent’s Drops",
              "A small MCP tool surface with send and check",
              "Replies and replacement files on the same Link page",
            ].map((item) => <p key={item} className="flex items-start gap-3 text-sm font-medium text-[#4f4f68]"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#635bff]" />{item}</p>)}
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-[#e5e4ef] bg-[#17172d] shadow-[0_24px_70px_rgba(39,37,94,0.13)]">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff8b87]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#f4c96b]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#72d3a0]" />
            </div>
            <span className="font-mono text-[11px] text-white/40">example · CLI</span>
          </div>
          <div className="space-y-5 p-5 font-mono text-xs leading-6 sm:p-7 sm:text-[13px]">
            <div>
              <p className="text-white/40"># Send a generated file for review</p>
              <p className="mt-1 text-white"><span className="text-[#aaa5ff]">$</span> postdrop drop ./report.pdf \</p>
              <p className="pl-4 text-white">--to reviewer@example.com --ttl 72</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.045] p-4">
              <p className="text-[#9de0ba]">https://thepostdrop.dev/l/&lt;expiring-link&gt;</p>
              <p className="mt-1 text-white/45">expiresAt: &lt;ISO timestamp&gt;</p>
            </div>
            <div>
              <p className="text-white/40"># Later, check for a Reply or Edit</p>
              <p className="mt-1 text-white"><span className="text-[#aaa5ff]">$</span> postdrop check drop_…</p>
              <p className="text-[#9de0ba]">status: answered</p>
              <p className="text-white/75">reply: Looks good—use this version.</p>
            </div>
            <p className="border-t border-white/10 pt-4 font-sans text-[11px] leading-5 text-white/40">Set <code className="text-white/65">POSTDROP_API_KEY</code> to an Agent key from the dashboard.</p>
          </div>
        </div>
      </section>

      <section className="border-y border-[#e8e7f1] bg-white/70 px-5 py-20 sm:px-8 lg:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:px-2">
          <div>
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f0efff] text-[#6259ed]"><ShieldCheck className="h-6 w-6" /></span>
            <h2 className="mt-5 text-3xl font-semibold tracking-[-0.05em] text-[#17172d] sm:text-4xl">Built for files that shouldn’t live forever.</h2>
            <p className="mt-4 max-w-lg text-sm leading-6 text-[#696980] sm:text-base">Every Drop is scoped to its Agent. When the Link expires, Postdrop purges the file and any Reply or Edit content.</p>
          </div>
          <ul className="space-y-4 rounded-2xl border border-[#e5e4ef] bg-white p-6 sm:p-8">
            {safetyPoints.map((point) => <li key={point} className="flex gap-3 text-sm leading-6 text-[#4f4f68] sm:text-base"><Check className="mt-1 h-4 w-4 shrink-0 text-[#635bff]" />{point}</li>)}
          </ul>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-7xl scroll-mt-8 px-5 py-24 sm:px-8 lg:px-10 lg:py-28">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#635bff]">Straightforward limits</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.055em] text-[#17172d] sm:text-4xl">Start with the handoff. Scale when you need to.</h2>
            <p className="mt-4 max-w-lg text-sm leading-6 text-[#696980] sm:text-base">No per-seat messaging. Storage is shared across your Account.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <article className="rounded-2xl border border-[#e5e4ef] bg-white p-6 sm:p-7">
              <p className="text-sm font-semibold text-[#696980]">Free</p>
              <p className="mt-3 text-4xl font-semibold tracking-[-0.06em] text-[#17172d]">$0</p>
              <p className="mt-2 text-sm text-[#77768e]">For getting started</p>
              <ul className="mt-6 space-y-3 text-sm text-[#55556e]">
                <li className="flex gap-2"><Check className="h-4 w-4 text-[#635bff]" />100 MB total storage</li>
                <li className="flex gap-2"><Check className="h-4 w-4 text-[#635bff]" />Up to 1 GB per file</li>
                <li className="flex gap-2"><Check className="h-4 w-4 text-[#635bff]" />Expiring Links</li>
              </ul>
            </article>
            <article className="relative rounded-2xl border border-[#d5d2ff] bg-[#f5f4ff] p-6 sm:p-7">
              <span className="absolute right-5 top-5 rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#635bff]">Flat monthly</span>
              <p className="text-sm font-semibold text-[#6259ed]">Pro</p>
              <p className="mt-3 text-4xl font-semibold tracking-[-0.06em] text-[#17172d]">$15<span className="ml-1 text-sm font-medium tracking-normal text-[#77768e]">/ month</span></p>
              <p className="mt-2 text-sm text-[#77768e]">For more handoffs</p>
              <ul className="mt-6 space-y-3 text-sm text-[#55556e]">
                <li className="flex gap-2"><Check className="h-4 w-4 text-[#635bff]" />10 GB total storage</li>
                <li className="flex gap-2"><Check className="h-4 w-4 text-[#635bff]" />Up to 1 GB per file</li>
                <li className="flex gap-2"><Check className="h-4 w-4 text-[#635bff]" />No per-seat fee</li>
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section className="px-5 pb-20 sm:px-8 lg:px-10 lg:pb-24">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 rounded-[28px] bg-[#635bff] px-6 py-10 text-white shadow-[0_18px_55px_rgba(99,91,255,0.2)] sm:px-10 sm:py-12 lg:flex-row lg:items-center lg:justify-between lg:px-12">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.17em] text-white/65">Give your agent a way back</p>
            <h2 className="mt-3 max-w-2xl text-3xl font-semibold leading-tight tracking-[-0.055em] sm:text-4xl">Put human review in the loop, without adding another workspace.</h2>
          </div>
          <Link href="/login" className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-[#393295] transition hover:bg-[#f1f0ff]">
            Open dashboard <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-[#e9e8f1] bg-white/55 px-5 py-7 sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3"><Brand /><span className="hidden h-4 w-px bg-[#dedde8] sm:block" /><span className="text-xs text-[#88879c]">A bridge between agent output and human review.</span></div>
          <div className="flex items-center gap-5 text-xs font-medium text-[#77768e]">
            <a href="#how-it-works" className="transition hover:text-[#635bff]">How it works</a>
            <a href="#for-agents" className="transition hover:text-[#635bff]">For agents</a>
            <Link href="/login" className="inline-flex items-center gap-1 transition hover:text-[#635bff]">Dashboard <ArrowUpRight className="h-3.5 w-3.5" /></Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
