# Cast & Crew — "Reunion: Part 2"

**Love & Hip Hop: New York** · S3 E14 · Aired Monday, April 15, 2013 · VH1

The machine-readable version of this list lives in
[`metadata/episode-data.json`](../metadata/episode-data.json) and powers the cast grid on the watch page
(`/#cast`). Edit that file — not this one — to change what the site displays.

---

## Host

| Name | Credit | Role |
| --- | --- | --- |
| **Mona Scott-Young** | Host | `host` |

Mona Scott-Young executive produces the franchise through Monami Entertainment and hosted both halves of the
Season 3 reunion.

---

## Cast on the couches

| Name | Credit | Role |
| --- | --- | --- |
| **Erica Mena** | Self | `main` |
| **Yandy Smith-Harris** | Self (credited as Yandy Smith) | `main` |
| **Tahiry Jose** | Self | `main` |
| **Jen Bayer** | Self (credited as Jen the Pen) | `main` |
| **Raqi Thunda** | Self | `main` |
| **Winter Ramos** | Self | `main` |
| **Rashidah Ali** | Self | `main` |

## Guests & featured

| Name | Credit | Role |
| --- | --- | --- |
| **Joe Budden** | Self | `guest` |
| **Rich Dollaz** | Self | `guest` |
| **Consequence** | Self | `guest` |
| **Olivia Longott** | Self | `guest` |
| **Kaylin Garcia** | Self | `guest` |
| **Jewel Escobar** | Self | `guest` |
| **Funkmaster Flex** | Self | `guest` |
| **Tiffany Lewis** | Self | `guest` |
| **Lore'l** | Self | `guest` |
| **Lisa Ribacoff** | Self — Certified Polygraph Examiner | `specialist` |
| **Mendeecees Harris** | Self (archive footage) | `archive` |

A certified polygraph examiner on the call sheet is as good a sign as any that a reunion episode means business.

---

## Crew

| Name | Department |
| --- | --- |
| Mona Scott-Young | Executive Producer |
| Toby Barraud | Executive Producer |
| Stefan Springman | Executive Producer |
| Ruth Sinanian | Writer |
| Kim Osorio | Writer |
| Monami Entertainment | Production Company |
| NFGTV | Production Company |
| Interloc Films | Production Company |

---

## How the page uses this data

Each cast entry becomes a card on the watch page with an initials monogram (there is no licensed headshot
in this repository), the on-screen credit and a role badge. The role values map to the filter buttons:

| Role value | Filter label | Card styling |
| --- | --- | --- |
| `host` | Host | white → violet monogram |
| `main` | Cast | gold monogram |
| `guest` | Guests | lavender → violet monogram |
| `specialist` | Specialist | gold monogram |
| `archive` | Archive | grey monogram |

Adding a cast member is a one-line change in `metadata/episode-data.json`:

```json
{ "name": "New Name", "credit": "Self", "role": "guest", "initials": "NN" }
```

---

## Sources

- [IMDb — Love and Hip Hop: New York, S3.E14 "Reunion: Part 2" (2013) — full cast](https://www.imdb.com/title/tt2817076/)
- [Love & Hip Hop: New York (Season 3) — starring cast](https://love-hip-hop.fandom.com/wiki/Love_%26_Hip_Hop:_New_York_(Season_3))
