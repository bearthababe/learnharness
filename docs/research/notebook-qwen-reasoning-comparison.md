# Cerebras Qwen: off, low, medium and high

2026-11-04. Owner approved **Qwen 3.8 27B/high** on all 20 frozen cases, at most 40 calls including format retries, no speech/saved changes. All 20 completed in one call each, with high effort verified. Off/low/medium results are reused from the same-input suites.

## Answer

**High did not get every case right. No tested Qwen reasoning level completed all 20 intended outcomes.** High is the highest supported level in the installed Cerebras model mapping.

High made **two incorrect edits**, asked for clarification on **two cases where an edit was wanted**, preserved three unfinished expressions and correctly handled the two genuinely ambiguous cases. Median editor time **0.648 s**, range **0.328–5.871 s**. It recovered pressure from fresh correctly, but that particular edit took **5.499 s**.

| Reasoning | Correct edits/Undo | Unfinished retained | Required clarification | Question instead of edit | Incorrect edit | Median editor | Range | Task-aligned |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| off | 12 | 0 | 2 | 3 | 3 | 0.381 s | 0.286–1.172 s | 14/20 |
| low | 13 | 1 | 2 | 1 | 3 | 0.497 s | 0.324–1.303 s | 16/20 |
| medium | 12 | 2 | 2 | 3 | 1 | 0.549 s | 0.340–4.198 s | 16/20 |
| high | 11 | 3 | 2 | 2 | 2 | 0.648 s | 0.328–5.871 s | 16/20 |

“Task-aligned” combines correct edit/Undo, retained unfinished symbols and required clarification. It is not a final acceptance score: unfinished notation remains separately reviewed. Every question left working/Undo unchanged; it is not treated as a destructive edit. One observation per level/case, not a reliability percentage.

## High: what still went wrong

### Case 5: Punctuated right pressure

Instruction:

> Right pressure. Equals force divided by area.

Actual stored LaTeX:

```latex
Right pressure = force / area
```

It retained “Right” as mathematical content instead of recognizing the known write/right transcription mistake.

### Case 7: Unfinished multiplication with archives

Instruction:

> So 300 times 50 minus 300 times three plus three, time... Plus six times 47.

Actual stored LaTeX:

```latex
300 \times 50 - 300 \times 3 + 6 \times 47
```

It deleted the unfinished `+ 3 × …` term. The same sentence with archived entries absent retained the unfinished term instead. This does not establish a production history-filtering policy.

### Additional questions instead of editing

- Case 3: Should I write the line exactly as "Right pressure equals force divided by area", or omit "Right" and write "Pressure equals force divided by area"? (3.865 s)
- Case 4: Do you mean to insert a new line reading pressure = force divided by area? (5.871 s)

## What high improved or regressed versus medium

- “Fresh” recovery: medium asked; high correctly retained `p`, at 5.499 s.
- Initial write/right: medium added an unwanted subscript; high asked for clarification.
- “Force in my by area”: medium corrected it; high asked instead.
- Punctuated “Right pressure”: medium corrected it; high wrote the unwanted “Right” word.
- Interrupted multiplication with history: medium asked; high dropped the unfinished term.
- Same multiplication without history: medium asked; high retained `+ 3 × ...`.
- Both levels preserved the simple unfinished addition/expansion, deliberate mathematical mistakes, intentional fresh rename, whole-line targeting, explicit corrections and Undo.

High therefore trades outcomes rather than giving a clean upgrade. Medium had fewer incorrect edits (one versus two) and a lower median, while high completed the known fresh correction and the no-history unfinished case. Neither establishes the requested all-correct setting.

## Full identical-input comparison

**E** correct edit/Undo; **U** unfinished symbols retained, notation separate; **Q** required clarification; **?** clarification instead of expected edit; **X** incorrect edit. Case links show exact working, conversation, archived entries and expected outcome. The [JSON artifact](notebook-qwen-reasoning-comparison-data.json) embeds those inputs/prompts and all 80 level/case outputs.

