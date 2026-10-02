# Love & Hip Hop Special — Season 3 Sneak Peek

**Love & Hip Hop: New York** · Season 3, pre-season special (S3.E0)
Aired **Saturday, December 1, 2012** · VH1 · TV-14 · 42 minutes

This is **not** the reunion. The reunion, Part 2 lives on its own page at [`/reunion`](../../public/reunion.html).
This page is the *sneak peek* — the first look at Season 3, aired 37 days before the season premiere.

Data source of truth: [`metadata/sneak-peek-data.json`](../metadata/sneak-peek-data.json).

---

## What the special is

> Check out an exclusive sneak peek at the upcoming "Love & Hip Hop" Season 3 — and a behind the scenes look at
> the taping of "Love & Hip Hop Atlanta."

The third season rebuilt the show. Rich Dollaz and Yandy Smith were the only major cast members carried over from
seasons 1–2 — Yandy took over as lead after Chrissy Lampkin's exit, Erica Mena was promoted to the main cast, and
Winter Ramos joined. Joe Budden, Consequence, Tahiry Jose, Raqi Thunda, Jen the Pen, Rashidah Ali and Olivia
Longott filled out the ensemble.

Timeline around the special:

| Date | Event |
| --- | --- |
| **December 1, 2012** | **This special airs** — the exclusive Season 3 sneak peek |
| December 4, 2012 | VH1 announces the third season will return January 7, 2013 |
| December 19, 2012 | "New Season" trailer released (00:30) |
| December 24, 2012 | "Super Trailer" released (03:55) |
| January 7, 2013 | Season 3 premieres — "The Whole Truth and Nothing but the Truth" |

## Where the file goes

The landing page streams **`YouTube.mp4`** from the repository root. That filename belongs to this page; the
reunion page expects `Love & Hip Hop Reunion Part 2.mp4` instead.

Accepted names, checked in this order:

1. `YouTube.mp4` — repository root (also `media/`, `assets/videos/`, `assets/`, `video/`, `public/`)
2. `Love and Hip Hop Season 3 Sneak Peek.mp4`
3. `Love & Hip Hop Special.mp4`
4. `sneak-peek.mp4`

Until one exists, the player streams
[`media/placeholder/lhhny-season-3-sneak-peek-reel.mp4`](../media/placeholder/) — an original generated reel
(watermarked `PLACEHOLDER` throughout, no broadcast footage) whose eight chapter markers are accurate for that
file. It also plays a copy dragged straight onto the player, or any URL passed as `VIDEO_URL`.

> The clip itself is VH1's copyrighted material. This repository does not download or bundle it — you supply the
> file, or a URL you're entitled to use.

## Tooling

```bash
npm run peek:reel     # regenerate the placeholder reel, poster and chapters
npm run peek:info     # probe the reel's container metadata
npm start             # serve all three pages
```

## Still to verify

No source PDF accompanied this build, so these come from public listings and should be checked against your copy
of the clip — they're also listed in the page's "Needs verification" card:

- the exact broadcast time slot for December 1, 2012 (8/7c is the franchise norm, unconfirmed here)
- which cast members actually appear in the sneak-peek footage (all thirteen non-Erica entries are flagged)
- the real runtime of the file you supply, and real chapter timecodes

## Sources

- [IMDb — S3.E0 "Love & Hip Hop Special"](https://www.imdb.com/title/tt3010758/)
- [TV Guide — season 3 episode guide ("Love & Hip Hop Special", Sat Dec 1, 2012, 42 mins)](https://www.tvguide.com/tvshows/love-and-hip-hop-new-york/episodes-season-3/1060208226/)
- [Wikipedia — Love & Hip Hop: New York season 3](https://en.wikipedia.org/wiki/Love_%26_Hip_Hop:_New_York_season_3)
- [Wikipedia — Love & Hip Hop franchise history](https://en.wikipedia.org/wiki/Love_%26_Hip_Hop)
- [Hip-Hop Wired — the special that carried the season 3 sneak peek](https://hiphopwired.com/198212/vh1s-love-hip-hop-atlanta-dirty-little-secrets-special-premiers-in-december/)

---

Rights: *Love & Hip Hop*, *Love & Hip Hop: New York* and all related marks, footage and artwork belong to
VH1 / Paramount and their respective owners. This page is informational only.
