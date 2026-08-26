import Navbar from '../components/Navbar'
import { Link } from 'react-router-dom'
import { usePageMeta } from '../lib/seo'
import { LEGAL_CONTACT, LEGAL_UPDATED } from '../lib/legal'

/**
 * Terms of service.
 *
 * Deliberately short and specific to this platform — the rules that actually
 * matter here are about cheating in a rated contest and about who owns
 * community posts, not the usual boilerplate.
 */
export default function Terms() {
  usePageMeta(
    'Terms of Service — RankArenas',
    'The rules for using RankArenas: accounts, fair play in contests, community conduct, and content.',
  )

  return (
    <>
      <Navbar />
      <div className="page legal-page">
        <h1>Terms of Service</h1>
        <p className="legal-updated">Last updated {LEGAL_UPDATED}</p>

        <p className="legal-lede">
          These terms cover your use of RankArenas. By creating an account or signing in,
          you agree to them.
        </p>

        <h2>1. Your account</h2>
        <ul>
          <li>You need a working email address, and you must confirm it before you can enter a contest or mock test.</li>
          <li>Give accurate details. Your display name is public — do not impersonate someone else.</li>
          <li>One account per person. Extra accounts made to manipulate ratings or leaderboards will be removed.</li>
          <li>You are responsible for what happens under your account. Keep your password to yourself and tell us if you think someone else has it.</li>
          <li>You must be old enough to enter into this agreement where you live, and at least 13.</li>
        </ul>

        <h2>2. Fair play</h2>
        <p>
          Contests are rated, and a rating only means something if it is earned. While a
          contest or mock test is running, you must not:
        </p>
        <ul>
          <li>get help from another person, or take the paper on someone else's behalf;</li>
          <li>share questions, answers or screenshots with anyone before the contest ends;</li>
          <li>use more than one account, or coordinate answers with other candidates;</li>
          <li>use automated tools to read questions or submit answers;</li>
          <li>attempt to reach answers through the API before results are published.</li>
        </ul>
        <p>
          Where we find any of this, we may void the attempt, reset the rating, or suspend
          the account. Ratings, ranks and leaderboard positions are ours to correct — we
          will adjust them where an attempt turns out to be invalid.
        </p>

        <h2>3. Community conduct</h2>
        <p>When posting articles or comments, do not post:</p>
        <ul>
          <li>abuse, harassment, or content attacking people over religion, caste, gender, or origin;</li>
          <li>spam, advertising, or referral links;</li>
          <li>anyone's private information;</li>
          <li>material that infringes someone else's copyright — including question papers you do not have the right to share;</li>
          <li>anything unlawful in India.</li>
        </ul>
        <p>We may remove any post and suspend the account behind it.</p>

        <h2>4. Content</h2>
        <p>
          <strong>Yours.</strong> You keep ownership of the articles and comments you
          write. By posting them you give us permission to display, store and distribute
          them on the platform. Deleting a post shows it as “[deleted]” so that replies to
          it still make sense.
        </p>
        <p>
          <strong>Ours.</strong> Questions, solutions, the design and the code of the
          platform belong to RankArenas or its licensors. Do not scrape, copy or
          redistribute the question bank.
        </p>
        <p>
          If you believe something here infringes your copyright, write to{' '}
          <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a> identifying the material
          and we will look into it.
        </p>

        <h2>5. Questions and answers</h2>
        <p>
          We work to keep the question bank accurate, but mistakes happen. Every question
          has a <strong>Report a problem</strong> link — please use it. Where an answer key
          is wrong we will correct it, and we may re-score affected attempts.
        </p>
        <p>
          RankArenas is practice material. It is not affiliated with, endorsed by, or
          connected to the Staff Selection Commission or any other examining body, and
          nothing here guarantees a result in a real examination.
        </p>

        <h2>6. Availability</h2>
        <p>
          The service is free and provided as-is. We do not promise it will be
          uninterrupted — a contest can be affected by an outage on our side or on yours.
          Where a technical fault on our side materially affects a contest, we will
          normally void or re-run it, but we cannot compensate you for a lost attempt.
        </p>
        <p>
          We may change, suspend or discontinue features, and we will give notice of
          significant changes where we reasonably can.
        </p>

        <h2>7. Liability</h2>
        <p>
          To the extent the law allows, RankArenas is not liable for indirect or
          consequential loss arising from your use of the platform, including examination
          outcomes, lost preparation time, or lost data.
        </p>

        <h2>8. Ending your use</h2>
        <p>
          You may stop using RankArenas at any time, and can ask us to delete your account
          by writing to <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>. We may
          suspend or terminate an account that breaks these terms, and for serious
          breaches we may do so without warning.
        </p>

        <h2>9. Changes to these terms</h2>
        <p>
          We may revise these terms; the date at the top shows when they last changed.
          Continuing to use the platform after a change means you accept the new terms.
        </p>

        <h2>10. Governing law</h2>
        <p>
          These terms are governed by the laws of India, and the courts of India have
          exclusive jurisdiction over any dispute arising from them.
        </p>

        <p className="legal-footer">
          See also our <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </div>
    </>
  )
}
