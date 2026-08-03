# FarmFlow code review

**Review date:** 20 July 2026  
**Review type:** Read-only source review  
**Status:** No application files were changed. This report is the only review deliverable created.

## Scope and method

This checkout is the FarmFlow GitHub Pages support, authentication-action, and deep-link site. It contains 39 tracked files, principally HTML, CSS, static assets, `404.html`, the Firebase web configuration, and Android App Links metadata.

It does **not** contain the FarmFlow Android application source: there are no Gradle build files, Kotlin/Java sources, Android manifests, resource directories, or test suites. Therefore this is a complete review of the repository provided, but **not an Android-app code review**. The Android repository/build must be supplied for a review of app authentication, storage, networking, permissions, Firebase rules, deep-link handling, and release configuration.

Checks completed:

- Reviewed all executable JavaScript and the security-relevant static configuration.
- Reviewed the public account-deletion and privacy-flow pages.
- Checked all local HTML `href` and `src` references: **0 broken in-repository references**.
- Ran `git diff --check`; the worktree was clean before this report was created.

## Findings

### P1 — Email-only account-deletion request can permit unauthorised deletion

**Location:** [account-deletion/index.html](account-deletion/index.html), lines 41–45

The public deletion route instructs a user to request deletion by email and says the service will verify only that the request "came from your account's email address." An email sender address is not reliable proof of account control: messages can be spoofed, a mailbox can be compromised, and a forwarded/shared address may not identify the account holder. If support staff act on the stated procedure alone, an attacker could cause irreversible deletion of another user's account and data.

**Recommendation:** require a second factor that proves current account control before actioning a web request—for example, a signed-in deletion flow, a short-lived Firebase-authenticated confirmation link sent to the registered address, or an in-app confirmation. The public page and staff runbook should state the exact authentication and confirmation steps. Do not rely on the `From` address.

### P2 — The authentication handler trusts an attacker-controlled Firebase project key

**Location:** [auth/action/index.html](auth/action/index.html), lines 248–283

The handler reads `apiKey` from the query string and overwrites the committed FarmFlow Firebase configuration with it:

```js
const urlApiKey = params.get("apiKey");
if (urlApiKey) cfg.apiKey = urlApiKey;
```

Firebase action links expose an API key, but this page already ships the intended FarmFlow configuration. Allowing the query value to select the key lets a third party construct an email-action URL for a Firebase project they control and have it processed on the trusted FarmFlow origin. That makes the official reset/verification UI available to support a branded phishing flow and weakens the expected binding between this handler and the FarmFlow project.

**Recommendation:** always initialise the SDK from the committed FarmFlow configuration, or require the URL value to exactly equal the configured project API key before accepting it. Also reject unexpected action modes before initialising/actioning the SDK.

### P3 — Continue URL validation permits non-HTTPS and arbitrary ports

**Location:** [auth/action/index.html](auth/action/index.html), lines 263–271

`safeContinue()` checks only `u.hostname`. It consequently accepts URLs such as `http://www.farmflowcaribbean.com/...` and `https://www.farmflowcaribbean.com:8443/...`, despite the comment saying only an own-subdomain target is permitted. This can send a user from a sensitive password or email action to an unencrypted endpoint or an unintended service if one becomes reachable on that hostname.

**Recommendation:** allow only `https:`, the exact approved hostname, and the default HTTPS port; ideally permit only a small allow-list of known paths. Keep the fixed Play Store URL as the fallback.

### P3 — A malformed encoded listing path can break the deep-link router

**Location:** [404.html](404.html), lines 16–23

The router passes the raw path segment directly to `decodeURIComponent()`. A path containing an invalid percent escape (for example, `/listing/%`) throws `URIError`; the script then stops before it forwards the valid parts of a request. This is a small availability/robustness defect rather than an injection issue, because the eventual display uses `textContent` and `encodeURIComponent`.

**Recommendation:** catch decoding failures and show the normal 404 page (or reject the link cleanly). Validate the accepted listing-ID format before constructing the intent link.

## Notes and non-findings

- The committed Firebase web API key is a client identifier, not by itself a secret. Its presence in `assets/firebase-config.js` is expected. Firebase Authentication configuration, Google Cloud API-key restrictions, and Firebase Security Rules cannot be assessed from this static-site repository.
- User-controlled listing names and IDs are rendered with `textContent` and encoded before entering the Android intent URL. No reflected DOM-XSS sink was found in the listing flow.
- The Android App Links statement exists at `.well-known/assetlinks.json`, but its relationship to the app manifest and signing certificates cannot be verified without the Android source or release artifact.
- Legal-policy accuracy and the operational support process should be reviewed separately with the responsible legal and support owners; this review assessed the implementation and stated process, not jurisdictional compliance.

## Recommended remediation order

1. Replace the email-only deletion verification process before exposing or relying on it.
2. Remove or strictly bind the query-string Firebase API-key override.
3. Tighten the post-action continuation allow-list and add a malformed-link regression test for the 404 router.
4. Provide the Android application repository or release build for the requested Android-specific review.

