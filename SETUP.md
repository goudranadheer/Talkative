# Talkative — Backend Setup (Supabase)

One-time setup to run the campus pilot. The app never ships API keys — Groq and
Anthropic keys live only in Supabase edge-function secrets; users sign in with
email + 6-digit code and get a free quota (300 utterances ≈ 3 conversations).

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → New project (free tier is fine).
2. Note the **Project ref** (in the URL), **Project URL**, and **anon key**
   (Settings → API).

## 2. Link and deploy from this repo

```bash
npx supabase login                      # opens browser
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push                    # applies supabase/migrations/*.sql

# Secrets: the only place your provider keys ever live
npx supabase secrets set GROQ_API_KEY=gsk_...
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

npx supabase functions deploy transcribe
npx supabase functions deploy ai
```

## 3. Sign-in flow (password auth, no emails)

The pilot uses **email + password with auto-confirm** (`mailer_autoconfirm: true`
in the project's auth config) — no emails are sent at all, so there's nothing
to configure and no sender rate limits. This is deliberate: on the free tier,
Supabase locks email-template editing unless you bring custom SMTP, so OTP
codes can't work out of the box.

**Later upgrade (optional):** once you connect a custom SMTP provider
(Authentication → Emails → SMTP Settings; e.g. [Resend](https://resend.com) or
Gmail with an app password), you can switch back to 6-digit OTP codes: edit
the Magic Link template to include `{{ .Token }}` and restore the OTP variant
of `AuthScreen` (see git history). Password reset emails also require SMTP.

## 4. Point the app at your project

```bash
cp .env.example .env
# fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
npx expo start --clear   # --clear so the new env vars are picked up
```

## 5. Build the campus APK

```bash
npx eas-cli build --profile preview --platform android
```

Share the build link / QR code. Done.

## Operating the pilot

- **Give someone more quota:** Table Editor → `profiles` → raise `quota_units`.
- **Watch usage:** `usage_events` table logs every STT/translate/suggest/coach
  call with token counts.
- **Cost control:** only `translate` consumes quota (1 unit per utterance);
  every call is blocked once a user's quota is spent (the app shows a friendly
  "free minutes used up" message and stops the mic).
- **Phase 2 (payments):** a top-up = `UPDATE profiles SET quota_units = quota_units + N`.
  Wire that to a Stripe webhook when you're ready — no app changes needed.
