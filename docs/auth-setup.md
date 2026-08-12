# Auth setup runbook

Turning on Google sign-in, email verification and password reset.

**Contents**

- [Before you start](#before-you-start)
- [Step 0 — Request SES production access (do this first)](#step-0--request-ses-production-access-do-this-first)
- [Step 1 — Create the Google client ID](#step-1--create-the-google-client-id)
- [Step 2 — Verify your domain in SES](#step-2--verify-your-domain-in-ses)
- [Step 3 — Create SES SMTP credentials](#step-3--create-ses-smtp-credentials)
- [Step 4 — Put the values in place](#step-4--put-the-values-in-place)
- [Step 5 — Deploy](#step-5--deploy)
- [Step 6 — Check it works](#step-6--check-it-works)
- [Troubleshooting](#troubleshooting)
- [Reference: how the feature behaves](#reference-how-the-feature-behaves)
- [Reference: token handling](#reference-token-handling)

---

## Before you start

### What state the site is in right now

The code is live but **switched off**, and stays that way until you finish
Step 4. Right now:

| | Behaviour with nothing configured |
|---|---|
| Google button | Not rendered at all. No broken button on the login page. |
| Verification / reset emails | Written to the backend log instead of sent. |
| Existing users | Unaffected. All 52 accounts were marked verified during the migration, so nobody lost access to contests. |
| New signups | Account is created, user can sign in, but **cannot enter a contest** until they verify — and they can't verify until email works. |

That last row is why this is worth finishing promptly.

### What you'll need

- Access to the Google Cloud Console
- Access to the AWS Console (same account as your EC2/S3)
- DNS access for `rankarenas.com`
- SSH into the EC2 box

### Roughly how long

| Step | Your time | Waiting |
|---|---|---|
| 0. Request SES production access | 5 min | **up to 24 h** ← start this first |
| 1. Google client ID | 10 min | — |
| 2. SES domain verification | 10 min | ~1 h for DNS |
| 3. SMTP credentials | 2 min | — |
| 4–6. Configure, deploy, test | 15 min | — |

---

## Step 0 — Request SES production access (do this first)

A new SES account is **sandboxed**: it can only send to addresses you have
manually verified. That is useless for real signups, and approval takes up to
a day — so get the request in before you do anything else.

1. AWS Console → **SES** → **Account dashboard**
2. Click **Request production access**
3. Fill in the form:
   - Mail type: **Transactional**
   - Website URL: `https://rankarenas.com`
   - Use case: describe it plainly, e.g. *"Account email verification and
     password reset for an exam practice site. Recipients are users who have
     just signed up. No marketing email."*
   - Expected volume: a realistic number (e.g. a few hundred a day)
4. Submit, then carry on with Step 1 while it's pending.

> **While you're still in the sandbox**, signup emails to real users silently
> fail. The account is still created and they can still sign in — they just
> can't enter a contest. See [Troubleshooting](#troubleshooting) for how to
> verify someone by hand if you need to unblock them.

- [ ] Production access requested

---

## Step 1 — Create the Google client ID

### 1a. Configure the consent screen

Google Cloud Console → **APIs & Services** → **OAuth consent screen**

| Field | Value |
|---|---|
| User type | **External** |
| App name | `RankArenas` |
| Support email | your email |
| Authorised domain | `rankarenas.com` |
| Developer contact | your email |
| Scopes | Leave the defaults (`email`, `profile`, `openid`) |

> **Don't add extra scopes.** The defaults need no review. Anything beyond them
> triggers a Google verification process that takes weeks.

When you're ready for the public, click **Publish app**. While it says
"Testing", only accounts listed under *Test users* can sign in — which is
handy for trying it out first.

### 1b. Create the credential

**APIs & Services** → **Credentials** → **Create credentials** → **OAuth client ID**

| Field | Value |
|---|---|
| Application type | **Web application** |
| Name | `RankArenas web` |

**Authorised JavaScript origins** — this is the setting that matters:

```
https://rankarenas.com
https://www.rankarenas.com
http://localhost:5173
```

**Authorised redirect URIs** — leave **empty**. This flow never redirects; the
browser receives an ID token in the page.

### 1c. Copy the client ID

It ends in `.apps.googleusercontent.com`.

> You do **not** need the client secret. This flow doesn't use one — don't put
> it anywhere.

- [ ] Client ID copied

---

## Step 2 — Verify your domain in SES

1. AWS Console → **SES** → **Identities** → **Create identity**
2. Choose **Domain**, enter `rankarenas.com`
3. Tick **Enable DKIM**
4. SES shows you **three CNAME records**. Add all three to your DNS.
5. Add an SPF record on the apex if you don't already have one:

   | Type | Name | Value |
   |---|---|---|
   | TXT | `@` | `v=spf1 include:amazonses.com ~all` |

Verification usually completes within the hour. The identity flips to
**Verified** in the SES console when it's done.

- [ ] Domain shows **Verified** in SES

---

## Step 3 — Create SES SMTP credentials

**SES** → **SMTP settings** → **Create SMTP credentials**

> These are **not** your AWS access keys. SES generates a separate
> username/password pair specifically for SMTP. **The password is shown once**
> — save it before closing the page.

Note your SES region too. The SMTP host follows from it:

```
email-smtp.<your-region>.amazonaws.com
```

Your stack runs in `us-east-1`, so unless you chose otherwise:
`email-smtp.us-east-1.amazonaws.com`

- [ ] SMTP username and password saved

---

## Step 4 — Put the values in place

### 4a. The Google client ID goes in TWO places

> **These must be identical.** The frontend sends a token stamped with the
> client ID; the API rejects it unless the audience matches. A mismatch fails
> with *"Could not verify that Google account."*

**1. In the repo** — [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml), line ~20:

```yaml
VITE_GOOGLE_CLIENT_ID: "123456789-abcdef.apps.googleusercontent.com"
```

**2. On the server** — `.env` next to `docker-compose.prod.yml`:

```sh
GOOGLE_CLIENT_ID=123456789-abcdef.apps.googleusercontent.com
```

The client ID is not a secret — it ships in the page source either way, which
is why it lives in the repo rather than in GitHub Secrets.

### 4b. The email settings go on the server

SSH in, then edit `.env`:

```sh
# Root of the student site — the links inside emails are built from this.
PUBLIC_SITE_URL=https://rankarenas.com

# Amazon SES over SMTP
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=<the SES SMTP username from Step 3>
SMTP_PASS=<the SES SMTP password from Step 3>
MAIL_FROM=RankArenas <no-reply@rankarenas.com>

# Same value as VITE_GOOGLE_CLIENT_ID above
GOOGLE_CLIENT_ID=<your client ID>
```

Two things people get wrong here:

- **`MAIL_FROM` must be on the domain you verified in Step 2.** Any other
  address and every send is rejected.
- **`PUBLIC_SITE_URL` must have no trailing slash** and must be the site users
  actually visit. Get it wrong and every link in every email 404s.

- [ ] `.env` updated on the server
- [ ] `deploy.yml` updated in the repo

---

## Step 5 — Deploy

**The frontend** picks up the client ID at build time, so it needs a deploy —
commit and push `deploy.yml`:

```sh
git add .github/workflows/deploy.yml
git commit -m "chore: enable Google sign-in"
git push
```

**The backend** only needs the container recreated to pick up the new `.env`:

```sh
cd ~/rankarena          # wherever docker-compose.prod.yml lives
docker compose -f docker-compose.prod.yml up -d backend
```

> `restart` is **not** enough — it reuses the old environment. If `up -d` says
> the container is up to date, force it:
> `docker compose -f docker-compose.prod.yml up -d --force-recreate backend`

- [ ] Deployed

---

## Step 6 — Check it works

### Email

```sh
curl -X POST https://api.rankarenas.com/auth/forgot-password \
  -H 'Content-Type: application/json' \
  -d '{"email":"your-own-address@example.com"}'
```

Use an address that **has an account**, or nothing is sent — the endpoint
answers `{"ok":true}` either way on purpose, so it can't be used to find out
who has an account.

The email should arrive within a minute. If it doesn't:

```sh
docker compose -f docker-compose.prod.yml logs --tail=50 backend | grep mailer
```

### Google

Open <https://rankarenas.com/login> in a private window. The Google button
should appear above the email field. Sign in with an account that has never
used the site — you should land on the home page, signed in, with no
verification banner.

### The gate

Sign up with email and password, then try to open a contest **before**
clicking the link in the email. You should see the amber banner and be
refused entry. Click the link, and the banner disappears and contests open.

- [ ] Email arrives
- [ ] Google sign-in works
- [ ] Verification gate works

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Log says `[mailer] SMTP_HOST is not set` | The env never reached the container | Check `.env`, then **recreate** (not restart) the backend |
| Log says `Email address is not verified` | `MAIL_FROM` isn't on your SES-verified domain, **or** you're still in the sandbox and the recipient isn't verified | Finish Step 0/2 |
| Emails send to you but not to real users | Still in the SES sandbox | Wait for production access (Step 0) |
| Google button doesn't appear | `VITE_GOOGLE_CLIENT_ID` was empty at build time | Set it in `deploy.yml` and redeploy the frontend |
| *"Could not verify that Google account."* | `GOOGLE_CLIENT_ID` on the server ≠ `VITE_GOOGLE_CLIENT_ID` in the bundle | Make them identical, recreate the backend |
| Google popup says `origin_mismatch` | The site's origin isn't in **Authorised JavaScript origins** | Add it in Step 1b — exact scheme and host, no path |
| *"Google sign-in is not configured on this server."* | `GOOGLE_CLIENT_ID` missing from `.env` | Step 4a |
| Links in emails 404 | `PUBLIC_SITE_URL` wrong or has a trailing slash | Step 4b |
| A user is stuck unverified and you need them in now | Sandbox, bounced email, etc. | See below |

**Unblocking one user by hand:**

```sh
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "UPDATE users SET email_verified = true WHERE email = 'them@example.com';"
```

---

## Reference: how the feature behaves

You don't need any of this to set it up — it's here for when you're wondering
why something happened.

**Verification gates contests, not access.** An unverified user can sign in,
read, and post in the community. What they can't do is join or submit a
contest or mock test — those return `403` with `code: "EMAIL_NOT_VERIFIED"`,
because they write to the leaderboard and to ratings. A banner across the top
of the page offers a resend.

**Google accounts arrive verified.** Google has already confirmed the address.

**A Google account whose email Google itself hasn't verified is refused.**
Linking one to an existing account by email match would hand that account to
whoever claimed the address.

**Signing in with Google using an existing account's email links the two.**
Same person, second door — not a duplicate account.

**A Google-only account has no password.** Trying to sign in with one gets a
message pointing at the Google button; "Forgot password" will set one.

**Completing a password reset also marks the email verified.** Clicking a link
in the inbox proves the same thing verification asks for.

### Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/auth/register` | — | Creates unverified, emails a link, returns a session |
| `POST` | `/auth/login` | — | |
| `POST` | `/auth/google` | — | Body: `{ credential }` from Google Identity Services |
| `GET` | `/auth/me` | Bearer | Re-reads `emailVerified`; drives the banner |
| `POST` | `/auth/verify-email` | — | Body: `{ token }`; returns a fresh session |
| `POST` | `/auth/resend-verification` | Bearer | 5/hour |
| `POST` | `/auth/forgot-password` | — | Always `{"ok":true}`; 5/hour |
| `POST` | `/auth/reset-password` | — | Body: `{ token, password }`; returns a session |

---

## Reference: token handling

Verification and reset links are 32 bytes of CSPRNG random, base64url encoded.
Only the **SHA-256 is stored** — a dump of `auth_tokens` cannot be replayed
into an account takeover.

- Verification links expire in **24 hours**; reset links in **1 hour**.
- Both are **single-use**, claimed with a conditional update so two concurrent
  requests can't both succeed.
- Issuing a new link of the same type **deletes the previous one**.
- A completed reset **clears every token** for that user.
- `POST /auth/forgot-password` always returns the same response, so it can't be
  used to enumerate accounts.
- Mail-sending endpoints allow **5 requests per hour per IP**, on top of the
  existing 20-per-15-minutes limit across `/auth`.

Google ID tokens are verified server-side against Google's public keys with the
audience checked against `GOOGLE_CLIENT_ID`. Nothing the browser claims about
who the user is gets trusted.
