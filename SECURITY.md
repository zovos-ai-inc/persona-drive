# Security policy

Do not report vulnerabilities in public issues. Email **security@zovos.ai** with a
description, the steps to reproduce, and how you would like to be credited. We
acknowledge within 3 business days and agree a disclosure date with you.

This tool drives a browser against a site you name and sends the site's text to the
TypeSafe (Jev) API. Before anything is sent or written to disk it passes through
`src/capture/redact.ts`, which replaces presigned URLs, session and token cookies,
bearer tokens, JWT-shaped strings and email addresses with placeholders. Run it only
against sites and accounts you are allowed to test, and read-only unless you mean it.
