# Higher reasoning on the fast Notebook models

**Subsequent Qwen/high run:** see the [complete off/low/medium/high comparison](notebook-qwen-reasoning-comparison.md). High still had two incorrect edits and two questions instead of edits; the observations below remain unchanged.

2026-11-04. Owner approved **Cerebras Qwen/medium, GPT-OSS/high and Zen Gemini Flash-Lite/medium** on the same 20 frozen cases and new speech-error prompt. All **60 cases completed**, one call each, no retries. Lower-setting observations are reused from the [complete 15-setting suite](notebook-complete-model-comparison.md).

## Finding

**Higher reasoning reduced wrong edits, mainly by asking more questions. It did not increase the number of completed expected tasks overall.** Qwen medium remained fast and had fewer wrong edits; Gemini medium avoided wrong edits in this sample but was slower and more hesitant; GPT-OSS high still mishandled “fresh” and an ambiguous archived entry.

| Model | Reasoning | Incorrect edits, lower → higher | Questions instead of editing, lower → higher | Median editor time, lower → higher | Task-aligned cases, lower → higher |
| --- | --- | ---: | ---: | --- | ---: |
| Cerebras Qwen 27B | low → medium | 3 → **1** | 1 → **3** | 0.497 → **0.549 s** | 16/20 → 16/20 |
| Cerebras GPT-OSS 120B | medium → high | 5 → **2** | 2 → **5** | 0.462 → **0.698 s** | 13/20 → 13/20 |
| Zen Gemini Flash-Lite | low → medium | 2 → **0** | 0 → **4** | 0.964 → **1.986 s** | 18/20 → 16/20 |

Task-aligned includes correct edits/Undo, preserved unfinished operators and the two required clarification cases. Exact unfinished notation remains separate from final owner acceptance. An extra question leaves state unchanged: it is not counted as a wrong edit, but it does not complete the requested edit.

### What changed

- **Qwen medium:** the two damaged unfinished-multiplication edits became questions; the simpler unfinished expansion now stayed unfinished instead of prompting. But “fresh” recovery changed from a correct edit to a question. It still added an unwanted right-pressure subscript. Median 0.549 s, range 0.340–4.198 s.
- **GPT-OSS high:** corrected the right-pressure interpretation and two earlier LaTeX-escaping failures. It now asked rather than completing the unfinished expansion incorrectly. But it regressed on “fresh,” asked on two formerly completed transcription cases, and still guessed an archived entry without clarification. Median 0.698 s, range 0.471–1.813 s. No doubled-backslash error appeared in these 20 new outputs.
- **Gemini medium:** its two deleted unfinished terms became questions; it also started asking on “fresh” and the “force in my by area” transcript. Zero wrong edits in this run, four additional questions rather than edits. Median 1.986 s, range 1.173–6.862 s.

**Relative to the existing DeepSeek/low result:** DeepSeek had zero incorrect edits, one question instead of editing, and a 1.654 s median. None of these three higher-level observations displaces that balance across this suite. Qwen medium is the strongest fast-Cerebras candidate here if extra clarification is acceptable, but it still made one incorrect edit. These are single observations, not evidence of guaranteed behavior.

## Exact “fresh” responses

### Cerebras Qwen 27B / medium

```json
{
  "action": "question",
  "question": "Could you clarify what \"fresh\" refers to? Is it a variable name you want on the left side, or was that a mishearing of something else (e.g., p, F, or another symbol)?"
}
```

Editor time: **1.826 s**. Previous lower setting: correct <code>p = \frac{F}{2A}</code>.

### Cerebras GPT-OSS 120B / high

```json
{
  "action": "edit",
  "operations": [
    {
      "op": "replace",
      "id": "L1",
      "latex": "fresh = \\frac{F}{2A}"
    }
  ]
}
```

Editor time: **0.757 s**. Previous lower setting: correct <code>p = \frac{F}{2A}</code>.

### Zen Gemini Flash-Lite / medium

```json
{
  "action": "question",
  "question": "Did you mean 'p' or 'pressure' instead of 'fresh'?"
}
```

Editor time: **3.540 s**. Previous lower setting: correct <code>p = \frac{F}{2A}</code>.

## Controls and limits

