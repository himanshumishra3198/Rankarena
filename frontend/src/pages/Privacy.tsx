import Navbar from '../components/Navbar'
import { Link } from 'react-router-dom'
import { usePageMeta } from '../lib/seo'
import { LEGAL_CONTACT, LEGAL_UPDATED } from '../lib/legal'

/**
 * Privacy policy.
 *
 * Written against what the code actually does rather than a template: the
 * columns in the users table, the third parties we genuinely call, and the
 * keys we genuinely put in localStorage. Where a right is not yet automated —
 * account deletion is by email today — it says so instead of promising a
 * button that does not exist.
 */
export default function Privacy() {
  usePageMeta(
    'Privacy Policy — RankArenas',
    'What RankArenas collects, why, who it is shared with, and how to have it deleted.',
  )

  return (
    <>
      <Navbar />
      <div className="page legal-page">
        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last updated {LEGAL_UPDATED}</p>

        <p className="legal-lede">
          RankArenas is a practice platform for SSC exam aspirants. This page explains
          exactly what we collect, why we hold it, and what you can ask us to do with it.
        </p>

        <h2>Who we are</h2>
        <p>
          RankArenas is operated from India and reachable at{' '}
          <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>. That address is also
          where you should send any request described on this page.
        </p>

        <h2>What we collect</h2>

        <h3>When you create an account</h3>
        <ul>
          <li><strong>Your name and email address.</strong> The name is shown publicly next to your posts, comments and leaderboard entries. The email is not shown to other users.</li>
          <li><strong>Your password, hashed.</strong> We store a bcrypt hash, never the password itself. Nobody at RankArenas can read it.</li>
        </ul>

        <h3>If you sign in with Google</h3>
        <ul>
          <li><strong>Your Google account identifier, email address, name and profile picture URL.</strong> We request only the basic <code>email</code>, <code>profile</code> and <code>openid</code> scopes. We cannot see your Gmail, Drive, contacts or anything else in your Google account.</li>
          <li>We never receive or store your Google password.</li>
        </ul>

        <h3>When you use the platform</h3>
        <ul>
          <li><strong>Your answers, scores, rating and rank</strong> for every contest and mock test you take.</li>
          <li><strong>How long you spent on each question</strong>, and which questions you flagged for review, so the result page can show your time analysis.</li>
          <li><strong>Your bookmarks</strong>, and any articles, comments, votes and follows you create in the community.</li>
          <li><strong>Reports you file</strong> about a question.</li>
        </ul>

        <h3>Automatically</h3>
        <ul>
          <li><strong>Google Analytics</strong> records which pages are visited and roughly where visitors are from. It is aggregate traffic measurement; we do not use it to build a profile of you.</li>
          <li>Our server keeps ordinary request logs, including IP addresses, for security and debugging.</li>
        </ul>

        <h2>What we do not collect</h2>
        <ul>
          <li>No payment or card details — the platform is free and we take no payments.</li>
          <li>No government ID, address or phone number.</li>
          <li>No advertising or cross-site tracking cookies, and we sell nothing to anyone.</li>
        </ul>

        <h2>Why we hold it</h2>
        <ul>
          <li><strong>To run your account</strong> — signing you in, and confirming your email so that leaderboards are not filled with throwaway addresses.</li>
          <li><strong>To run contests</strong> — scoring, ranking, ratings and result analysis.</li>
          <li><strong>To show the community</strong> — your name and rating appear alongside anything you post.</li>
          <li><strong>To improve the platform</strong> — aggregate statistics such as the average time spent on a question, which appear on result pages in a form that does not identify anyone.</li>
        </ul>

        <h2>What other people can see</h2>
        <p>
          Your <strong>name, rating, contest results, rank, and anything you post in the
          community</strong> are public. Leaderboards and public profiles are visible to
          anyone, including people who are not signed in.
        </p>
        <p>
          Your <strong>email address, password, bookmarks and individual answers</strong>{' '}
          are not shown to other users.
        </p>

        <h2>Who we share it with</h2>
        <p>We do not sell your data. We use these providers to run the service:</p>
        <ul>
          <li><strong>Amazon Web Services</strong> — hosting, database, and image storage. Data is held in the United States (us-east-1).</li>
          <li><strong>Amazon SES</strong> — delivering verification and password-reset emails.</li>
          <li><strong>Google</strong> — Sign-In (only if you use it) and Google Analytics.</li>
        </ul>
        <p>
          We may also disclose information where the law requires it, or to investigate
          cheating, abuse, or a security incident.
        </p>

        <h2>What we store in your browser</h2>
        <p>
          We do not use cookies for advertising. We use your browser's local storage for:
        </p>
        <ul>
          <li>your sign-in token and basic account details, so you stay signed in;</li>
          <li>your light or dark mode preference;</li>
          <li>a draft of your answers during a live contest, so a refresh or a dropped connection does not cost you your paper.</li>
        </ul>
        <p>
          Google Analytics sets its own cookies. Clearing your browser storage signs you
          out and discards any unsaved contest draft.
        </p>

        <h2>How long we keep it</h2>
        <p>
          Account and contest data is kept while your account exists, because removing a
          past attempt would corrupt the leaderboards and ratings of everyone who competed
          against you. Email verification links expire after 24 hours and password reset
          links after 1 hour; both are single-use and stored only as a hash.
        </p>

        <h2>Your choices</h2>
        <ul>
          <li><strong>Correct your details</strong> — your name can be changed from your profile page.</li>
          <li><strong>Get a copy of your data, or have your account deleted</strong> — email <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a> from the address on the account. There is no self-service delete button yet, so this is handled by hand; we will confirm when it is done.</li>
          <li><strong>Opt out of analytics</strong> — any standard browser or extension that blocks Google Analytics works; nothing on the platform depends on it.</li>
          <li><strong>Disconnect Google</strong> — you can revoke RankArenas at <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">your Google account permissions page</a>. Set a password with “Forgot password” first, or you will not be able to sign in.</li>
        </ul>
        <p>
          On deletion we remove your account, email and answers. Posts and comments you
          made in the community are shown as “[deleted]” so that replies to them still
          make sense.
        </p>

        <h2>Children</h2>
        <p>
          RankArenas is intended for candidates preparing for competitive examinations and
          is not directed at children under 13. If you believe a child has created an
          account, write to us and we will remove it.
        </p>

        <h2>Security</h2>
        <p>
          Traffic is served over HTTPS. Passwords are stored as bcrypt hashes and
          email links as SHA-256 hashes, so a copy of our database would not let anyone
          sign in as you. No system is perfect, and we will tell affected users promptly
          if we ever discover a breach involving personal data.
        </p>

        <h2>Changes</h2>
        <p>
          If we change this policy we will update the date at the top of this page.
          Continuing to use RankArenas after a change means you accept the revised policy.
        </p>

        <p className="legal-footer">
          See also our <Link to="/terms">Terms of Service</Link>.
        </p>
      </div>
    </>
  )
}
