# The World in One Picture — Wednesday 18 November 2026

[![Make.fun bounty](https://make.fun/badge/news-image-20261118.svg)](https://make.fun/bounty/news-image-20261118)
[![Rank](https://make.fun/badge/news-image-20261118/calebakinjomo/news-image-20261118/rank.svg)](https://make.fun/bounty/news-image-20261118)
[![Reward](https://make.fun/badge/news-image-20261118/calebakinjomo/news-image-20261118/reward.svg)](https://make.fun/bounty/news-image-20261118)

A one-page newspaper front page that sums up Wednesday 18 November 2026. The lead
story is Donald Trump landing in Shenzhen for the APEC summit, greeted personally at
the airport by Xi Jinping, with a first-ever trilateral summit of Trump, Xi and
Vladimir Putin set for Thursday — drawn as a Shenzhen skyline under the American,
Chinese and Russian flags. Below it, five more stories from the day: the United
States striking Qeshm Island and Iran hitting a US air base in Kuwait as the Gulf
escalates; Ukraine hitting the Kerch Bridge for a second day; Cyclone Akvan bearing
down on India's east coast; Mary Peltola winning Alaska's Senate seat as Democrats
take a 56–44 majority; and Nvidia's board rejecting Jensen Huang's return as CEO
despite a record quarter.

## How to run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

This writes `out/entry.png`, a 1024×1024 PNG. It needs Node 22 and nothing else —
standard library only, no packages to install, no network, no files read at run time.

## How it is drawn

Everything in the image is drawn in code by `main.ts`: its own PNG encoder (palette
PNG, compressed with `node:zlib`), its own 5×7 bitmap font covering upper- and
lower-case letters, digits and punctuation, and vector shapes for the masthead,
skyline, flags and the small illustration beside each story. There are no image
assets and no external files.

## Determinism

The program reads no clock, uses no randomness and iterates in fixed order, so two
runs write byte-identical files. Verified by running it twice into separate
directories and comparing SHA-256 hashes — both runs produced the same hash.

## Links

- Bounty: https://make.fun/bounty/news-image-20261118
- Referral: https://make.fun/r/hdavhdvz
