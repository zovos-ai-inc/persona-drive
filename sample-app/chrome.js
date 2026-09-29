// Shared header and footer for the sample site. A deliberate design choice, common
// on real sites: Security, Status and Privacy are linked only from the footer.
const header = `
<header><div class="bar">
  <a class="brand" href="/">Lumen Helpdesk</a>
  <nav aria-label="Primary">
    <a href="/product.html">Product</a>
    <a href="/pricing.html">Pricing</a>
    <a href="/docs.html">Docs</a>
    <a href="/contact.html">Contact</a>
    <a href="/app.html">Sign in</a>
  </nav>
  <a class="cta" href="/contact.html">Start a trial</a>
</div></header>`
const footer = `
<footer><div class="cols">
  <div><strong>Product</strong><ul><li><a href="/product.html">Overview</a></li><li><a href="/pricing.html">Pricing</a></li><li><a href="/docs.html">Docs</a></li><li><a href="/docs-sso.html">Single sign-on</a></li></ul></div>
  <div><strong>Company</strong><ul><li><a href="/about.html">About</a></li><li><a href="/careers.html">Careers</a></li><li><a href="/contact.html">Contact</a></li></ul></div>
  <div><strong>Trust</strong><ul><li><a href="/security.html">Security</a></li><li><a href="/status.html">Status</a></li><li><a href="/privacy.html">Privacy</a></li></ul></div>
  <div><strong>Elsewhere</strong><ul><li><a href="https://example.com/lumen">Community forum</a></li><li><a href="mailto:hello@example.com">hello@example.com</a></li></ul></div>
</div></footer>`
document.body.insertAdjacentHTML('afterbegin', header)
document.body.insertAdjacentHTML('beforeend', footer)