| Case | Off | Low | Medium | High |
| --- | --- | --- | --- | --- |
| [1. Recover pressure from fresh](notebook-complete-model-comparison.md#case-1) | E · 0.390 s | E · 0.501 s | ? · 1.826 s | E · 5.499 s |
| [2. Clean pressure replacement](notebook-complete-model-comparison.md#case-2) | E · 0.479 s | E · 0.409 s | E · 4.198 s | E · 0.348 s |
| [3. Write/right mistranscription](notebook-complete-model-comparison.md#case-3) | X · 0.332 s | X · 0.562 s | X · 0.382 s | ? · 3.865 s |
| [4. Force in my by area mistranscription](notebook-complete-model-comparison.md#case-4) | E · 0.301 s | E · 1.303 s | E · 0.547 s | ? · 5.871 s |
| [5. Punctuated right pressure](notebook-complete-model-comparison.md#case-5) | X · 0.323 s | E · 0.664 s | E · 1.721 s | X · 4.033 s |
| [6. Clean initial pressure formula](notebook-complete-model-comparison.md#case-6) | E · 0.484 s | E · 0.361 s | E · 0.422 s | E · 0.480 s |
| [7. Unfinished multiplication with archives](notebook-complete-model-comparison.md#case-7) | ? · 0.504 s | X · 0.991 s | ? · 1.093 s | X · 3.300 s |
| [8. Unfinished multiplication without archives](notebook-complete-model-comparison.md#case-8) | ? · 0.435 s | X · 0.572 s | ? · 1.142 s | U · 1.219 s |
| [9. Repeated 24 false start](notebook-complete-model-comparison.md#case-9) | E · 0.337 s | E · 0.460 s | E · 0.975 s | E · 1.951 s |
| [10. Targeted edit preserves mistakes](notebook-complete-model-comparison.md#case-10) | E · 0.372 s | E · 0.393 s | E · 0.376 s | E · 0.615 s |
| [11. Unfinished addition](notebook-complete-model-comparison.md#case-11) | X · 0.286 s | U · 0.390 s | U · 1.086 s | U · 0.513 s |
| [12. Unfinished expansion](notebook-complete-model-comparison.md#case-12) | ? · 0.288 s | ? · 0.724 s | U · 0.846 s | U · 0.739 s |
| [13. Ambiguous denominator target](notebook-complete-model-comparison.md#case-13) | Q · 0.312 s | Q · 0.412 s | Q · 0.451 s | Q · 0.536 s |
| [14. Follow up clarification](notebook-complete-model-comparison.md#case-14) | E · 1.172 s | E · 0.927 s | E · 0.629 s | E · 0.518 s |
| [15. Intentional literal rename](notebook-complete-model-comparison.md#case-15) | E · 0.323 s | E · 0.651 s | E · 0.356 s | E · 0.590 s |
| [16. Replace whole multi-equation line](notebook-complete-model-comparison.md#case-16) | E · 0.744 s | E · 0.328 s | E · 0.351 s | E · 0.331 s |
| [17. Copy a specified archived line](notebook-complete-model-comparison.md#case-17) | E · 0.485 s | E · 0.500 s | E · 0.528 s | E · 0.681 s |
| [18. Ambiguous archived entry](notebook-complete-model-comparison.md#case-18) | Q · 0.350 s | Q · 0.494 s | Q · 0.550 s | Q · 0.697 s |
| [19. Explicit Undo](notebook-complete-model-comparison.md#case-19) | E · 0.716 s | E · 0.324 s | E · 0.340 s | E · 0.328 s |
| [20. Explicit mathematical correction](notebook-complete-model-comparison.md#case-20) | E · 0.413 s | E · 0.378 s | E · 0.465 s | E · 0.437 s |

## All 20 actual high outputs

| Case | Outcome | Actual output | Editor | Reported reasoning tokens |
| --- | --- | --- | ---: | ---: |
| [1. Recover pressure from fresh](notebook-complete-model-comparison.md#case-1) | E | <code>replace L1: p = \frac{F}{2A}</code> | 5.499 s | 5662 |
| [2. Clean pressure replacement](notebook-complete-model-comparison.md#case-2) | E | <code>replace L1: p = \frac{F}{2A}</code> | 0.348 s | 91 |
| [3. Write/right mistranscription](notebook-complete-model-comparison.md#case-3) | ? | Should I write the line exactly as "Right pressure equals force divided by area", or omit "Right" and write "Pressure equals force divided by area"? | 3.865 s | 3914 |
| [4. Force in my by area mistranscription](notebook-complete-model-comparison.md#case-4) | ? | Do you mean to insert a new line reading pressure = force divided by area? | 5.871 s | 6734 |
| [5. Punctuated right pressure](notebook-complete-model-comparison.md#case-5) | X | <code>insert L1 after start: Right pressure = force / area</code> | 4.033 s | 3522 |
| [6. Clean initial pressure formula](notebook-complete-model-comparison.md#case-6) | E | <code>insert L1 after start: p = \frac{F}{A}</code> | 0.480 s | 107 |
| [7. Unfinished multiplication with archives](notebook-complete-model-comparison.md#case-7) | X | <code>insert L1 after start: 300 \times 50 - 300 \times 3 + 6 \times 47</code> | 3.300 s | 4062 |
| [8. Unfinished multiplication without archives](notebook-complete-model-comparison.md#case-8) | U; <code>...</code> | <code>insert L1 after start: 300 \times 50 - 300 \times 3 + 3 \times ... + 6 \times 47</code> | 1.219 s | 1354 |
| [9. Repeated 24 false start](notebook-complete-model-comparison.md#case-9) | E | <code>insert L1 after start: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 1.951 s | 907 |
| [10. Targeted edit preserves mistakes](notebook-complete-model-comparison.md#case-10) | E | <code>replace L3: p = \frac{F}{2A} \qquad 3 + 3 = 7</code> | 0.615 s | 188 |
| [11. Unfinished addition](notebook-complete-model-comparison.md#case-11) | U; <code>bare unfinished operator</code> | <code>insert L2 after L1: y = 7 +</code> | 0.513 s | 124 |
| [12. Unfinished expansion](notebook-complete-model-comparison.md#case-12) | U; <code>bare unfinished operator</code> | <code>insert L1 after start: 5 \times 8 = 5 \times 10 - 5 \times</code> | 0.739 s | 365 |
| [13. Ambiguous denominator target](notebook-complete-model-comparison.md#case-13) | Q | Which line's denominator should be changed to 2A: L1 or L2? | 0.536 s | 171 |
| [14. Follow up clarification](notebook-complete-model-comparison.md#case-14) | E | <code>replace L2: q = \frac{Q}{2A}</code> | 0.518 s | 174 |
| [15. Intentional literal rename](notebook-complete-model-comparison.md#case-15) | E | <code>replace L1: fresh = \frac{F}{A}</code> | 0.590 s | 301 |
| [16. Replace whole multi-equation line](notebook-complete-model-comparison.md#case-16) | E | <code>replace L1: y = 2</code> | 0.331 s | 67 |
| [17. Copy a specified archived line](notebook-complete-model-comparison.md#case-17) | E | <code>insert L2 after L1: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 0.681 s | 174 |
| [18. Ambiguous archived entry](notebook-complete-model-comparison.md#case-18) | Q | Which earlier entry do you mean: Entry 1 or Entry 2? | 0.697 s | 479 |
| [19. Explicit Undo](notebook-complete-model-comparison.md#case-19) | E | Undo → <code>L1: p = \frac{F}{A}</code> | 0.328 s | 53 |
| [20. Explicit mathematical correction](notebook-complete-model-comparison.md#case-20) | E | <code>replace L3: p = \frac{F}{A} \qquad 3 + 3 = 6</code> | 0.437 s | 105 |

## Controls, timing and accounting

- Same new general speech-error paragraph, exact frozen case inputs and context as off/low/medium. All 20 initial transmitted prompt strings checked equal to their frozen originals; `reasoning_effort: high` verified on every request. All responses HTTP 200.
- Zero retries, no harness/transport failures. High reported **28,554 reasoning tokens** and **1,024 cache-read tokens** across 20 calls. Cache/provider load not controlled across historical/current levels.
- Times are complete editor responses plus validation/application/checkpointing, excluding deliberate 13-second request spacing. **Not full in-app delay**. No speech/browser/native-window testing.
- All edits had the expected Undo snapshots; questions left complete state unchanged. Incorrect/clarification/unfinished outputs reviewed without changing raw classifications or making more paid calls.
- **20/40 authorized calls**, zero speech/Tutor calls. Twenty unused; no further trial planned. Cumulative **512 editor dispatch attempts (510 reached providers), 5 Tutor calls, at most 930.968 speech seconds**. The two zero-network failures were from the earlier Gemini harness preparation.
- Isolated Cerebras key deleted; source auth/settings/production prompt hashes unchanged. No default or production reasoning/prompt change.

Local evidence: `/tmp/opencode/notebook-integration/check-28-qwen-high-{manifest,cerebras}.json`, zero-network preflight, `prepare-28-qwen-high.mjs`, and `check-28-complete-suite.mts --group=cerebras --qwen-high`. Earlier levels: [complete suite](notebook-complete-model-comparison.md) and [higher-reasoning comparison](notebook-higher-reasoning-comparison.md).