- Exact same 20 complete inputs, current working, Undo state, conversation, historical entries and production-plus-new-paragraph prefix as the complete suite. The higher manifest retains the original case and prompt hashes. Expected answers were not added to the prompt.
- Requested medium/high controls verified on every outgoing request. All 60 initial transmitted prompt strings matched the frozen case exactly; all 60 HTTP responses were 200.
- Editor time includes complete response, validation/application and evidence checkpointing. It excludes deliberate provider pacing and speech/browser rendering. These are **not in-app delays**. No speech calls or browser/native-app trials were run.
- One fresh observation per case, with older observations reused as baselines. Cache state, provider load and sampling variability were not controlled. Fewer errors in this sample do not prove that every improvement was caused by the higher setting.
- All questions kept state and Undo unchanged. All edits had the expected Undo snapshot; unrelated content preservation was scored per frozen case. Actual wrong outputs and clarification text are retained below.
- The fixed SDK-object-preserving prompt transform from the Gemini harness repair was reused; no preparation/transport failures this time.

## Usage and latency by higher setting

| Setting | Calls | Reasoning tokens | Cache read tokens | Median | Range |
| --- | ---: | ---: | ---: | ---: | --- |
| Cerebras Qwen 27B / medium | 20 | 7609 | 1024 | 0.549 s | 0.340–4.198 s |
| Cerebras GPT-OSS 120B / high | 20 | 15558 | 11264 | 0.698 s | 0.471–1.813 s |
| Zen Gemini Flash-Lite / medium | 20 | 11092 | 0 | 1.986 s | 1.173–6.862 s |

## All 60 actual outputs, alongside lower-setting observations

Case links open the exact input/context and expected criterion in the complete report. The [portable JSON artifact](notebook-higher-reasoning-comparison-data.json) also embeds those frozen cases, prompts, all new responses/attempts and their lower baselines. Stored LaTeX below is shown directly, not with JSON-escaped backslashes.

### Cerebras Qwen 27B: low → medium

