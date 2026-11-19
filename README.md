# Anantam Hackathon

The hub for Anantam Racing's student hackathon: the challenge, the five
showcase projects, how judging works, how to enter, and the archive of the
concluded 2026 edition.

**[Live → hackathon.anantamracing.com](https://hackathon.anantamracing.com/)**

---

## What is in this repository

Two pages and nothing else, which is the honest size of it:

| File | What it is |
|---|---|
| `index.html` | The hub — 1,184 lines, one file: the challenge, the five project cards, how it works, the judging criteria, entry, FAQ |
| `2026/index.html` | The archive of the concluded 2026 edition, 897 lines |

**The five showcase projects are not in this repository.** They each have their
own, because each is an independent project with its own identity, navigation
and design system:

| Project | Repository | Live |
|---|---|---|
| **JANUS** — STEM that works without the internet | [janus](https://github.com/DDXPlayz/janus) | [↗](https://anantamracing.com/hackathon/janus/) |
| **LUMA** — a laboratory in your browser | [luma](https://github.com/DDXPlayz/luma) | [↗](https://anantamracing.com/hackathon/luma/) |
| **OPENLAB** — build more with what you already have | [openlab](https://github.com/DDXPlayz/openlab) | [↗](https://anantamracing.com/hackathon/openlab/) |
| **PRISM** — see the science differently | [prism](https://github.com/DDXPlayz/prism) | [↗](https://anantamracing.com/hackathon/prism/) |
| **STEMSCAPE** — engineer the world | [stemscape](https://github.com/DDXPlayz/stemscape) | [↗](https://anantamracing.com/hackathon/stemscape/) |

Looking like five different teams built them is the point, so they are not
restyled to match this page and they share no code with it.

## Two hosts, and the link rule that follows

The hub is served from its **own subdomain**; the projects are served from the
**main domain**. That single fact determines every link decision here:

| Live URL | Source |
|---|---|
| `hackathon.anantamracing.com/` | `index.html` |
| `anantamracing.com/hackathon/2026/` | `2026/index.html` |
| `anantamracing.com/hackathon/<project>/` | the five project repositories |

So **links that cross between the two hosts must be absolute**, and in this
repository they are — every project link, every back-link. The hub canonicalises
to the subdomain, so `anantamracing.com/hackathon/` serves the same file but
defers to it, the same arrangement the inspire, rise and sustain subsites use.
For that reason the hub is deliberately **not** listed in the main
`sitemap.xml`; the project pages are. Giving the hub its own host its own
`sitemap.xml` and `robots.txt` is the thing to do if it should be indexed
separately.

## Editing between editions

Everything an organiser changes lives in one `CONFIG` block near the top of the
script in `index.html`:

```js
const CONFIG = {
    entriesOpen: true,                 // false swaps the form for a closed notice
    email: 'anantamracing@gmail.com',  // where entries and enquiries go
    closedMessage: '...'               // shown when entriesOpen is false
};
```

The judging weights live in `CRITERIA` in the same script.

There is **no database and no backend**. Entering opens a pre-filled message in
the sender's own email client; nothing is stored on the site. Dates are
deliberately not published on the page — they go out by email to each cohort,
so nobody reads a stale calendar off a page that was last edited a year ago.

## Getting started

```bash
git clone https://github.com/DDXPlayz/anantam-hackathon.git
cd anantam-hackathon
python3 -m http.server 4321
```

Then open `http://localhost:4321/` for the hub, or
`http://localhost:4321/2026/` for the archive. Both are single self-contained
files; the project links point at the live site.

## Status & verification

**Status:** live. The 2026 edition is concluded and archived.

| Claim | How it was checked |
|---|---|
| Hub live at `hackathon.anantamracing.com` | HTTP 200, checked 2026-11-19 |
| Archive live at `anantamracing.com/hackathon/2026/` | HTTP 200, checked 2026-11-19 |
| Cross-host links are absolute | verified — every project link and back-link in `index.html` is a full URL |
| No backend | verified — entry is a `mailto:`; **zero** `fetch`/`XHR` |
| The five projects are published separately | verified — all five repositories exist and are public |

**Not verified:** whether the hub renders identically on browsers other than
the development machine's; whether the `entriesOpen: false` path has been
exercised recently.

## Credits

Written by **Dhruva Goyal** for Team Anantam. The five showcase projects are
independent work, supported by Anantam.

Font Awesome (CDN) is used for icons under its free licence; Google Fonts
supplies Orbitron and Montserrat.

## Licence

[MIT](LICENSE) — covering the hub and the archive page in this repository. The
showcase projects are licensed in their own repositories.
