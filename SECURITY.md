# Security Policy

## Reporting a vulnerability

If you discover a security issue, please report it privately via GitHub
Security Advisories:

1. Open the repository on GitHub.
2. Go to the **Security** tab → **Advisories** → **Report a vulnerability**.
3. Provide a description and reproduction steps.

Do **not** open public issues for security reports.

## Scope

This app is local-first and DSGVO-konform by construction:

- App data lives in the user's browser (IndexedDB). No required account.
- Any optional sync uses client-side AES-GCM encryption; the server only
  sees ciphertext.
- No third-party telemetry or analytics SDKs.

In-scope vulnerabilities include:

- Cryptographic weaknesses in the sync layer (if used)
- XSS or injection vectors in the UI
- Cloudflare Worker endpoints accepting malformed input
- Service worker cache-poisoning vectors

Out of scope:

- Self-XSS or social-engineering scenarios
- Best-practice deviations without a concrete exploit

## Response

I aim to acknowledge reports within 7 days and provide a remediation plan
within 30 days. Critical issues are patched as soon as practical.