| Case | Lower outcome | Actual lower output | Higher outcome | Actual higher output | Editor seconds, lower → higher |
| --- | --- | --- | --- | --- | ---: |
| [1. Recover pressure from fresh](notebook-complete-model-comparison.md#case-1) | correct edit/Undo | <code>replace L1: p = \frac{F}{2A}</code> | question instead of edit | Could you clarify what "fresh" refers to? Is it a variable name you want on the left side, or was that a mishearing of something else (e.g., p, F, or another symbol)? | 0.501 → 1.826 |
| [2. Clean pressure replacement](notebook-complete-model-comparison.md#case-2) | correct edit/Undo | <code>replace L1: p = \frac{F}{2A}</code> | correct edit/Undo | <code>replace L1: p = \frac{F}{2A}</code> | 0.409 → 4.198 |
| [3. Write/right mistranscription](notebook-complete-model-comparison.md#case-3) | incorrect edit | <code>insert L1 after start: P_R = \frac{F}{A}</code> | incorrect edit | <code>insert L1 after start: P_{\text{right}} = \frac{F}{A}</code> | 0.562 → 0.382 |
| [4. Force in my by area mistranscription](notebook-complete-model-comparison.md#case-4) | correct edit/Undo | <code>insert L1 after start: P = \frac{F}{A}</code> | correct edit/Undo | <code>insert L1 after start: P = \frac{F}{A}</code> | 1.303 → 0.547 |
| [5. Punctuated right pressure](notebook-complete-model-comparison.md#case-5) | correct edit/Undo | <code>insert L1 after start: p = \frac{F}{A}</code> | correct edit/Undo | <code>insert L1 after start: P = \frac{F}{A}</code> | 0.664 → 1.721 |
| [6. Clean initial pressure formula](notebook-complete-model-comparison.md#case-6) | correct edit/Undo | <code>insert L1 after start: P = \frac{F}{A}</code> | correct edit/Undo | <code>insert L1 after start: p = \frac{F}{A}</code> | 0.361 → 0.422 |
| [7. Unfinished multiplication with archives](notebook-complete-model-comparison.md#case-7) | incorrect edit | <code>insert L1 after start: 300 \times 50 - 300 \times 3 + 6 \times 47</code> | question instead of edit | Could you clarify the "plus three, time..." part? Is that a separate term (like 3 × something), or was it a stutter/correction before you settled on "plus six times 47"? In other words, is the expression 300×50 − 300×3 + 6×47, or is there a "3 × …" term I should include? | 0.991 → 1.093 |
| [8. Unfinished multiplication without archives](notebook-complete-model-comparison.md#case-8) | incorrect edit | <code>insert L1 after start: 300 \times 50 - 300 \times 3 + 3 + 6 \times 47</code> | question instead of edit | Did you mean to include "plus three" as a separate term, e.g. 300×50 − 300×3 + 3 + 6×47, or was "plus three" a false start that you corrected to "plus six times 47", giving 300×50 − 300×3 + 6×47? | 0.572 → 1.142 |
| [9. Repeated 24 false start](notebook-complete-model-comparison.md#case-9) | correct edit/Undo | <code>insert L1 after start: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | correct edit/Undo | <code>insert L1 after start: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 0.460 → 0.975 |
| [10. Targeted edit preserves mistakes](notebook-complete-model-comparison.md#case-10) | correct edit/Undo | <code>replace L3: p = \frac{F}{2A} \qquad 3 + 3 = 7</code> | correct edit/Undo | <code>replace L3: p = \frac{F}{2A} \qquad 3 + 3 = 7</code> | 0.393 → 0.376 |
| [11. Unfinished addition](notebook-complete-model-comparison.md#case-11) | unfinished retained | <code>insert L2 after L1: y = 7 +</code> | unfinished retained | <code>insert L2 after L1: y = 7 +</code> | 0.390 → 1.086 |
| [12. Unfinished expansion](notebook-complete-model-comparison.md#case-12) | question instead of edit | Did you mean 'five times ten minus five times two' (i.e. 5 × 10 − 5 × 2), or did you want to leave it as 'five times' unfinished? | unfinished retained | <code>insert L1 after start: 5 \times 8 = 5 \times 10 - 5 \times</code> | 0.724 → 0.846 |
| [13. Ambiguous denominator target](notebook-complete-model-comparison.md#case-13) | required clarification | Which line's denominator should be changed to 2A — line 1 (p = F/A), line 2 (q = Q/A), or both? | required clarification | Which line should I change the denominator on — line 1 (p = F/A) or line 2 (q = Q/A), or both? | 0.412 → 0.451 |
| [14. Follow up clarification](notebook-complete-model-comparison.md#case-14) | correct edit/Undo | <code>replace L2: q = \frac{Q}{2A}</code> | correct edit/Undo | <code>replace L2: q = \frac{Q}{2A}</code> | 0.927 → 0.629 |
| [15. Intentional literal rename](notebook-complete-model-comparison.md#case-15) | correct edit/Undo | <code>replace L1: fresh = \frac{F}{A}</code> | correct edit/Undo | <code>replace L1: fresh = \frac{F}{A}</code> | 0.651 → 0.356 |
| [16. Replace whole multi-equation line](notebook-complete-model-comparison.md#case-16) | correct edit/Undo | <code>replace L1: y = 2</code> | correct edit/Undo | <code>replace L1: y = 2</code> | 0.328 → 0.351 |
| [17. Copy a specified archived line](notebook-complete-model-comparison.md#case-17) | correct edit/Undo | <code>insert L2 after L1: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | correct edit/Undo | <code>insert L2 after L1: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 0.500 → 0.528 |
| [18. Ambiguous archived entry](notebook-complete-model-comparison.md#case-18) | required clarification | Which entry would you like the first line from — Entry 1 or Entry 2? | required clarification | There are two saved entries. Do you mean the first line of Entry 1 (24 × 13 = 24 × 10 + 24 × 3) or Entry 2 (300 × 50 − 300 × 3 + 6 × 4 = 7)? | 0.494 → 0.550 |
| [19. Explicit Undo](notebook-complete-model-comparison.md#case-19) | correct edit/Undo | Undo → <code>L1: p = \frac{F}{A}</code> | correct edit/Undo | Undo → <code>L1: p = \frac{F}{A}</code> | 0.324 → 0.340 |
| [20. Explicit mathematical correction](notebook-complete-model-comparison.md#case-20) | correct edit/Undo | <code>replace L3: p = \frac{F}{A} \qquad 3 + 3 = 6</code> | correct edit/Undo | <code>replace L3: p = \frac{F}{A} \qquad 3 + 3 = 6</code> | 0.378 → 0.465 |

### Cerebras GPT-OSS 120B: medium → high

| Case | Lower outcome | Actual lower output | Higher outcome | Actual higher output | Editor seconds, lower → higher |
| --- | --- | --- | --- | --- | ---: |
| [1. Recover pressure from fresh](notebook-complete-model-comparison.md#case-1) | correct edit/Undo | <code>replace L1: p = \frac{F}{2A}</code> | incorrect edit | <code>replace L1: fresh = \frac{F}{2A}</code> | 0.445 → 0.757 |
| [2. Clean pressure replacement](notebook-complete-model-comparison.md#case-2) | correct edit/Undo | <code>replace L1: p = \frac{F}{2A}</code> | correct edit/Undo | <code>replace L1: p = \frac{F}{2A}</code> | 0.428 → 0.508 |
| [3. Write/right mistranscription](notebook-complete-model-comparison.md#case-3) | incorrect edit | <code>insert L1 after start: \text{Right pressure} = \frac{F}{A}</code> | correct edit/Undo | <code>insert L1 after start: p = \frac{F}{A}</code> | 0.458 → 1.151 |
| [4. Force in my by area mistranscription](notebook-complete-model-comparison.md#case-4) | correct edit/Undo | <code>insert L1 after start: p = \frac{F}{A}</code> | question instead of edit | Did you mean to write pressure equals force per area? | 0.478 → 1.449 |
| [5. Punctuated right pressure](notebook-complete-model-comparison.md#case-5) | correct edit/Undo | <code>insert L1 after start: p = \frac{F}{A}</code> | correct edit/Undo | <code>insert L1 after start: p = \frac{F}{A}</code> | 0.445 → 0.676 |
| [6. Clean initial pressure formula](notebook-complete-model-comparison.md#case-6) | correct edit/Undo | <code>insert L1 after start: p = \frac{F}{A}</code> | correct edit/Undo | <code>insert L1 after start: p = \frac{F}{A}</code> | 0.425 → 0.687 |
| [7. Unfinished multiplication with archives](notebook-complete-model-comparison.md#case-7) | question instead of edit | Do you want to write the expression as 300\times50 - 300\times3 + 3 + 6\times47, or something different? | question instead of edit | Could you clarify the missing term after “plus three times” – what should be multiplied by three? | 0.490 → 0.678 |
| [8. Unfinished multiplication without archives](notebook-complete-model-comparison.md#case-8) | question instead of edit | Could you clarify the part "plus three, time..."? What should follow the "time" after the plus three? | question instead of edit | Could you clarify what term should follow 'plus three times' in the expression? | 0.567 → 1.813 |
| [9. Repeated 24 false start](notebook-complete-model-comparison.md#case-9) | correct edit/Undo | <code>insert L1 after start: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | question instead of edit | Should the equation be $24 \times 13 = 24 \times 10 + 24 \times 3$? | 0.528 → 1.333 |
| [10. Targeted edit preserves mistakes](notebook-complete-model-comparison.md#case-10) | correct edit/Undo | <code>replace L3: p = \frac{F}{2A} \qquad 3 + 3 = 7</code> | correct edit/Undo | <code>replace L3: p = \frac{F}{2A} \qquad 3 + 3 = 7</code> | 0.376 → 0.869 |
| [11. Unfinished addition](notebook-complete-model-comparison.md#case-11) | unfinished retained | <code>insert L2 after L1: y = 7 +</code> | unfinished retained | <code>insert L2 after L1: y = 7 +</code> | 0.465 → 0.615 |
| [12. Unfinished expansion](notebook-complete-model-comparison.md#case-12) | incorrect edit | <code>insert L1 after start: 5 \\times 8 = 5 \\times 10 - 5 \\times 2</code> | question instead of edit | What should come after the final "five times" in the expression? | 0.508 → 0.608 |
| [13. Ambiguous denominator target](notebook-complete-model-comparison.md#case-13) | required clarification | Do you want to change the denominator to 2A in both equations, or just one of them? If just one, please specify which line (e.g., p = ... or q = ...). | required clarification | Do you want to change the denominator to 2A in both equations, or only in a specific line? | 0.465 → 0.730 |
| [14. Follow up clarification](notebook-complete-model-comparison.md#case-14) | incorrect edit | <code>replace L2: q = \\frac{Q}{2A}</code> | correct edit/Undo | <code>replace L2: q = \frac{Q}{2A}</code> | 0.550 → 0.950 |
| [15. Intentional literal rename](notebook-complete-model-comparison.md#case-15) | correct edit/Undo | <code>replace L1: fresh = \frac{F}{A}</code> | correct edit/Undo | <code>replace L1: \text{fresh} = \frac{F}{A}</code> | 0.329 → 0.761 |
| [16. Replace whole multi-equation line](notebook-complete-model-comparison.md#case-16) | correct edit/Undo | <code>replace L1: y = 2</code> | correct edit/Undo | <code>replace L1: y = 2</code> | 1.900 → 0.492 |
| [17. Copy a specified archived line](notebook-complete-model-comparison.md#case-17) | incorrect edit | <code>insert L2 after L1: 24 \\times 13 = 24 \\times 10 + 24 \\times 3</code> | correct edit/Undo | <code>insert L2 after L1: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 0.419 → 0.690 |
| [18. Ambiguous archived entry](notebook-complete-model-comparison.md#case-18) | incorrect edit | <code>insert L2 after L1: 24 \\times 13 = 24 \\times 10 + 24 \\times 3</code> | incorrect edit | <code>insert L2 after L1: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 0.624 → 0.665 |
| [19. Explicit Undo](notebook-complete-model-comparison.md#case-19) | correct edit/Undo | Undo → <code>L1: p = \frac{F}{A}</code> | correct edit/Undo | Undo → <code>L1: p = \frac{F}{A}</code> | 0.359 → 0.471 |
| [20. Explicit mathematical correction](notebook-complete-model-comparison.md#case-20) | correct edit/Undo | <code>replace L3: p = \frac{F}{A} \qquad 3 + 3 = 6</code> | correct edit/Undo | <code>replace L3: p = \frac{F}{A} \qquad 3 + 3 = 6</code> | 0.396 → 0.705 |

### Zen Gemini Flash-Lite: low → medium

| Case | Lower outcome | Actual lower output | Higher outcome | Actual higher output | Editor seconds, lower → higher |
| --- | --- | --- | --- | --- | ---: |
| [1. Recover pressure from fresh](notebook-complete-model-comparison.md#case-1) | correct edit/Undo | <code>replace L1: p = \frac{F}{2A}</code> | question instead of edit | Did you mean 'p' or 'pressure' instead of 'fresh'? | 0.927 → 3.540 |
| [2. Clean pressure replacement](notebook-complete-model-comparison.md#case-2) | correct edit/Undo | <code>replace L1: p = \frac{F}{2A}</code> | correct edit/Undo | <code>replace L1: p = \frac{F}{2A}</code> | 1.062 → 1.391 |
| [3. Write/right mistranscription](notebook-complete-model-comparison.md#case-3) | correct edit/Undo | <code>insert L1 after start: P = \frac{F}{A}</code> | correct edit/Undo | <code>insert L1 after start: P = \frac{F}{A}</code> | 1.147 → 2.069 |
| [4. Force in my by area mistranscription](notebook-complete-model-comparison.md#case-4) | correct edit/Undo | <code>insert L1 after start: P = \frac{F}{A}</code> | question instead of edit | Did you mean 'pressure = force / area'? | 0.933 → 2.808 |
| [5. Punctuated right pressure](notebook-complete-model-comparison.md#case-5) | correct edit/Undo | <code>insert L1 after start: P = \frac{F}{A}</code> | correct edit/Undo | <code>insert L1 after start: P = \frac{F}{A}</code> | 1.229 → 2.973 |
| [6. Clean initial pressure formula](notebook-complete-model-comparison.md#case-6) | correct edit/Undo | <code>insert L1 after start: P = \frac{F}{A}</code> | correct edit/Undo | <code>insert L1 after start: P = \frac{F}{A}</code> | 0.782 → 1.540 |
| [7. Unfinished multiplication with archives](notebook-complete-model-comparison.md#case-7) | incorrect edit | <code>insert L1 after start: 300 \times 50 - 300 \times 3 + 6 \times 47</code> | question instead of edit | Should I replace &#96;6 \times 4 = 7&#96; with &#96;6 \times 47&#96;? | 1.986 → 6.862 |
| [8. Unfinished multiplication without archives](notebook-complete-model-comparison.md#case-8) | incorrect edit | <code>insert L1 after start: 300 \times 50 - 300 \times 3 + 6 \times 47</code> | question instead of edit | Did you mean to multiply by three, or did you replace that part with plus six times 47? | 0.898 → 4.523 |
| [9. Repeated 24 false start](notebook-complete-model-comparison.md#case-9) | correct edit/Undo | <code>insert L1 after start: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | correct edit/Undo | <code>insert L1 after start: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 1.205 → 2.514 |
| [10. Targeted edit preserves mistakes](notebook-complete-model-comparison.md#case-10) | correct edit/Undo | <code>replace L3: p = \frac{F}{2A} \qquad 3 + 3 = 7</code> | correct edit/Undo | <code>replace L3: p = \frac{F}{2A} \qquad 3 + 3 = 7</code> | 0.847 → 1.385 |
| [11. Unfinished addition](notebook-complete-model-comparison.md#case-11) | unfinished retained | <code>insert L2 after L1: y = 7 +</code> | unfinished retained | <code>insert L2 after L1: y = 7 +</code> | 1.023 → 2.276 |
| [12. Unfinished expansion](notebook-complete-model-comparison.md#case-12) | unfinished retained | <code>insert L1 after start: 5 \times 8 = 5 \times 10 - 5 \times</code> | unfinished retained | <code>insert L1 after start: 5 \times 8 = 5 \times 10 - 5 \times</code> | 0.799 → 2.556 |
| [13. Ambiguous denominator target](notebook-complete-model-comparison.md#case-13) | required clarification | Which denominator would you like to change to 2A? | required clarification | Which line's denominator should be changed to 2A? | 0.960 → 1.634 |
| [14. Follow up clarification](notebook-complete-model-comparison.md#case-14) | correct edit/Undo | <code>replace L2: q = \frac{Q}{2A}</code> | correct edit/Undo | <code>replace L2: q = \frac{Q}{2A}</code> | 0.968 → 1.173 |
| [15. Intentional literal rename](notebook-complete-model-comparison.md#case-15) | correct edit/Undo | <code>replace L1: \text{fresh} = \frac{F}{A}</code> | correct edit/Undo | <code>replace L1: \text{fresh} = \frac{F}{A}</code> | 1.187 → 1.903 |
| [16. Replace whole multi-equation line](notebook-complete-model-comparison.md#case-16) | correct edit/Undo | <code>replace L1: y = 2</code> | correct edit/Undo | <code>replace L1: y = 2</code> | 0.785 → 1.357 |
| [17. Copy a specified archived line](notebook-complete-model-comparison.md#case-17) | correct edit/Undo | <code>insert L2 after L1: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | correct edit/Undo | <code>insert L2 after L1: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 1.433 → 2.312 |
| [18. Ambiguous archived entry](notebook-complete-model-comparison.md#case-18) | required clarification | Which earlier entry would you like to copy the first line from, Entry 1 or Entry 2? | required clarification | Which earlier entry's first line would you like to copy? | 1.169 → 1.497 |
| [19. Explicit Undo](notebook-complete-model-comparison.md#case-19) | correct edit/Undo | Undo → <code>L1: p = \frac{F}{A}</code> | correct edit/Undo | Undo → <code>L1: p = \frac{F}{A}</code> | 0.594 → 1.349 |
| [20. Explicit mathematical correction](notebook-complete-model-comparison.md#case-20) | correct edit/Undo | <code>replace L3: p = \frac{F}{A} \qquad 3 + 3 = 6</code> | correct edit/Undo | <code>replace L3: p = \frac{F}{A} \qquad 3 + 3 = 6</code> | 0.847 → 1.363 |

## Accounting and isolation

**60/120 authorized calls**, no format/transport retries, no speech/Tutor calls. Sixty unused; no additional trial planned. Cumulative integration verification: **492 editor dispatch attempts (490 reached providers), 5 Tutor calls, at most 930.968 speech seconds**. The two-attempt difference is the earlier, documented zero-network Gemini harness failure, not this run.

Isolated Cerebras/Zen key file removed. Source auth, saved settings and production editor prompt hashes unchanged. No subscription credentials copied or app servers started. No default/reasoning/prompt setting adopted in production.

Local evidence under `/tmp/opencode/notebook-integration/`: `check-28-higher-manifest.json`, `check-28-higher-{cerebras,zen}.json`, their zero-network preflights, `prepare-28-higher-suite.mjs` and `check-28-complete-suite.mts --higher`. Report source: `report-28-higher-suite.mjs`.
