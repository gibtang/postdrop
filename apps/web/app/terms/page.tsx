import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | Postdrop",
  description: "Terms for using Postdrop to upload and share files.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-14 text-[#25253d] sm:px-8">
      <Link href="/" className="text-sm font-medium text-[#5b53df] hover:underline">
        Postdrop home
      </Link>
      <h1 className="mt-8 text-4xl font-semibold tracking-tight">Terms of Service</h1>
      <p className="mt-3 text-sm text-[#707087]">Last updated: October 31, 2026</p>

      <div className="mt-8 space-y-8 text-[15px] leading-7 text-[#55556c]">
        <section>
          <p>
            These terms cover your use of Postdrop, a service for uploading web-renderable files
            and sharing them through links. By using Postdrop, you agree to follow these terms.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[#25253d]">Your account and credentials</h2>
          <p className="mt-3">
            Keep your sign-in details and API tokens secure. You are responsible for activity
            through your account and tokens. Revoke a token if you believe it has been exposed.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[#25253d]">Your content and share links</h2>
          <p className="mt-3">
            You keep your rights to content you upload. You give Postdrop permission to host,
            store, process, and deliver that content only as needed to operate the service and
            provide sharing features you request. Anyone with an active share link may view its
            file. You are responsible for choosing what to upload and where to share links.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[#25253d]">Acceptable use</h2>
          <p className="mt-3">
            Do not use Postdrop to violate the law or others’ rights, distribute malware, interfere
            with the service, bypass its security or usage limits, or access another person’s
            account or content without permission. You must have the rights needed to upload and
            share the content you provide.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[#25253d]">Availability and changes</h2>
          <p className="mt-3">
            We may change or suspend parts of Postdrop to maintain, secure, or improve the service.
            We may restrict access when needed to address abuse, security issues, or legal
            requirements. You can stop using Postdrop at any time and can delete artifacts, revoke
            tokens, and revoke share links through the service.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[#25253d]">Disclaimer</h2>
          <p className="mt-3">
            Postdrop is provided on an “as available” basis. To the extent permitted by law, we
            make no warranties about uninterrupted availability or suitability for a particular
            purpose. These terms do not limit rights that cannot legally be limited.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[#25253d]">Contact</h2>
          <p className="mt-3">
            Questions about these terms can be sent to <a className="text-[#5b53df] hover:underline" href="mailto:gibtang@gmail.com">gibtang@gmail.com</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
