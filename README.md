# Anantam Hackathon

One page at `anantamracing.com/hackathon/`, plus the five showcase projects.
Static HTML/CSS/JS, no build step — it deploys with the rest of the site.

| Path | What it is |
| --- | --- |
| `/hackathon/` | The hackathon page: the challenge, the five projects, how it works, judging, entry by email, FAQ |
| `/hackathon/luma/` | LUMA — a laboratory in your browser |
| `/hackathon/prism/` | PRISM — see the science differently |
| `/hackathon/janus/` | JANUS — STEM that works without the internet |
| `/hackathon/openlab/` | OPENLAB — build more with what you already have |
| `/hackathon/stemscape/` | STEMSCAPE — engineer the world |
| `/hackathon/2026/` | Archive of the concluded 2026 edition |

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
