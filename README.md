# paidextension.dev

Marketing and docs site for [PaidExtension](https://paidextension.dev), the
$0/month stack for paid browser extensions. Static HTML/CSS served from `docs/`
by GitHub Pages; the kit itself lives in the private `paidextension` repo.

```bash
npm ci
npm run check   # eslint, html-validate, local link check, CSP check, JSON-LD check
npm run serve   # http://localhost:8898
npm run og      # re-render docs/og.png from scripts/og-card.html (needs a local Chrome)
```

- `docs/CNAME` pins the custom domain; `paidextension.com` redirects here at the Cloudflare edge.
- Every page carries a strict `<meta>` CSP (GitHub Pages cannot set headers); `scripts/check-csp.js` guards it.
- Checkout links (`buy.polar.sh/polar_cl_…`) live only in `docs/index.html`: the hero CTA, the pricing cards and the Product JSON-LD in `<head>`. Solo's link pre-applies the launch discount; both redirect to `docs/thanks.html`. The header "Buy" on every page goes to `/#pricing`.
- The JSON-LD repeats the FAQ and the prices; `npm run check:jsonld` fails if they drift from the visible copy. When the launch offer ends, change the Solo offer price to `149` along with the card.
