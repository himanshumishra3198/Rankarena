# Google sign-in, email verification and password reset — setup

The code is deployed and inert until you fill in the values below. Until then:

- the Google button **does not render** (no dead button),
- verification and reset emails are **written to the backend container log**
  instead of being sent, so the flows still work end to end if you read the
  link out of `docker compose logs backend`.

Nothing here changes existing accounts. All 52 users at migration time were
marked verified, so nobody loses access to contests.

---

## 1. Google sign-in

### Create the client id

1. <https://console.cloud.google.com/> → create a project (or pick one).
2. **APIs & Services → OAuth consent screen**
   - User type: **External**, then **Publish app** when you're ready. While it
     is in "Testing", only accounts you add under *Test users* can sign in.
   - App name: `RankArenas`. Support email + developer email: yours.
   - Authorised domain: `rankarenas.com`.
   - Scopes: the defaults (`email`, `profile`, `openid`) are enough — do not
     add more, or Google will ask for a verification review.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**
   - **Authorised JavaScript origins** — this is the one that matters for this
     flow:
     ```
     https://rankarenas.com
     https://www.rankarenas.com
     http://localhost:5173
     ```
   - **Authorised redirect URIs**: leave empty. This flow never redirects; the
     browser gets an ID token in-page.
4. Copy the **Client ID** (ends `.apps.googleusercontent.com`).
   You do **not** need the client secret — this flow does not use one.

### Wire it in — two places, and they must match

| Where | What | Why |
|---|---|---|
| `.github/workflows/deploy.yml` → `VITE_GOOGLE_CLIENT_ID` | the client id | baked into the frontend bundle at build time |
| `.env` on the EC2 box → `GOOGLE_CLIENT_ID` | the same client id | the API checks the token's `aud` claim against it |

If they differ, sign-in fails with *"Could not verify that Google account."*
The client id is not a secret — it ships in the page source either way.

---

## 2. Email — Amazon SES

### Verify the domain

1. **SES → Identities → Create identity → Domain** → `rankarenas.com`
2. Enable **DKIM**, then add the three CNAME records SES gives you to your DNS.
   Verification usually completes within the hour.
3. Add an SPF TXT record on the apex if you don't have one:
   `v=spf1 include:amazonses.com ~all`

### Leave the sandbox

A new SES account can only send **to addresses you have verified**, which is
useless for real signups. **SES → Account dashboard → Request production
access.** Approval typically takes under 24 hours.

> Until that is granted, signup emails to real users will silently fail. The
> account is still created and the user can still sign in — they just cannot
> enter a contest until you either get approved or flip `email_verified`
> manually.

### Create SMTP credentials

**SES → SMTP settings → Create SMTP credentials.** These are *not* your AWS
access keys — SES derives a separate username/password pair. Save them; the
password is shown once.

### Fill in `.env` on the server

```sh
PUBLIC_SITE_URL=https://rankarenas.com
SMTP_HOST=email-smtp.us-east-1.amazonaws.com   # must match your SES region
SMTP_PORT=587
SMTP_USER=<SES SMTP username>
SMTP_PASS=<SES SMTP password>
MAIL_FROM=RankArenas <no-reply@rankarenas.com> # must be on the verified domain
GOOGLE_CLIENT_ID=<same as VITE_GOOGLE_CLIENT_ID>
```

Then `docker compose -f docker-compose.prod.yml up -d backend`.

`PUBLIC_SITE_URL` builds the links inside the emails. Get it wrong and every
link 404s.

---

## 3. What the rules are

**Verification gates contests, not access.** An unverified user can sign in,
read, and post in the community. `POST /contests/:id/join`, `POST
/contests/:id/submit` and `POST /mocks/:id/submit` return `403` with
`code: "EMAIL_NOT_VERIFIED"`. A banner across the top offers a resend.

**Google accounts are verified on arrival** — Google has already confirmed the
address. A Google sign-in whose email is *not* verified with Google is
rejected outright, because linking it to an existing account by email match
would hand that account to whoever claimed the address.

**Signing in with Google using the email of an existing password account links
the two.** Same person, second door.

**A Google-only account has no password.** Trying to sign in with one gets a
message pointing at the Google button, and "Forgot password" will set one.

**Completing a password reset also marks the email verified** — clicking a link
in the inbox proves the same thing verification asks for.

---

## 4. Token handling

Verification and reset links are 32 bytes of CSPRNG random, base64url. Only the
**SHA-256 is stored**; a dump of `auth_tokens` cannot be replayed into an
account takeover.

- verification links expire in **24 hours**, reset links in **1 hour**
- both are **single-use**, claimed with a conditional update so two concurrent
  requests cannot both succeed
- issuing a new link of the same type **deletes the old one**
- a completed reset **clears every token** for that user
- `POST /auth/forgot-password` always answers `200` with the same body, so it
  cannot be used to find out who has an account
- the mail-sending endpoints allow **5 requests per hour per IP** on top of the
  existing 20-per-15-minutes limit on `/auth`

---

## 5. Checking it works

```sh
# Should arrive in the inbox, not the log:
curl -X POST https://api.rankarenas.com/auth/forgot-password \
  -H 'Content-Type: application/json' -d '{"email":"you@example.com"}'

# If nothing arrives, the reason is in here:
docker compose -f docker-compose.prod.yml logs --tail=50 backend | grep mailer
```

`[mailer] SMTP_HOST is not set` means the env never reached the container —
check `.env` and that you recreated rather than restarted it.
