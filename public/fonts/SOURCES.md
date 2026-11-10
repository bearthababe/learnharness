# Bundled interface fonts

The existing interface families are bundled so preview builds need no network
access. They are loaded using `next/font/local`; the sandbox network boundary
is not relaxed. Each family retains its upstream SIL Open Font License.

| File | Upstream Google Fonts commit | SHA-256 |
| --- | --- | --- |
| `jetbrains-mono/JetBrainsMono.ttf` | `6e4b84c976cadb3c49a40fd9a1c203e4f7fcf2da`, `ofl/jetbrainsmono/JetBrainsMono[wght].ttf` | `48715a42ec242c21e9f02692891e147d022299a52e48d5e413e1a942193ffeda` |
| `source-sans-3/SourceSans3.ttf` | `914ec116571b1162d886aa402e715552221f0b77`, `ofl/sourcesans3/SourceSans3[wght].ttf` | `042fe2cc0b933e328410d7acbd0aa6a1873dca5aef81875f4bc214b08825c7b9` |

Source repository: `https://github.com/google/fonts`. Files were retrieved from
the exact commits above on November 7, 2026; no build-time download is needed.
