# Anantam Hackathon

One hub page plus the five showcase projects. Static HTML/CSS/JS, no build
step — it deploys with the rest of the site.

## Two hosts

The hub is served from its own subdomain; the projects are served from the
main domain. Links that cross between them **must be absolute**.

| Live URL | Source | What it is |
| --- | --- | --- |
| `hackathon.anantamracing.com/` | `hackathon/index.html` | The hub: the challenge, the five projects, how it works, judging, entry by email, FAQ |
| `anantamracing.com/hackathon/luma/` | `hackathon/luma/` | LUMA — a laboratory in your browser |
| `anantamracing.com/hackathon/prism/` | `hackathon/prism/` | PRISM — see the science differently |
| `anantamracing.com/hackathon/janus/` | `hackathon/janus/` | JANUS — STEM that works without the internet |
| `anantamracing.com/hackathon/openlab/` | `hackathon/openlab/` | OPENLAB — build more with what you already have |
| `anantamracing.com/hackathon/stemscape/` | `hackathon/stemscape/` | STEMSCAPE — engineer the world |
| `anantamracing.com/hackathon/2026/` | `hackathon/2026/` | Archive of the concluded 2026 edition |

The hub canonicalises to the subdomain, so `anantamracing.com/hackathon/`
serves the same file but defers to it — the same arrangement inspire, rise
and sustain use. For that reason the hub is not listed in the main
`sitemap.xml`; its project pages are. If you want the hub indexed under its
own host, give that host its own `sitemap.xml` and `robots.txt`.

Within a project, root-relative paths (`/hackathon/luma/...`) are correct
because projects live on the main domain. Back-links to the hub and the
hub's links out to the projects are absolute, so they work from either host.

## Editing between editions

Everything an organizer changes lives in the `CONFIG` block near the top of the
script in `index.html`:

```js
const CONFIG = {
    entriesOpen: true,                 // false swaps the form for a closed notice
    email: 'anantamracing@gmail.com',  // where entries and enquiries go
    closedMessage: '...'               // shown when entriesOpen is false
};
```

The five showcase cards come from the `PROJECTS` array and the judging weights
from `CRITERIA`, both in the same script.

There is no database and no backend. Entries open a pre-filled message in the
sender's own email client; nothing is stored on the site. Dates are deliberately
not published on the page — they are sent by email to each cohort so no one
reads a stale calendar.

## Local preview

From the repository root:

```bash
python3 -m http.server 4321
```

Then open http://localhost:4321/hackathon/.

## The five projects

Each project is independent: its own identity, navigation, design system and
documentation, with no shared code or styling with this page. They link back
here with a "Back to Hackathon" link and carry a small "supported and showcased
by Anantam Hackathon" line in their footers. Do not restyle them to match this
page — looking like five different teams built them is the point.
