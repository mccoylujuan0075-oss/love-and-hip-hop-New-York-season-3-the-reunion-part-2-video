# Basketball Wives — Reunion Sneak Peek

**Basketball Wives** · Season 11 (11B) · Reunion Sneak Peek · VH1 · TV-14

The watch page lives at **`/basketball-wives`** and is driven entirely by
[`metadata/basketball-wives-data.json`](../metadata/basketball-wives-data.json).

---

## ⚠️ Read this first

The PDF attached to the build request — **`Basketball Wives Reunion Sneak Peek - YouTube.pdf`** — never reached the
workspace. `/home/user/uploads` did not exist and no file matching `*Basketball*` or `*Wives*` was found anywhere on
disk. **Nothing on this page was read from that PDF.**

Everything in the metadata file is compiled from the public sources listed at the bottom of this page. Where a
sneak-peek PDF would normally confirm a detail, the field is listed in `_pendingVerification` and is shown on the page
in the **Needs verification** card.

### What still needs confirming

| Field | Currently set to | Why it's uncertain |
| --- | --- | --- |
| `episode.clipTitle` | "Basketball Wives Reunion Sneak Peek — YouTube" | The exact YouTube title/upload |
| `episode.uploadDate` | not set | When the clip was posted |
| `episode.runtimeSeconds` | 151 (placeholder reel) | Real clip length |
| `episode.seasonHalf` | 11B | A sneak peek could preview either reunion |
| `episode.host` | Nina Parker | Salley hosted 11A, Parker hosted 11B |
| `cast[].onReunionCouch` | inferred | Who actually sat on the couch for this installment |

Fix any of them in the JSON and reload — the page reads that file on every request.

---

## The show

*Basketball Wives* premiered on VH1 on **April 11, 2010** and follows the wives, ex-wives and girlfriends of
professional basketball players through business, friendship and the fallout between the two. It is produced by
Truly Original and Shed Media for VH1, and is one of the franchise's longest-running series alongside its LA spin-off.

## Season 11 at a glance

Season 11 ran in two halves:

| Run | Premiere | Reunion | Reunion host |
| --- | --- | --- | --- |
| **11A** | January 8, 2024 | January 15, 2024 | John Salley |
| **11B** | July 1, 2024 | September 23, 2024 — *The Reunion: Hot Mics and Spicy Drama* | Nina Parker |

A third run followed in 2025 (`Basketball Wives` returned Monday, February 13, 2025 at 8/7c), plus the spin-off
*Basketball Wives: Orlando*.

## The clip

A **reunion sneak peek** is the short first-look VH1 releases ahead of a reunion special: the season's unresolved
beefs, rebuilt friendships and unfinished business cut down to a teaser. The page is built around that clip.

> Because no clip file is in the repository yet, the player streams an **original generated placeholder reel**
> (`media/placeholder/basketball-wives-reunion-reel.mp4`). It is watermarked `PLACEHOLDER` throughout and contains no
> broadcast footage. Regenerate it any time with `npm run reel`; replace it by dropping the real file at
> `Basketball Wives Reunion Sneak Peek.mp4` in the repo root.

## Cast on the page

Host **Nina Parker** (11B reunion) and **John Salley** (11A), with the season 11 cast: Shaunie Henderson (credited as
Shaunie O'Neal), Evelyn Lozada, Jennifer Williams, Jackie Christie, Brandi Maxiell, Brooke Bailey, Brittish Williams,
Jac'Eil Duckworth, Clayanna Warthen, plus Brittany Renner, Vanessa Rider and Noria Dorsey-Taggar. Historical reunion
hosts Marc Lamont Hill and Tanika Ray are listed as archive credits.

Entries marked **unconfirmed** on the page are the ones a clip PDF would settle.

## Tooling

```bash
npm run reel        # regenerate the placeholder reel + poster + chapters
npm run bw:info     # probe the placeholder reel's container metadata
npm start           # serve the watch pages at / and /basketball-wives
```

## Sources

- [IMDb — Basketball Wives S11.E13 "Reunion" (Jan 15, 2024)](https://www.imdb.com/title/tt30700280/)
- [IMDb — full cast & crew, all reunion hosts](https://www.imdb.com/title/tt1637756/fullcredits/)
- [Rotten Tomatoes — season 11 episode guide](https://www.rottentomatoes.com/tv/basketball_wives/s11)
- [E! News — season 10 cast and first sneak peek](https://www.eonline.com/news/1327386/basketball-wives-returns-with-cast-full-of-mvps-in-dramatic-first-sneak-peek)
- [Collider — Evelyn Lozada returns for season 11](https://collider.com/basketball-wives-season-11-evelyn-lozada-brittish-williams-new-cast/)
- [TheWrap — season 11 cast announcement](https://www.thewrap.com/basketball-wives-season-11-evelyn-lozada-jennifer-williams/)
- [Syracuse.com — 11B reunion air date and title](https://www.syracuse.com/tv/2024/09/how-to-watch-basketball-wives-season-11-reunion-episode-for-fee-on-vh1.html)
- [Wikipedia — List of Basketball Wives episodes](https://en.wikipedia.org/wiki/List_of_Basketball_Wives_episodes)

---

Rights note: *Basketball Wives* and all related marks, footage and artwork belong to VH1 / Paramount and their
respective owners. This page is informational only, and no broadcast footage is included in this repository.
