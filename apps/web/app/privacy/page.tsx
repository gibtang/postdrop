import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Postdrop",
  description: "How Postdrop handles account information, Google sign-in data, and shared content.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-14 text-[#25253d] sm:px-8">
      <Link href="/" className="text-sm font-medium text-[#5b53df] hover:underline">
        Postdrop home
      </Link>
      <h1 className="mt-8 text-4xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-3 text-sm text-[#707087]">Last updated: October 31, 2026</p>

      <div className="mt-8 space-y-8 text-[15px] leading-7 text-[#55556c]">
        <section>
          <p>
            Postdrop helps people upload web-renderable files and share them through links. This
            policy explains what information we handle, why we use it, and the choices available
            to you.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[#25253d]">Information we handle</h2>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>
              <strong>Account information:</strong> your email address, name, profile image, and
              account identifier. If you sign in with Google, we receive basic profile and email
              information needed to identify your Google account. If you use an email and password,
              Postdrop stores a password hash rather than your plain-text password.
            </li>
            <li>
              <strong>Google sign-in information:</strong> Postdrop uses Google only to sign you
              in. We receive your basic profile and email information and store the Google account
              record with your Postdrop account. If Google returns OAuth access or refresh tokens,
              Auth.js stores them with that account so the sign-in connection can be maintained.
              Postdrop does not use Google data to access other Google services, serve advertising,
              or sell data.
            </li>
            <li>
              <strong>Content and service records:</strong> filenames, file types, sizes, uploaded
              files, API-token names and identifiers, share-link settings, and actions such as
              uploads, edits, and revocations. API-token secrets are stored as hashes.
            </li>
            <li>
              <strong>Secret pastes:</strong> the paste feature stores encrypted content with
              expiry and one-time-view information. A paste cannot be viewed after it expires or
              has been opened once; its stored ciphertext is removed during a cleanup pass.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[#25253d]">How we use information</h2>
          <p className="mt-3">
            We use information to authenticate accounts, operate Postdrop, store and deliver
            content you upload, create and manage share links, protect the service, and send
            account-verification or password-reset emails when email delivery is enabled.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[#25253d]">Sharing and service providers</h2>
          <p className="mt-3">
            Anyone with an active share link may view the associated file without a Postdrop
            account. Links may be revoked or set to expire, but recipients may keep copies they
            have already downloaded or captured.
          </p>
          <p className="mt-3">
            Postdrop uses Google for sign-in, MongoDB for account and service records, Backblaze B2
            for uploaded files, and Resend for transactional email when configured. These services
            process information as needed to provide Postdrop. We do not sell Google user data.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[#25253d]">Retention and your choices</h2>
          <p className="mt-3">
            Account information is kept while your account is active. You can delete artifacts,
            revoke API tokens, and revoke share links from Postdrop. To request account or personal
            data deletion, contact us at <a className="text-[#5b53df] hover:underline" href="mailto:gibtang@gmail.com">gibtang@gmail.com</a>.
            Some operational records may be retained as needed to protect and operate the service.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[#25253d]">Cookies and security</h2>
          <p className="mt-3">
            Postdrop uses cookies needed for sign-in and session management. We use reasonable
            safeguards to protect information, but no online service can guarantee absolute
            security.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[#25253d]">Contact and updates</h2>
          <p className="mt-3">
            For privacy questions or requests, email <a className="text-[#5b53df] hover:underline" href="mailto:gibtang@gmail.com">gibtang@gmail.com</a>.
            We may update this policy and will post the current version on this page.
          </p>
        </section>
      </div>
    </main>
  );
}
