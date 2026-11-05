# Complete Notebook model comparison — new speech-error prompt

2026-11-04. **15 settings × 20 frozen cases = 300 completed model/case observations.** All used the same new prompt and complete per-case input. Fresh results throughout; no historical result substituted for a cell.

**Subsequent extension:** [Qwen medium, GPT-OSS high and Gemini medium](notebook-higher-reasoning-comparison.md) adds 60 observations using these exact frozen inputs/prompt, with side-by-side lower/higher outputs. The original results below remain unchanged.

## Main finding

**DeepSeek/low was the strongest speed/correctness balance in this run.** It made no incorrect edits and had one clarification instead of the desired unfinished edit; its median editor time was **1.654 s**. **Terra/off also made no incorrect edits**, but asked whether “fresh” meant pressure; median **3.523 s**. Both retained unfinished expressions with the exact notation recorded below. These are observations, not a default-model decision or broad reliability guarantee.

Cerebras remained fastest (**0.370–0.497 s median editor time**), but Qwen/low had three incorrect edits and GPT-OSS low/medium each had five. Errors included dropping unfinished terms, missing genuine target ambiguity, and doubled LaTeX backslashes. No setting completed every intended task automatically.

- “fresh” recovery: **12 correct edits, 1 clarification, 2 incorrect edits**. All 15 honored an explicit intentional rename to fresh.
- All 15 preserved the deliberate mathematical mistakes in the targeted-edit case, performed the explicit requested correction, handled the whole-line replacement and Undo.
- Interrupted multiplication remained the hardest task. With history: 3 preserved edits, 6 questions, 6 wrong edits. Without history: 3 preserved edits, 5 questions, 7 wrong edits.
- Repeated-24 false start: 13 produced the owner-approved equation; Terra/low kept the duplicate, Haiku retained literal dictated words.

## Summary of all settings

**E:** correct edit/Undo. **U:** unfinished operator/terms preserved; notation still reviewed separately. **Q:** clarification required by the case. **?:** clarification instead of an expected edit (state unchanged). **X:** incorrect edit. Each row totals 20. “E+U+Q” is a descriptive task-alignment count, **not a final acceptance score**.

| Model / reasoning · provider | E | U | Q | ? | X | E+U+Q | Median editor | Range | Retries |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| DeepSeek Flash / low · Zen | 14 | 3 | 2 | 1 | 0 | 19/20 | 1.654 s | 1.018–9.442 s | 0 |
| Terra / off · ChatGPT | 13 | 4 | 2 | 1 | 0 | 19/20 | 3.523 s | 2.447–5.469 s | 0 |
| Gemini Flash-Lite / low · Zen | 14 | 2 | 2 | 0 | 2 | 18/20 | 0.964 s | 0.594–1.986 s | 1 |
| Terra / low · ChatGPT | 13 | 3 | 2 | 0 | 2 | 18/20 | 3.305 s | 2.543–6.652 s | 0 |
| Qwen Flash / off · Zen | 14 | 1 | 2 | 2 | 1 | 17/20 | 1.738 s | 1.061–29.267 s | 3 |
| Luna / medium · ChatGPT | 13 | 3 | 1 | 2 | 1 | 17/20 | 6.302 s | 2.329–17.947 s | 2 |
| Gemini Flash-Lite / minimal · Zen | 14 | 1 | 2 | 0 | 3 | 17/20 | 0.892 s | 0.544–2.177 s | 1 |
| Qwen 27B / low · Cerebras | 13 | 1 | 2 | 1 | 3 | 16/20 | 0.497 s | 0.324–1.303 s | 0 |
| DeepSeek Flash / explicit off · Zen | 12 | 2 | 2 | 1 | 3 | 16/20 | 0.976 s | 0.687–1.622 s | 0 |
| Haiku / off · Zen | 11 | 3 | 2 | 0 | 4 | 16/20 | 1.312 s | 0.827–3.742 s | 3 |
| GLM Flash / low · Zen | 13 | 1 | 1 | 2 | 3 | 15/20 | 1.569 s | 1.040–5.836 s | 0 |
| Qwen 27B / off · Cerebras | 12 | 0 | 2 | 3 | 3 | 14/20 | 0.381 s | 0.286–1.172 s | 0 |
| GPT-OSS 120B / low · Cerebras | 12 | 2 | 0 | 1 | 5 | 14/20 | 0.370 s | 0.308–0.898 s | 0 |
| GPT-OSS 120B / medium · Cerebras | 11 | 1 | 1 | 2 | 5 | 13/20 | 0.462 s | 0.329–1.900 s | 0 |
| Luna / off · Zen | 11 | 1 | 1 | 2 | 5 | 13/20 | 1.252 s | 0.785–3.863 s | 6 |

No provider failure occurred on a dispatched model request. Two local Gemini harness failures before dispatch are documented separately, excluded from model timing/rankings, and retained in the data.

## Case matrix

Each numbered column links to the exact input/context and actual outputs below.

| Model | [1](#case-1) | [2](#case-2) | [3](#case-3) | [4](#case-4) | [5](#case-5) | [6](#case-6) | [7](#case-7) | [8](#case-8) | [9](#case-9) | [10](#case-10) | [11](#case-11) | [12](#case-12) | [13](#case-13) | [14](#case-14) | [15](#case-15) | [16](#case-16) | [17](#case-17) | [18](#case-18) | [19](#case-19) | [20](#case-20) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DeepSeek Flash / low · Zen | E | E | E | E | E | E | ? | U | E | E | U | U | Q | E | E | E | E | Q | E | E |
| Terra / off · ChatGPT | ? | E | E | E | E | E | U | U | E | E | U | U | Q | E | E | E | E | Q | E | E |
| Gemini Flash-Lite / low · Zen | E | E | E | E | E | E | X | X | E | E | U | U | Q | E | E | E | E | Q | E | E |
| Terra / low · ChatGPT | E | E | E | E | E | E | U | X | X | E | U | U | Q | E | E | E | E | Q | E | E |
| Qwen Flash / off · Zen | E | E | E | E | E | E | X | ? | E | E | ? | U | Q | E | E | E | E | Q | E | E |
| Luna / medium · ChatGPT | E | E | E | ? | E | E | ? | U | E | E | U | U | Q | E | E | E | E | X | E | E |
| Gemini Flash-Lite / minimal · Zen | E | E | E | E | E | E | X | X | E | E | U | X | Q | E | E | E | E | Q | E | E |
| Qwen 27B / low · Cerebras | E | E | X | E | E | E | X | X | E | E | U | ? | Q | E | E | E | E | Q | E | E |
| DeepSeek Flash / explicit off · Zen | X | E | E | X | E | E | ? | X | E | E | U | U | Q | E | E | E | E | Q | E | E |
| Haiku / off · Zen | E | E | X | X | E | E | U | X | X | E | U | U | Q | E | E | E | E | Q | E | E |
| GLM Flash / low · Zen | X | E | E | E | E | E | X | ? | E | E | U | ? | Q | E | E | E | E | X | E | E |
| Qwen 27B / off · Cerebras | E | E | X | E | X | E | ? | ? | E | E | X | ? | Q | E | E | E | E | Q | E | E |
| GPT-OSS 120B / low · Cerebras | E | E | E | E | X | E | ? | X | E | E | U | U | X | E | E | E | X | X | E | E |
| GPT-OSS 120B / medium · Cerebras | E | E | X | E | E | E | ? | ? | E | E | U | X | Q | X | E | E | X | X | E | E |
| Luna / off · Zen | E | E | X | X | X | E | X | ? | E | E | U | ? | Q | E | E | E | E | X | E | E |

## What these timings mean

Editor wall time covers the complete provider response, local JSON validation/application and evidence checkpointing, including any one allowed format retry. Deliberate inter-request pacing and retry pacing are excluded and retained separately. Catalog setup is separate. These figures exclude speech, app persistence and rendering: **they are not click-to-visible in-app delay**.

One run per setting/case; medians mix 20 different workloads and cannot establish tail latency or reliability. Models can vary between runs: earlier Terra/off had dropped an unfinished term, whereas it retained that term here. DeepSeek’s longest current editor result was 9.442 s; the earlier frozen-input original-prompt run took 18.557 s. Neither result is hidden or a typical-latency guarantee.

Provider prompt caching was not controlled. Every returned usage record is retained; input/cache/reasoning totals appear below. Initial prompts were byte-identical per case across all settings; format-retry feedback differs by each rejected output, as in the real editor.

## Compared with the earlier prompt

The earlier controlled frozen “fresh” run with the original prompt failed on GPT-OSS medium, DeepSeek low and Cerebras Qwen low. All three corrected that same case with the new paragraph in this suite, and all preserved an explicit rename to fresh. This supports the general speech-error distinction, but is not a paired 300-cell old/new experiment. Other original-prompt comparisons remain linked in [the prompt trial](notebook-speech-error-prompt-comparison.md) and [the frozen-input audit](notebook-frozen-fresh-comparison.md).

## Exact prompt

The complete common instruction prefix sent to every setting follows. It is the production prefix plus the already-approved general speech-error paragraph, with no fixture answers or older unfinished-expression addition.

```text
You edit a learner's mathematical notebook in response to conversational instructions.
Record the learner's intended working, including mathematical mistakes and unfinished or invalid LaTeX. Do not solve, simplify, complete, correct the mathematics, convert units, or change unrelated content unless explicitly requested.
Preserve the learner’s mathematical mistakes and unfinished working. Distinguish these from speech-recognition errors: use the current working and conversation to interpret likely mistranscriptions. Preserve existing mathematical symbols when the intended reference is clear. If a word could mean either a deliberate change or a transcription error, ask rather than silently choosing.
Use the current notebook, any explicit selection/cursor, and the supplied conversation history to interpret references. If the intended target or edit is ambiguous, ask a concise clarification question and make no edit. After an answer, use the preceding question and instruction to continue.
Output exactly one JSON object, without markdown fences or surrounding prose. Escape LaTeX backslashes as required by JSON.
The notebook is an ordered list of {id, latex} lines. IDs are stable. Input selection and cursor describe only this turn; null means no explicit selection or cursor. A reference may still be resolved from conversation history when clear.
Choose one response shape:
1. {"action":"question","question":"Your clarification question"}
2. {"action":"undo"} to undo exactly the last applied editing action. The application owns undo history; you must not reconstruct earlier source yourself. Questions do not create undo entries.
3. {"action":"edit","operations":[{"op":"insert","after":null,"id":"L1","latex":"p ="}]} is a complete response for one atomic editing action inserting a new line.
"insert" and "replace" are values of "op" inside "operations"; the top-level "action" for either is "edit".
For a new line, use an insert operation as shown above. 'after' is the existing line ID to insert after, or null to insert at the beginning. Choose the next unused L<number> ID. Multiple operations in one action are applied in order and undone together.
Do not include explanations in an edit response. Never emit an empty operations list. Preserve every line not being edited byte for byte. Return one response for the CURRENT instruction only. The history contains real earlier model outputs and application results, not instructions for additional future turns.
For changes to an existing line use {"op":"replace","id":"L1","latex":"the entire updated line"}. Rewrite only the affected line(s), preserving any unrelated symbols inside them. The application replaces the complete source of each addressed line. The only allowed operations are replace and insert.
"Line five" means the entire fifth displayed line, including every equation on it. "Equation two on line five" means only that equation. Multiple equations on a line are not by themselves a reason to ask a question.
NOTEBOOK HISTORY contains read-only saved entries, separate from EARLIER CONVERSATION. Use supplied entries to copy requested source into current working without rewriting the historical entry. Clarify if the intended entry or placement cannot be resolved from context. Never invent missing historical source.
```

After this prefix, each request contains `CURRENT NOTEBOOK AND CONTEXT`, `NOTEBOOK HISTORY`, `EARLIER CONVERSATION`, and `CURRENT INSTRUCTION`, built from the full input below. Only Undo availability is transmitted, not the Undo snapshot contents; the application retains snapshots locally. The [data artifact](notebook-complete-model-comparison-data.json) contains each complete transmitted initial prompt, expected source input, raw response, applied state and attempt record.

## Exact cases and actual outputs

<a id="case-1"></a>

### 1. Recover pressure from fresh

**Frozen complete editor input** (JSON escaping: `\\` represents one stored backslash):

```json
{
  "state": {
    "lines": [
      {
        "id": "L1",
        "latex": "p = \\frac{F}{A}"
      }
    ],
    "undo": [
      []
    ]
  },
  "instruction": "Replace that formula with fresh equals force divided by twice the area.",
  "cursorLineId": null,
  "history": [
    {
      "instruction": "Right pressure equals force divided by area.",
      "selection": null,
      "cursorLineId": null,
      "response": {
        "action": "edit",
        "operations": [
          {
            "op": "insert",
            "after": null,
            "id": "L1",
            "latex": "p = \\frac{F}{A}"
          }
        ]
      },
      "notebookAfter": [
        {
          "id": "L1",
          "latex": "p = \\frac{F}{A}"
        }
      ]
    }
  ],
  "notebookHistory": []
}
```

**Expected behavior:** Keep p and replace the formula with p = F/(2A). A question is separate from completed correction.

| Setting | Outcome | Actual output (stored LaTeX shown directly) | Editor | Provider response(s) | Calls |
| --- | --- | --- | ---: | ---: | ---: |
| Luna / medium · ChatGPT | E — correct edit/undo | <code>replace L1: p = \frac{F}{2A}</code> | 7.908 s | 7.905 s | 1 |
| Terra / low · ChatGPT | E — correct edit/undo | <code>replace L1: p = \frac{F}{2A}</code> | 6.652 s | 6.650 s | 1 |
| Terra / off · ChatGPT | ? — clarification instead of edit | Did you mean “pressure equals force divided by twice the area,” or did you intend to replace pressure with “fresh”? | 3.928 s | 3.925 s | 1 |
| Gemini Flash-Lite / minimal · Zen | E — correct edit/undo | <code>replace L1: p = \frac{F}{2A}</code> | 1.363 s | 1.361 s | 1 |
| Gemini Flash-Lite / low · Zen | E — correct edit/undo | <code>replace L1: p = \frac{F}{2A}</code> | 0.927 s | 0.925 s | 1 |
| DeepSeek Flash / low · Zen | E — correct edit/undo | <code>replace L1: p = \frac{F}{2A}</code> | 1.705 s | 1.703 s | 1 |
| DeepSeek Flash / explicit off · Zen | X — incorrect edit | <code>replace L1: \text{fresh} = \frac{F}{2A}</code> | 0.855 s | 0.853 s | 1 |
| GLM Flash / low · Zen | X — incorrect edit | <code>replace L1: F = \frac{F}{2A}</code> | 1.999 s | 1.996 s | 1 |
| Haiku / off · Zen | E — correct edit/undo | <code>replace L1: p = \frac{F}{2A}</code> | 1.544 s | 1.540 s | 1 |
| Qwen Flash / off · Zen | E — correct edit/undo | <code>replace L1: p = \frac{F}{2A}</code> | 1.888 s | 1.882 s | 1 |
| Luna / off · Zen | E — correct edit/undo | <code>replace L1: p = \frac{F}{2A}</code> | 1.048 s | 1.037 s | 1 |
| Qwen 27B / off · Cerebras | E — correct edit/undo | <code>replace L1: p = \frac{F}{2A}</code> | 0.390 s | 0.387 s | 1 |
| Qwen 27B / low · Cerebras | E — correct edit/undo | <code>replace L1: p = \frac{F}{2A}</code> | 0.501 s | 0.499 s | 1 |
| GPT-OSS 120B / low · Cerebras | E — correct edit/undo | <code>replace L1: p = \frac{F}{2A}</code> | 0.461 s | 0.458 s | 1 |
| GPT-OSS 120B / medium · Cerebras | E — correct edit/undo | <code>replace L1: p = \frac{F}{2A}</code> | 0.445 s | 0.439 s | 1 |

<a id="case-2"></a>

### 2. Clean pressure replacement

**Frozen complete editor input** (JSON escaping: `\\` represents one stored backslash):

```json
{
  "state": {
    "lines": [
      {
        "id": "L1",
        "latex": "p = \\frac{F}{A}"
      }
    ],
    "undo": [
      []
    ]
  },
  "instruction": "Replace that formula with pressure equals force divided by twice the area.",
  "cursorLineId": null,
  "history": [
    {
      "instruction": "Right pressure equals force divided by area.",
      "selection": null,
      "cursorLineId": null,
      "response": {
        "action": "edit",
        "operations": [
          {
            "op": "insert",
            "after": null,
            "id": "L1",
            "latex": "p = \\frac{F}{A}"
          }
        ]
      },
      "notebookAfter": [
        {
          "id": "L1",
          "latex": "p = \\frac{F}{A}"
        }
      ]
    }
  ],
  "notebookHistory": []
}
```

**Expected behavior:** Keep p and replace the formula with p = F/(2A). A question is separate from completed correction.

| Setting | Outcome | Actual output (stored LaTeX shown directly) | Editor | Provider response(s) | Calls |
| --- | --- | --- | ---: | ---: | ---: |
| Luna / medium · ChatGPT | E — correct edit/undo | <code>replace L1: p = \frac{F}{2A}</code> | 7.855 s | 7.854 s | 1 |
| Terra / low · ChatGPT | E — correct edit/undo | <code>replace L1: p = \frac{F}{2A}</code> | 3.682 s | 3.680 s | 1 |
| Terra / off · ChatGPT | E — correct edit/undo | <code>replace L1: p = \frac{F}{2A}</code> | 3.993 s | 3.990 s | 1 |
| Gemini Flash-Lite / minimal · Zen | E — correct edit/undo | <code>replace L1: p = \frac{F}{2A}</code> | 1.124 s | 1.124 s | 1 |
| Gemini Flash-Lite / low · Zen | E — correct edit/undo | <code>replace L1: p = \frac{F}{2A}</code> | 1.062 s | 1.061 s | 1 |
| DeepSeek Flash / low · Zen | E — correct edit/undo | <code>replace L1: p = \frac{F}{2A}</code> | 1.364 s | 1.364 s | 1 |
| DeepSeek Flash / explicit off · Zen | E — correct edit/undo | <code>replace L1: p = \frac{F}{2A}</code> | 1.405 s | 1.403 s | 1 |
| GLM Flash / low · Zen | E — correct edit/undo | <code>replace L1: p = \frac{F}{2A}</code> | 2.111 s | 2.107 s | 1 |
| Haiku / off · Zen | E — correct edit/undo | <code>replace L1: p = \frac{F}{2A}</code> | 1.473 s | 1.467 s | 1 |
| Qwen Flash / off · Zen | E — correct edit/undo | <code>replace L1: p = \frac{F}{2A}</code> | 1.405 s | 1.400 s | 1 |
| Luna / off · Zen | E — correct edit/undo | <code>replace L1: p = \frac{F}{2A}</code> | 0.900 s | 0.890 s | 1 |
| Qwen 27B / off · Cerebras | E — correct edit/undo | <code>replace L1: p = \frac{F}{2A}</code> | 0.479 s | 0.479 s | 1 |
| Qwen 27B / low · Cerebras | E — correct edit/undo | <code>replace L1: p = \frac{F}{2A}</code> | 0.409 s | 0.407 s | 1 |
| GPT-OSS 120B / low · Cerebras | E — correct edit/undo | <code>replace L1: p = \frac{F}{2A}</code> | 0.422 s | 0.420 s | 1 |
| GPT-OSS 120B / medium · Cerebras | E — correct edit/undo | <code>replace L1: p = \frac{F}{2A}</code> | 0.428 s | 0.422 s | 1 |

<a id="case-3"></a>

### 3. Write/right mistranscription

**Frozen complete editor input** (JSON escaping: `\\` represents one stored backslash):

```json
{
  "state": {
    "lines": [],
    "undo": []
  },
  "instruction": "Right pressure equals force divided by area.",
  "cursorLineId": null,
  "history": [],
  "notebookHistory": []
}
```

**Expected behavior:** Write pressure = force/area without adding “right” or “my” as mathematical content.

| Setting | Outcome | Actual output (stored LaTeX shown directly) | Editor | Provider response(s) | Calls |
| --- | --- | --- | ---: | ---: | ---: |
| Luna / medium · ChatGPT | E — correct edit/undo | <code>insert L1 after start: \text{pressure} = \frac{\text{force}}{\text{area}}</code> | 6.007 s | 6.006 s | 1 |
| Terra / low · ChatGPT | E — correct edit/undo | <code>insert L1 after start: \text{pressure} = \frac{\text{force}}{\text{area}}</code> | 3.026 s | 3.024 s | 1 |
| Terra / off · ChatGPT | E — correct edit/undo | <code>insert L1 after start: \text{pressure} = \frac{\text{force}}{\text{area}}</code> | 3.117 s | 3.114 s | 1 |
| Gemini Flash-Lite / minimal · Zen | E — correct edit/undo | <code>insert L1 after start: P = \frac{F}{A}</code> | 0.687 s | 0.686 s | 1 |
| Gemini Flash-Lite / low · Zen | E — correct edit/undo | <code>insert L1 after start: P = \frac{F}{A}</code> | 1.147 s | 1.145 s | 1 |
| DeepSeek Flash / low · Zen | E — correct edit/undo | <code>insert L1 after start: p = \frac{F}{A}</code> | 1.298 s | 1.297 s | 1 |
| DeepSeek Flash / explicit off · Zen | E — correct edit/undo | <code>insert L1 after start: p = \frac{F}{A}</code> | 1.374 s | 1.372 s | 1 |
| GLM Flash / low · Zen | E — correct edit/undo | <code>insert L1 after start: P = \frac{F}{A}</code> | 1.412 s | 1.409 s | 1 |
| Haiku / off · Zen | X — incorrect edit | <code>insert L1 after start: P_{\text{right}} = \frac{F}{A}</code> | 1.177 s | 1.173 s | 1 |
| Qwen Flash / off · Zen | E — correct edit/undo | <code>insert L1 after start: p = \frac{F}{A}</code> | 1.590 s | 1.585 s | 1 |
| Luna / off · Zen | X — incorrect edit | <code>insert L1 after start: \text{Right pressure} = \frac{\text{force}}{\text{area}}</code> | 1.274 s | 1.266 s | 1 |
| Qwen 27B / off · Cerebras | X — incorrect edit | <code>insert L1 after start: Right pressure = force / area</code> | 0.332 s | 0.331 s | 1 |
| Qwen 27B / low · Cerebras | X — incorrect edit | <code>insert L1 after start: P_R = \frac{F}{A}</code> | 0.562 s | 0.561 s | 1 |
| GPT-OSS 120B / low · Cerebras | E — correct edit/undo | <code>insert L1 after start: p = \frac{F}{A}</code> | 0.317 s | 0.314 s | 1 |
| GPT-OSS 120B / medium · Cerebras | X — incorrect edit | <code>insert L1 after start: \text{Right pressure} = \frac{F}{A}</code> | 0.458 s | 0.452 s | 1 |

<a id="case-4"></a>

### 4. Force in my by area mistranscription

**Frozen complete editor input** (JSON escaping: `\\` represents one stored backslash):

```json
{
  "state": {
    "lines": [],
    "undo": []
  },
  "instruction": "Right pressure equals force in my by area.",
  "cursorLineId": null,
  "history": [],
  "notebookHistory": []
}
```

**Expected behavior:** Write pressure = force/area without adding “right” or “my” as mathematical content.

| Setting | Outcome | Actual output (stored LaTeX shown directly) | Editor | Provider response(s) | Calls |
| --- | --- | --- | ---: | ---: | ---: |
| Luna / medium · ChatGPT | ? — clarification instead of edit | Did you mean “pressure equals force divided by area,” or should “my” remain in the expression? | 8.753 s | 8.752 s | 1 |
| Terra / low · ChatGPT | E — correct edit/undo | <code>insert L1 after start: \text{pressure} = \frac{\text{force}}{\text{area}}</code> | 4.068 s | 4.066 s | 1 |
| Terra / off · ChatGPT | E — correct edit/undo | <code>insert L1 after start: \text{pressure} = \frac{\text{force}}{\text{area}}</code> | 5.469 s | 5.466 s | 1 |
| Gemini Flash-Lite / minimal · Zen | E — correct edit/undo | <code>insert L1 after start: P = \frac{F}{A}</code> | 0.956 s | 0.955 s | 1 |
| Gemini Flash-Lite / low · Zen | E — correct edit/undo | <code>insert L1 after start: P = \frac{F}{A}</code> | 0.933 s | 0.932 s | 1 |
| DeepSeek Flash / low · Zen | E — correct edit/undo | <code>insert L1 after start: pressure = \frac{force}{area}</code> | 2.095 s | 2.094 s | 1 |
| DeepSeek Flash / explicit off · Zen | X — incorrect edit | <code>insert L1 after start: \text{Right pressure} = \frac{\text{force in my}}{\text{area}}</code> | 1.005 s | 1.003 s | 1 |
| GLM Flash / low · Zen | E — correct edit/undo | <code>insert L1 after start: P = \frac{F}{A}</code> | 1.535 s | 1.532 s | 1 |
| Haiku / off · Zen | X — incorrect edit | <code>insert L1 after start: P_{\text{right}} = \frac{F}{A}</code> | 0.878 s | 0.874 s | 1 |
| Qwen Flash / off · Zen | E — correct edit/undo | <code>insert L1 after start: P = \frac{F}{A}</code> | 1.611 s | 1.605 s | 1 |
| Luna / off · Zen | X — incorrect edit | <code>insert L1 after start: \text{Right pressure} = \frac{\text{force in my}}{\text{area}}</code> | 2.412 s | 2.390 s | 2 |
| Qwen 27B / off · Cerebras | E — correct edit/undo | <code>insert L1 after start: P = \frac{F}{A}</code> | 0.301 s | 0.300 s | 1 |
| Qwen 27B / low · Cerebras | E — correct edit/undo | <code>insert L1 after start: P = \frac{F}{A}</code> | 1.303 s | 1.300 s | 1 |
| GPT-OSS 120B / low · Cerebras | E — correct edit/undo | <code>insert L1 after start: p = \frac{F}{A}</code> | 0.544 s | 0.541 s | 1 |
| GPT-OSS 120B / medium · Cerebras | E — correct edit/undo | <code>insert L1 after start: p = \frac{F}{A}</code> | 0.478 s | 0.471 s | 1 |

<a id="case-5"></a>

### 5. Punctuated right pressure

**Frozen complete editor input** (JSON escaping: `\\` represents one stored backslash):

```json
{
  "state": {
    "lines": [],
    "undo": []
  },
  "instruction": "Right pressure. Equals force divided by area.",
  "cursorLineId": null,
  "history": [],
  "notebookHistory": []
}
```

**Expected behavior:** Write pressure = force/area without adding “right” or “my” as mathematical content.

| Setting | Outcome | Actual output (stored LaTeX shown directly) | Editor | Provider response(s) | Calls |
| --- | --- | --- | ---: | ---: | ---: |
| Luna / medium · ChatGPT | E — correct edit/undo | <code>insert L1 after start: \text{pressure} = \frac{\text{force}}{\text{area}}</code> | 7.207 s | 7.206 s | 1 |
| Terra / low · ChatGPT | E — correct edit/undo | <code>insert L1 after start: \text{pressure} = \frac{\text{force}}{\text{area}}</code> | 3.196 s | 3.194 s | 1 |
| Terra / off · ChatGPT | E — correct edit/undo | <code>insert L1 after start: \text{pressure} = \frac{\text{force}}{\text{area}}</code> | 3.389 s | 3.386 s | 1 |
| Gemini Flash-Lite / minimal · Zen | E — correct edit/undo | <code>insert L1 after start: P = \frac{F}{A}</code> | 0.798 s | 0.797 s | 1 |
| Gemini Flash-Lite / low · Zen | E — correct edit/undo | <code>insert L1 after start: P = \frac{F}{A}</code> | 1.229 s | 1.228 s | 1 |
| DeepSeek Flash / low · Zen | E — correct edit/undo | <code>insert L1 after start: p = \frac{F}{A}</code> | 1.626 s | 1.625 s | 1 |
| DeepSeek Flash / explicit off · Zen | E — correct edit/undo | <code>insert L1 after start: p = \frac{F}{A}</code> | 0.829 s | 0.827 s | 1 |
| GLM Flash / low · Zen | E — correct edit/undo | <code>insert L1 after start: \text{pressure} = \frac{\text{force}}{\text{area}}</code> | 1.401 s | 1.397 s | 1 |
| Haiku / off · Zen | E — correct edit/undo | <code>insert L1 after start: p = \frac{F}{A}</code> | 1.322 s | 1.318 s | 1 |
| Qwen Flash / off · Zen | E — correct edit/undo | <code>insert L1 after start: p = \frac{F}{A}</code> | 1.379 s | 1.373 s | 1 |
| Luna / off · Zen | X — incorrect edit | <code>insert L1 after start: \text{Right pressure} = \frac{\text{force}}{\text{area}}</code> | 2.418 s | 2.393 s | 2 |
| Qwen 27B / off · Cerebras | X — incorrect edit | <code>insert L1 after start: P_r = \frac{F}{A}</code> | 0.323 s | 0.322 s | 1 |
| Qwen 27B / low · Cerebras | E — correct edit/undo | <code>insert L1 after start: p = \frac{F}{A}</code> | 0.664 s | 0.662 s | 1 |
| GPT-OSS 120B / low · Cerebras | X — incorrect edit | <code>insert L1 after start: \text{Right pressure. Equals force divided by area.}</code> | 0.898 s | 0.895 s | 1 |
| GPT-OSS 120B / medium · Cerebras | E — correct edit/undo | <code>insert L1 after start: p = \frac{F}{A}</code> | 0.445 s | 0.438 s | 1 |

<a id="case-6"></a>

### 6. Clean initial pressure formula

**Frozen complete editor input** (JSON escaping: `\\` represents one stored backslash):

```json
{
  "state": {
    "lines": [],
    "undo": []
  },
  "instruction": "Write pressure equals force divided by area.",
  "cursorLineId": null,
  "history": [],
  "notebookHistory": []
}
```

**Expected behavior:** Write pressure = force/area without adding “right” or “my” as mathematical content.

| Setting | Outcome | Actual output (stored LaTeX shown directly) | Editor | Provider response(s) | Calls |
| --- | --- | --- | ---: | ---: | ---: |
| Luna / medium · ChatGPT | E — correct edit/undo | <code>insert L1 after start: \text{pressure} = \frac{\text{force}}{\text{area}}</code> | 6.590 s | 6.589 s | 1 |
| Terra / low · ChatGPT | E — correct edit/undo | <code>insert L1 after start: \text{pressure} = \frac{\text{force}}{\text{area}}</code> | 3.791 s | 3.789 s | 1 |
| Terra / off · ChatGPT | E — correct edit/undo | <code>insert L1 after start: p = \frac{F}{A}</code> | 4.249 s | 4.246 s | 1 |
| Gemini Flash-Lite / minimal · Zen | E — correct edit/undo | <code>insert L1 after start: P = \frac{F}{A}</code> | 0.978 s | 0.977 s | 1 |
| Gemini Flash-Lite / low · Zen | E — correct edit/undo | <code>insert L1 after start: P = \frac{F}{A}</code> | 0.782 s | 0.780 s | 1 |
| DeepSeek Flash / low · Zen | E — correct edit/undo | <code>insert L1 after start: P = \frac{F}{A}</code> | 1.451 s | 1.450 s | 1 |
| DeepSeek Flash / explicit off · Zen | E — correct edit/undo | <code>insert L1 after start: p = \frac{F}{A}</code> | 0.699 s | 0.696 s | 1 |
| GLM Flash / low · Zen | E — correct edit/undo | <code>insert L1 after start: p = \frac{F}{A}</code> | 1.138 s | 1.135 s | 1 |
| Haiku / off · Zen | E — correct edit/undo | <code>insert L1 after start: P = \frac{F}{A}</code> | 0.990 s | 0.985 s | 1 |
| Qwen Flash / off · Zen | E — correct edit/undo | <code>insert L1 after start: P = \frac{F}{A}</code> | 1.778 s | 1.773 s | 1 |
| Luna / off · Zen | E — correct edit/undo | <code>insert L1 after start: \text{pressure} = \frac{\text{force}}{\text{area}}</code> | 1.036 s | 1.028 s | 1 |
| Qwen 27B / off · Cerebras | E — correct edit/undo | <code>insert L1 after start: P = \frac{F}{A}</code> | 0.484 s | 0.483 s | 1 |
| Qwen 27B / low · Cerebras | E — correct edit/undo | <code>insert L1 after start: P = \frac{F}{A}</code> | 0.361 s | 0.359 s | 1 |
| GPT-OSS 120B / low · Cerebras | E — correct edit/undo | <code>insert L1 after start: p = \frac{F}{A}</code> | 0.312 s | 0.309 s | 1 |
| GPT-OSS 120B / medium · Cerebras | E — correct edit/undo | <code>insert L1 after start: p = \frac{F}{A}</code> | 0.425 s | 0.418 s | 1 |

<a id="case-7"></a>

### 7. Unfinished multiplication with archives

**Frozen complete editor input** (JSON escaping: `\\` represents one stored backslash):

```json
{
  "state": {
    "lines": [],
    "undo": []
  },
  "instruction": "So 300 times 50 minus 300 times three plus three, time... Plus six times 47.",
  "cursorLineId": null,
  "history": [],
  "notebookHistory": [
    {
      "id": "75f89872-a952-4216-a911-9e9de3adbbf0",
      "sourceContextId": "bacf3743-4690-4b9e-b3ce-530dadfd9c05",
      "sourceRevision": 3,
      "createdAt": "2026-11-02T22:50:45.924Z",
      "lines": [
        {
          "id": "L1",
          "latex": "24 \\times 13 = 24 \\times 10 + 24 \\times 3"
        },
        {
          "id": "L2",
          "latex": "= 240 + + 72 = 312"
        }
      ],
      "label": "Entry 1"
    },
    {
      "id": "88228dd1-67f3-460f-91eb-985642da4082",
      "sourceContextId": "f8489ad1-9ef9-410d-a7b4-1cf8e3c1d04a",
      "sourceRevision": 1,
      "createdAt": "2026-11-02T22:52:24.241Z",
      "lines": [
        {
          "id": "L1",
          "latex": "300 \\times 50 - 300 \\times 3 + 6 \\times 4 = 7"
        }
      ],
      "label": "Entry 2"
    }
  ]
}
```

**Expected behavior:** Retain + 3 × [unfinished] and the separate + 6 × 47 term, with every other term intact.

| Setting | Outcome | Actual output (stored LaTeX shown directly) | Editor | Provider response(s) | Calls |
| --- | --- | --- | ---: | ---: | ---: |
| Luna / medium · ChatGPT | ? — clarification instead of edit | What should come after “plus three times”—is there a factor you want to include before “plus six times 47”?. | 17.947 s | 17.945 s | 2 |
| Terra / low · ChatGPT | U — unfinished retained; <code>bare unfinished operator</code> | <code>insert L1 after start: 300 \times 50 - 300 \times 3 + 3 \times + 6 \times 47</code> | 3.262 s | 3.260 s | 1 |
| Terra / off · ChatGPT | U — unfinished retained; <code>bare unfinished operator</code> | <code>insert L1 after start: 300 \times 50 - 300 \times 3 + 3 \times + 6 \times 47</code> | 3.235 s | 3.232 s | 1 |
| Gemini Flash-Lite / minimal · Zen | X — incorrect edit | <code>insert L1 after start: 300 \times 50 - 300 \times 3 + 6 \times 47</code> | 2.177 s | 2.175 s | 2 |
| Gemini Flash-Lite / low · Zen | X — incorrect edit | <code>insert L1 after start: 300 \times 50 - 300 \times 3 + 6 \times 47</code> | 1.986 s | 1.978 s | 2 |
| DeepSeek Flash / low · Zen | ? — clarification instead of edit | Should I insert this as a new line: &#96;300 \times 50 - 300 \times 3 + 3 \times \ldots + 6 \times 47&#96;, or is the unfinished part meant to be &#96;+3 + \ldots + 6 \times 47&#96;? | 6.201 s | 6.200 s | 1 |
| DeepSeek Flash / explicit off · Zen | ? — clarification instead of edit | Should I write this as a new line: 300 \times 50 - 300 \times 3 + 6 \times 47? Also, should the "plus three" be included before "plus six times 47"? | 1.385 s | 1.383 s | 1 |
| GLM Flash / low · Zen | X — incorrect edit | <code>insert L1 after start: 300 \times 50 - 300 \times 3 + 6 \times 4 = 7</code> | 5.836 s | 5.833 s | 1 |
| Haiku / off · Zen | U — unfinished retained; <code>...</code> | <code>insert L1 after start: 300 \times 50 - 300 \times 3 + 3 \times ... + 6 \times 47</code> | 3.742 s | 3.728 s | 2 |
| Qwen Flash / off · Zen | X — incorrect edit | <code>insert L1 after start: 300 \times 50 - 300 \times 3 + 6 \times 47</code> | 29.267 s | 29.251 s | 2 |
| Luna / off · Zen | X — incorrect edit | <code>insert L1 after start: 300 \times 50 - 300 \times 3 + 3, \text{ time... Plus } 6 \times 47</code> | 3.863 s | 3.840 s | 2 |
| Qwen 27B / off · Cerebras | ? — clarification instead of edit | Could you clarify the number at the end? Did you mean 'six times 47' or 'six times four'? | 0.504 s | 0.503 s | 1 |
| Qwen 27B / low · Cerebras | X — incorrect edit | <code>insert L1 after start: 300 \times 50 - 300 \times 3 + 6 \times 47</code> | 0.991 s | 0.989 s | 1 |
| GPT-OSS 120B / low · Cerebras | ? — clarification instead of edit | Do you want the expression written as LaTeX like \(300 \times 50 - 300 \times 3 + 3 + 6 \times 47\), or should I record it exactly as you typed it? | 0.443 s | 0.440 s | 1 |
| GPT-OSS 120B / medium · Cerebras | ? — clarification instead of edit | Do you want to write the expression as 300\times50 - 300\times3 + 3 + 6\times47, or something different? | 0.490 s | 0.484 s | 1 |

<a id="case-8"></a>

### 8. Unfinished multiplication without archives

**Frozen complete editor input** (JSON escaping: `\\` represents one stored backslash):

```json
{
  "state": {
    "lines": [],
    "undo": []
  },
  "instruction": "So 300 times 50 minus 300 times three plus three, time... Plus six times 47.",
  "cursorLineId": null,
  "history": [],
  "notebookHistory": []
}
```

**Expected behavior:** Retain + 3 × [unfinished] and the separate + 6 × 47 term, with every other term intact.

| Setting | Outcome | Actual output (stored LaTeX shown directly) | Editor | Provider response(s) | Calls |
| --- | --- | --- | ---: | ---: | ---: |
| Luna / medium · ChatGPT | U — unfinished retained; <code>\ldots</code> | <code>insert L1 after start: 300\times 50 - 300\times 3 + 3\times \ldots + 6\times 47</code> | 8.446 s | 8.445 s | 1 |
| Terra / low · ChatGPT | X — incorrect edit | <code>insert L1 after start: 300 \times 50 - 300 \times 3 + 3 + 6 \times 47</code> | 3.153 s | 3.151 s | 1 |
| Terra / off · ChatGPT | U — unfinished retained; <code>\ldots</code> | <code>insert L1 after start: 300 \times 50 - 300 \times 3 + 3 \times \ldots + 6 \times 47</code> | 4.063 s | 4.060 s | 1 |
| Gemini Flash-Lite / minimal · Zen | X — incorrect edit | <code>insert L1 after start: 300 \times 50 - 300 \times 3 + 6 \times 47</code> | 0.760 s | 0.759 s | 1 |
| Gemini Flash-Lite / low · Zen | X — incorrect edit | <code>insert L1 after start: 300 \times 50 - 300 \times 3 + 6 \times 47</code> | 0.898 s | 0.895 s | 1 |
| DeepSeek Flash / low · Zen | U — unfinished retained; <code>\ldots</code> | <code>insert L1 after start: 300 \times 50 - 300 \times 3 + 3 \times \ldots + 6 \times 47</code> | 9.442 s | 9.441 s | 1 |
| DeepSeek Flash / explicit off · Zen | X — incorrect edit | <code>insert L1 after start: 300 \times 50 - 300 \times 3 + 3 + 6 \times 47</code> | 1.373 s | 1.371 s | 1 |
| GLM Flash / low · Zen | ? — clarification instead of edit | I heard '300 times 50 minus 300 times three plus three, time... Plus six times 47' — could you clarify the middle part? Did you mean 300 × 50 − 300 × 3 + 3 × 6 + 6 × 47, or something else? | 3.631 s | 3.628 s | 1 |
| Haiku / off · Zen | X — incorrect edit | <code>insert L1 after start: 300 \times 50 - 300 \times 3 + 3 \times 6 + 47</code> | 1.302 s | 1.298 s | 1 |
| Qwen Flash / off · Zen | ? — clarification instead of edit | The transcription is unclear at the end ('three, time... Plus six times 47'). Do you mean to write $300 \times 50 - 300 \times (3 + 3) + 6 \times 47$, or a different grouping? Please clarify the full expression. | 2.199 s | 2.193 s | 1 |
| Luna / off · Zen | ? — clarification instead of edit | How would you like me to record this in the notebook? Should I insert it as a new line, and what should the unfinished “time...” refer to? | 1.224 s | 1.217 s | 1 |
| Qwen 27B / off · Cerebras | ? — clarification instead of edit | Could you please clarify the expression? Specifically, does 'three, time...' mean multiplication (e.g., $3 \times \dots$) or something else, and what is the final operation in the sequence? Also, should 'time' be interpreted as the word 'times' (multiplication)? Please provide the full mathematical expression you want recorded. | 0.435 s | 0.434 s | 1 |
| Qwen 27B / low · Cerebras | X — incorrect edit | <code>insert L1 after start: 300 \times 50 - 300 \times 3 + 3 + 6 \times 47</code> | 0.572 s | 0.570 s | 1 |
| GPT-OSS 120B / low · Cerebras | X — incorrect edit | <code>insert L1 after start: 300 \times 50 - 300 \times 3 + 3 + 6 \times 47</code> | 0.400 s | 0.397 s | 1 |
| GPT-OSS 120B / medium · Cerebras | ? — clarification instead of edit | Could you clarify the part "plus three, time..."? What should follow the "time" after the plus three? | 0.567 s | 0.562 s | 1 |

<a id="case-9"></a>

### 9. Repeated 24 false start

**Frozen complete editor input** (JSON escaping: `\\` represents one stored backslash):

```json
{
  "state": {
    "lines": [],
    "undo": []
  },
  "instruction": "Set 24 times 13 equals twenty four twenty four times 10 plus 24 times three. Applied changes.",
  "cursorLineId": null,
  "history": [],
  "notebookHistory": []
}
```

**Expected behavior:** Use the historical accepted 24 × 13 = 24 × 10 + 24 × 3; owner explicitly treats the repeated spoken 24 as a false start.

| Setting | Outcome | Actual output (stored LaTeX shown directly) | Editor | Provider response(s) | Calls |
| --- | --- | --- | ---: | ---: | ---: |
| Luna / medium · ChatGPT | E — correct edit/undo | <code>insert L1 after start: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 8.696 s | 8.695 s | 1 |
| Terra / low · ChatGPT | X — incorrect edit | <code>insert L1 after start: 24 \times 13 = 24\ 24 \times 10 + 24 \times 3</code> | 3.414 s | 3.411 s | 1 |
| Terra / off · ChatGPT | E — correct edit/undo | <code>insert L1 after start: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 3.502 s | 3.499 s | 1 |
| Gemini Flash-Lite / minimal · Zen | E — correct edit/undo | <code>insert L1 after start: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 1.081 s | 1.080 s | 1 |
| Gemini Flash-Lite / low · Zen | E — correct edit/undo | <code>insert L1 after start: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 1.205 s | 1.203 s | 1 |
| DeepSeek Flash / low · Zen | E — correct edit/undo | <code>insert L1 after start: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 2.579 s | 2.579 s | 1 |
| DeepSeek Flash / explicit off · Zen | E — correct edit/undo | <code>insert L1 after start: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 0.825 s | 0.823 s | 1 |
| GLM Flash / low · Zen | E — correct edit/undo | <code>insert L1 after start: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 1.724 s | 1.721 s | 1 |
| Haiku / off · Zen | X — incorrect edit | <code>insert L1 after start: 24 \times 13 = twenty four twenty four times 10 plus 24 times three</code> | 0.918 s | 0.913 s | 1 |
| Qwen Flash / off · Zen | E — correct edit/undo | <code>insert L1 after start: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 1.697 s | 1.691 s | 1 |
| Luna / off · Zen | E — correct edit/undo | <code>insert L1 after start: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 2.385 s | 2.358 s | 2 |
| Qwen 27B / off · Cerebras | E — correct edit/undo | <code>insert L1 after start: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 0.337 s | 0.335 s | 1 |
| Qwen 27B / low · Cerebras | E — correct edit/undo | <code>insert L1 after start: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 0.460 s | 0.457 s | 1 |
| GPT-OSS 120B / low · Cerebras | E — correct edit/undo | <code>insert L1 after start: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 0.353 s | 0.349 s | 1 |
| GPT-OSS 120B / medium · Cerebras | E — correct edit/undo | <code>insert L1 after start: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 0.528 s | 0.521 s | 1 |

<a id="case-10"></a>

### 10. Targeted edit preserves mistakes

**Frozen complete editor input** (JSON escaping: `\\` represents one stored backslash):

```json
{
  "state": {
    "lines": [
      {
        "id": "L1",
        "latex": "2 + 2 = 5"
      },
      {
        "id": "L2",
        "latex": "x ="
      },
      {
        "id": "L3",
        "latex": "p = \\frac{F}{A} \\qquad 3 + 3 = 7"
      }
    ],
    "undo": []
  },
  "instruction": "In the pressure formula on line three, replace the denominator A with 2A.",
  "cursorLineId": null,
  "history": [],
  "notebookHistory": []
}
```

**Expected behavior:** Change only L3’s denominator to 2A; retain unrelated mistakes and unfinished working exactly.

| Setting | Outcome | Actual output (stored LaTeX shown directly) | Editor | Provider response(s) | Calls |
| --- | --- | --- | ---: | ---: | ---: |
| Luna / medium · ChatGPT | E — correct edit/undo | <code>replace L3: p = \frac{F}{2A} \qquad 3 + 3 = 7</code> | 3.804 s | 3.803 s | 1 |
| Terra / low · ChatGPT | E — correct edit/undo | <code>replace L3: p = \frac{F}{2A} \qquad 3 + 3 = 7</code> | 4.533 s | 4.531 s | 1 |
| Terra / off · ChatGPT | E — correct edit/undo | <code>replace L3: p = \frac{F}{2A} \qquad 3 + 3 = 7</code> | 3.155 s | 3.151 s | 1 |
| Gemini Flash-Lite / minimal · Zen | E — correct edit/undo | <code>replace L3: p = \frac{F}{2A} \qquad 3 + 3 = 7</code> | 0.908 s | 0.907 s | 1 |
| Gemini Flash-Lite / low · Zen | E — correct edit/undo | <code>replace L3: p = \frac{F}{2A} \qquad 3 + 3 = 7</code> | 0.847 s | 0.844 s | 1 |
| DeepSeek Flash / low · Zen | E — correct edit/undo | <code>replace L3: p = \frac{F}{2A} \qquad 3 + 3 = 7</code> | 1.402 s | 1.401 s | 1 |
| DeepSeek Flash / explicit off · Zen | E — correct edit/undo | <code>replace L3: p = \frac{F}{2A} \qquad 3 + 3 = 7</code> | 0.829 s | 0.826 s | 1 |
| GLM Flash / low · Zen | E — correct edit/undo | <code>replace L3: p = \frac{F}{2A} \qquad 3 + 3 = 7</code> | 2.266 s | 2.263 s | 1 |
| Haiku / off · Zen | E — correct edit/undo | <code>replace L3: p = \frac{F}{2A} \qquad 3 + 3 = 7</code> | 1.343 s | 1.339 s | 1 |
| Qwen Flash / off · Zen | E — correct edit/undo | <code>replace L3: p = \frac{F}{2A} \qquad 3 + 3 = 7</code> | 3.286 s | 3.263 s | 2 |
| Luna / off · Zen | E — correct edit/undo | <code>replace L3: p = \frac{F}{2A} \qquad 3 + 3 = 7</code> | 1.230 s | 1.222 s | 1 |
| Qwen 27B / off · Cerebras | E — correct edit/undo | <code>replace L3: p = \frac{F}{2A} \qquad 3 + 3 = 7</code> | 0.372 s | 0.370 s | 1 |
| Qwen 27B / low · Cerebras | E — correct edit/undo | <code>replace L3: p = \frac{F}{2A} \qquad 3 + 3 = 7</code> | 0.393 s | 0.390 s | 1 |
| GPT-OSS 120B / low · Cerebras | E — correct edit/undo | <code>replace L3: p = \frac{F}{2A} \qquad 3 + 3 = 7</code> | 0.328 s | 0.324 s | 1 |
| GPT-OSS 120B / medium · Cerebras | E — correct edit/undo | <code>replace L3: p = \frac{F}{2A} \qquad 3 + 3 = 7</code> | 0.376 s | 0.369 s | 1 |

<a id="case-11"></a>

### 11. Unfinished addition

**Frozen complete editor input** (JSON escaping: `\\` represents one stored backslash):

```json
{
  "state": {
    "lines": [
      {
        "id": "L1",
        "latex": "2 + 2 = 5"
      }
    ],
    "undo": []
  },
  "instruction": "Add a new line: y equals seven plus.",
  "cursorLineId": null,
  "history": [],
  "notebookHistory": []
}
```

**Expected behavior:** Append y = 7 + unfinished, preserving the existing mistake.

| Setting | Outcome | Actual output (stored LaTeX shown directly) | Editor | Provider response(s) | Calls |
| --- | --- | --- | ---: | ---: | ---: |
| Luna / medium · ChatGPT | U — unfinished retained; <code>bare unfinished operator</code> | <code>insert L2 after L1: y = 7 +</code> | 7.173 s | 7.171 s | 1 |
| Terra / low · ChatGPT | U — unfinished retained; <code>bare unfinished operator</code> | <code>insert L2 after L1: y = 7 +</code> | 2.884 s | 2.881 s | 1 |
| Terra / off · ChatGPT | U — unfinished retained; <code>bare unfinished operator</code> | <code>insert L2 after L1: y = 7 +</code> | 3.902 s | 3.898 s | 1 |
| Gemini Flash-Lite / minimal · Zen | U — unfinished retained; <code>bare unfinished operator</code> | <code>insert L2 after L1: y = 7 +</code> | 1.095 s | 1.094 s | 1 |
| Gemini Flash-Lite / low · Zen | U — unfinished retained; <code>bare unfinished operator</code> | <code>insert L2 after L1: y = 7 +</code> | 1.023 s | 1.020 s | 1 |
| DeepSeek Flash / low · Zen | U — unfinished retained; <code>bare unfinished operator</code> | <code>insert L2 after L1: y = 7 +</code> | 1.338 s | 1.337 s | 1 |
| DeepSeek Flash / explicit off · Zen | U — unfinished retained; <code>bare unfinished operator</code> | <code>insert L2 after L1: y = 7 +</code> | 1.294 s | 1.291 s | 1 |
| GLM Flash / low · Zen | U — unfinished retained; <code>bare unfinished operator</code> | <code>insert L2 after L1: y = 7 +</code> | 1.555 s | 1.551 s | 1 |
| Haiku / off · Zen | U — unfinished retained; <code>bare unfinished operator</code> | <code>insert L2 after L1: y = 7 +</code> | 1.650 s | 1.645 s | 1 |
| Qwen Flash / off · Zen | ? — clarification instead of edit | Is "y equals seven plus" unfinished, or should I add a term after the plus sign (e.g., y = 7 + x)? | 1.801 s | 1.793 s | 1 |
| Luna / off · Zen | U — unfinished retained; <code>bare unfinished operator</code> | <code>insert L2 after L1: y = 7 +</code> | 1.131 s | 1.121 s | 1 |
| Qwen 27B / off · Cerebras | X — incorrect edit | <code>insert L2 after L1: y equals seven plus</code> | 0.286 s | 0.285 s | 1 |
| Qwen 27B / low · Cerebras | U — unfinished retained; <code>bare unfinished operator</code> | <code>insert L2 after L1: y = 7 +</code> | 0.390 s | 0.388 s | 1 |
| GPT-OSS 120B / low · Cerebras | U — unfinished retained; <code>bare unfinished operator</code> | <code>insert L2 after L1: y = 7 +</code> | 0.486 s | 0.482 s | 1 |
| GPT-OSS 120B / medium · Cerebras | U — unfinished retained; <code>bare unfinished operator</code> | <code>insert L2 after L1: y = 7 +</code> | 0.465 s | 0.460 s | 1 |

<a id="case-12"></a>

### 12. Unfinished expansion

**Frozen complete editor input** (JSON escaping: `\\` represents one stored backslash):

```json
{
  "state": {
    "lines": [],
    "undo": []
  },
  "instruction": "Write five times eight equals five times ten minus five times.",
  "cursorLineId": null,
  "history": [],
  "notebookHistory": []
}
```

**Expected behavior:** Record 5 × 8 = 5 × 10 − 5 × unfinished without inventing a factor.

| Setting | Outcome | Actual output (stored LaTeX shown directly) | Editor | Provider response(s) | Calls |
| --- | --- | --- | ---: | ---: | ---: |
| Luna / medium · ChatGPT | U — unfinished retained; <code>bare unfinished operator</code> | <code>insert L1 after start: 5 \times 8 = 5 \times 10 - 5 \times</code> | 5.902 s | 5.901 s | 1 |
| Terra / low · ChatGPT | U — unfinished retained; <code>bare unfinished operator</code> | <code>insert L1 after start: 5 \times 8 = 5 \times 10 - 5 \times</code> | 3.347 s | 3.345 s | 1 |
| Terra / off · ChatGPT | U — unfinished retained; <code>bare unfinished operator</code> | <code>insert L1 after start: 5 \times 8 = 5 \times 10 - 5 \times</code> | 3.303 s | 3.299 s | 1 |
| Gemini Flash-Lite / minimal · Zen | X — incorrect edit | <code>insert L1 after start: 5 \times 8 = 5 \times 10 - 5 \times 2</code> | 0.696 s | 0.695 s | 1 |
| Gemini Flash-Lite / low · Zen | U — unfinished retained; <code>bare unfinished operator</code> | <code>insert L1 after start: 5 \times 8 = 5 \times 10 - 5 \times</code> | 0.799 s | 0.796 s | 1 |
| DeepSeek Flash / low · Zen | U — unfinished retained; <code>bare unfinished operator</code> | <code>insert L1 after start: 5 \times 8 = 5 \times 10 - 5 \times</code> | 1.816 s | 1.815 s | 1 |
| DeepSeek Flash / explicit off · Zen | U — unfinished retained; <code>bare unfinished operator</code> | <code>insert L1 after start: 5 \times 8 = 5 \times 10 - 5 \times</code> | 0.947 s | 0.944 s | 1 |
| GLM Flash / low · Zen | ? — clarification instead of edit | Did you mean "five times two" (5 × 8 = 5 × 10 − 5 × 2), or something else after "five times"? | 3.041 s | 3.038 s | 1 |
| Haiku / off · Zen | U — unfinished retained; <code>bare unfinished operator</code> | <code>insert L1 after start: 5 \times 8 = 5 \times 10 - 5 \times</code> | 1.651 s | 1.646 s | 1 |
| Qwen Flash / off · Zen | U — unfinished retained; <code>bare unfinished operator</code> | <code>insert L1 after start: 5 \times 8 = 5 \times 10 - 5 \times</code> | 1.783 s | 1.774 s | 1 |
| Luna / off · Zen | ? — clarification instead of edit | What number should come after “five times” at the end? | 0.980 s | 0.968 s | 1 |
| Qwen 27B / off · Cerebras | ? — clarification instead of edit | Did you mean 'five times eight equals five times ten minus five times two'? | 0.288 s | 0.286 s | 1 |
| Qwen 27B / low · Cerebras | ? — clarification instead of edit | Did you mean 'five times ten minus five times two' (i.e. 5 × 10 − 5 × 2), or did you want to leave it as 'five times' unfinished? | 0.724 s | 0.722 s | 1 |
| GPT-OSS 120B / low · Cerebras | U — unfinished retained; <code>bare unfinished operator</code> | <code>insert L1 after start: 5 \times 8 = 5 \times 10 - 5 \times</code> | 0.419 s | 0.415 s | 1 |
| GPT-OSS 120B / medium · Cerebras | X — incorrect edit | <code>insert L1 after start: 5 \\times 8 = 5 \\times 10 - 5 \\times 2</code> | 0.508 s | 0.501 s | 1 |

<a id="case-13"></a>

### 13. Ambiguous denominator target

**Frozen complete editor input** (JSON escaping: `\\` represents one stored backslash):

```json
{
  "state": {
    "lines": [
      {
        "id": "L1",
        "latex": "p = \\frac{F}{A}"
      },
      {
        "id": "L2",
        "latex": "q = \\frac{Q}{A}"
      }
    ],
    "undo": []
  },
  "instruction": "Change the denominator to 2A.",
  "cursorLineId": null,
  "history": [],
  "notebookHistory": []
}
```

**Expected behavior:** Ask which target/source is intended; leave state unchanged.

| Setting | Outcome | Actual output (stored LaTeX shown directly) | Editor | Provider response(s) | Calls |
| --- | --- | --- | ---: | ---: | ---: |
| Luna / medium · ChatGPT | Q — required clarification | Which denominator should I change to 2A: the one in p = F/A, the one in q = Q/A, or both? | 10.165 s | 10.161 s | 2 |
| Terra / low · ChatGPT | Q — required clarification | Which denominator should I change to 2A: the one on the first line or the second line? | 3.251 s | 3.249 s | 1 |
| Terra / off · ChatGPT | Q — required clarification | Which denominator would you like to change to 2A: the one in p = F/A or the one in q = Q/A? | 3.173 s | 3.169 s | 1 |
| Gemini Flash-Lite / minimal · Zen | Q — required clarification | Which line's denominator would you like to change to 2A? | 0.983 s | 0.981 s | 1 |
| Gemini Flash-Lite / low · Zen | Q — required clarification | Which denominator would you like to change to 2A? | 0.960 s | 0.957 s | 1 |
| DeepSeek Flash / low · Zen | Q — required clarification | Which denominator should I change to 2A—line 1 (p = F/A), line 2 (q = Q/A), or both? | 1.785 s | 1.784 s | 1 |
| DeepSeek Flash / explicit off · Zen | Q — required clarification | Which line should change to have denominator 2A — the line p = F/A or the line q = Q/A? | 0.868 s | 0.866 s | 1 |
| GLM Flash / low · Zen | Q — required clarification | Both lines have A as the denominator — should I change it to 2A in the first line (p = F/A), the second (q = Q/A), or both? | 2.058 s | 2.054 s | 1 |
| Haiku / off · Zen | Q — required clarification | Which denominator should change to 2A: the one in line L1 (p = F/A) or the one in line L2 (q = Q/A)? | 2.037 s | 2.024 s | 2 |
| Qwen Flash / off · Zen | Q — required clarification | Which line should I change? Currently there are two lines: L1 (p = \frac{F}{A}) and L2 (q = \frac{Q}{A}). | 1.850 s | 1.841 s | 1 |
| Luna / off · Zen | Q — required clarification | Which denominator should I change to 2A: the denominator in p = \frac{F}{A}, the denominator in q = \frac{Q}{A}, or both? | 2.188 s | 2.182 s | 1 |
| Qwen 27B / off · Cerebras | Q — required clarification | Which equation's denominator should be changed to 2A: the one for p (L1) or the one for q (L2)? | 0.312 s | 0.311 s | 1 |
| Qwen 27B / low · Cerebras | Q — required clarification | Which line's denominator should be changed to 2A — line 1 (p = F/A), line 2 (q = Q/A), or both? | 0.412 s | 0.409 s | 1 |
| GPT-OSS 120B / low · Cerebras | X — incorrect edit | <code>replace L1: p = \frac{F}{2A}</code><br><code>replace L2: q = \frac{Q}{2A}</code> | 0.344 s | 0.341 s | 1 |
| GPT-OSS 120B / medium · Cerebras | Q — required clarification | Do you want to change the denominator to 2A in both equations, or just one of them? If just one, please specify which line (e.g., p = ... or q = ...). | 0.465 s | 0.458 s | 1 |

<a id="case-14"></a>

### 14. Follow up clarification

**Frozen complete editor input** (JSON escaping: `\\` represents one stored backslash):

```json
{
  "state": {
    "lines": [
      {
        "id": "L1",
        "latex": "p = \\frac{F}{A}"
      },
      {
        "id": "L2",
        "latex": "q = \\frac{Q}{A}"
      }
    ],
    "undo": []
  },
  "instruction": "The second line.",
  "cursorLineId": null,
  "history": [
    {
      "instruction": "Change the denominator to 2A.",
      "selection": null,
      "cursorLineId": null,
      "response": {
        "action": "question",
        "question": "Which line's denominator should be changed to 2A?"
      },
      "notebookAfter": [
        {
          "id": "L1",
          "latex": "p = \\frac{F}{A}"
        },
        {
          "id": "L2",
          "latex": "q = \\frac{Q}{A}"
        }
      ]
    }
  ],
  "notebookHistory": []
}
```

**Expected behavior:** Use the fixed prior clarification exchange to replace only L2 with q = Q/(2A).

| Setting | Outcome | Actual output (stored LaTeX shown directly) | Editor | Provider response(s) | Calls |
| --- | --- | --- | ---: | ---: | ---: |
| Luna / medium · ChatGPT | E — correct edit/undo | <code>replace L2: q = \frac{Q}{2A}</code> | 2.874 s | 2.873 s | 1 |
| Terra / low · ChatGPT | E — correct edit/undo | <code>replace L2: q = \frac{Q}{2A}</code> | 3.832 s | 3.830 s | 1 |
| Terra / off · ChatGPT | E — correct edit/undo | <code>replace L2: q = \frac{Q}{2A}</code> | 5.168 s | 5.165 s | 1 |
| Gemini Flash-Lite / minimal · Zen | E — correct edit/undo | <code>replace L2: q = \frac{Q}{2A}</code> | 0.875 s | 0.873 s | 1 |
| Gemini Flash-Lite / low · Zen | E — correct edit/undo | <code>replace L2: q = \frac{Q}{2A}</code> | 0.968 s | 0.965 s | 1 |
| DeepSeek Flash / low · Zen | E — correct edit/undo | <code>replace L2: q = \frac{Q}{2A}</code> | 1.018 s | 1.017 s | 1 |
| DeepSeek Flash / explicit off · Zen | E — correct edit/undo | <code>replace L2: q = \frac{Q}{2A}</code> | 0.687 s | 0.685 s | 1 |
| GLM Flash / low · Zen | E — correct edit/undo | <code>replace L2: q = \frac{Q}{2A}</code> | 1.252 s | 1.248 s | 1 |
| Haiku / off · Zen | E — correct edit/undo | <code>replace L2: q = \frac{Q}{2A}</code> | 1.254 s | 1.247 s | 1 |
| Qwen Flash / off · Zen | E — correct edit/undo | <code>replace L2: q = \frac{Q}{2A}</code> | 1.486 s | 1.477 s | 1 |
| Luna / off · Zen | E — correct edit/undo | <code>replace L2: q = \frac{Q}{2A}</code> | 1.016 s | 1.005 s | 1 |
| Qwen 27B / off · Cerebras | E — correct edit/undo | <code>replace L2: q = \frac{Q}{2A}</code> | 1.172 s | 1.170 s | 1 |
| Qwen 27B / low · Cerebras | E — correct edit/undo | <code>replace L2: q = \frac{Q}{2A}</code> | 0.927 s | 0.924 s | 1 |
| GPT-OSS 120B / low · Cerebras | E — correct edit/undo | <code>replace L2: q = \frac{Q}{2A}</code> | 0.348 s | 0.342 s | 1 |
| GPT-OSS 120B / medium · Cerebras | X — incorrect edit | <code>replace L2: q = \\frac{Q}{2A}</code> | 0.550 s | 0.542 s | 1 |

<a id="case-15"></a>

### 15. Intentional literal rename

**Frozen complete editor input** (JSON escaping: `\\` represents one stored backslash):

```json
{
  "state": {
    "lines": [
      {
        "id": "L1",
        "latex": "p = \\frac{F}{A}"
      }
    ],
    "undo": [
      []
    ]
  },
  "instruction": "Rename p to the literal word fresh. I mean the word fresh, not pressure. Keep the rest of the formula unchanged.",
  "cursorLineId": null,
  "history": [
    {
      "instruction": "Right pressure equals force divided by area.",
      "selection": null,
      "cursorLineId": null,
      "response": {
        "action": "edit",
        "operations": [
          {
            "op": "insert",
            "after": null,
            "id": "L1",
            "latex": "p = \\frac{F}{A}"
          }
        ]
      },
      "notebookAfter": [
        {
          "id": "L1",
          "latex": "p = \\frac{F}{A}"
        }
      ]
    }
  ],
  "notebookHistory": []
}
```

**Expected behavior:** Honor the explicit literal rename to fresh; keep denominator A and the rest of the formula.

| Setting | Outcome | Actual output (stored LaTeX shown directly) | Editor | Provider response(s) | Calls |
| --- | --- | --- | ---: | ---: | ---: |
| Luna / medium · ChatGPT | E — correct edit/undo | <code>replace L1: \text{fresh} = \frac{F}{A}</code> | 5.393 s | 5.392 s | 1 |
| Terra / low · ChatGPT | E — correct edit/undo | <code>replace L1: \text{fresh} = \frac{F}{A}</code> | 2.999 s | 2.996 s | 1 |
| Terra / off · ChatGPT | E — correct edit/undo | <code>replace L1: \text{fresh} = \frac{F}{A}</code> | 2.950 s | 2.946 s | 1 |
| Gemini Flash-Lite / minimal · Zen | E — correct edit/undo | <code>replace L1: \text{fresh} = \frac{F}{A}</code> | 1.085 s | 1.083 s | 1 |
| Gemini Flash-Lite / low · Zen | E — correct edit/undo | <code>replace L1: \text{fresh} = \frac{F}{A}</code> | 1.187 s | 1.184 s | 1 |
| DeepSeek Flash / low · Zen | E — correct edit/undo | <code>replace L1: \text{fresh} = \frac{F}{A}</code> | 2.353 s | 2.352 s | 1 |
| DeepSeek Flash / explicit off · Zen | E — correct edit/undo | <code>replace L1: fresh = \frac{F}{A}</code> | 0.927 s | 0.924 s | 1 |
| GLM Flash / low · Zen | E — correct edit/undo | <code>replace L1: fresh = \frac{F}{A}</code> | 1.534 s | 1.531 s | 1 |
| Haiku / off · Zen | E — correct edit/undo | <code>replace L1: \text{fresh} = \frac{F}{A}</code> | 0.883 s | 0.877 s | 1 |
| Qwen Flash / off · Zen | E — correct edit/undo | <code>replace L1: fresh = \frac{F}{A}</code> | 2.279 s | 2.270 s | 1 |
| Luna / off · Zen | E — correct edit/undo | <code>replace L1: fresh = \frac{F}{A}</code> | 2.399 s | 2.365 s | 2 |
| Qwen 27B / off · Cerebras | E — correct edit/undo | <code>replace L1: fresh = \frac{F}{A}</code> | 0.323 s | 0.321 s | 1 |
| Qwen 27B / low · Cerebras | E — correct edit/undo | <code>replace L1: fresh = \frac{F}{A}</code> | 0.651 s | 0.648 s | 1 |
| GPT-OSS 120B / low · Cerebras | E — correct edit/undo | <code>replace L1: fresh = \frac{F}{A}</code> | 0.308 s | 0.302 s | 1 |
| GPT-OSS 120B / medium · Cerebras | E — correct edit/undo | <code>replace L1: fresh = \frac{F}{A}</code> | 0.329 s | 0.322 s | 1 |

<a id="case-16"></a>

### 16. Replace whole multi-equation line

**Frozen complete editor input** (JSON escaping: `\\` represents one stored backslash):

```json
{
  "state": {
    "lines": [
      {
        "id": "L1",
        "latex": "p = \\frac{F}{A} \\qquad q = \\frac{Q}{A}"
      },
      {
        "id": "L2",
        "latex": "2 + 2 = 5"
      }
    ],
    "undo": []
  },
  "instruction": "Replace the entire first line with y equals 2.",
  "cursorLineId": null,
  "history": [],
  "notebookHistory": []
}
```

**Expected behavior:** Replace the complete multi-equation first line with y = 2; preserve line two exactly.

| Setting | Outcome | Actual output (stored LaTeX shown directly) | Editor | Provider response(s) | Calls |
| --- | --- | --- | ---: | ---: | ---: |
| Luna / medium · ChatGPT | E — correct edit/undo | <code>replace L1: y = 2</code> | 2.329 s | 2.327 s | 1 |
| Terra / low · ChatGPT | E — correct edit/undo | <code>replace L1: y = 2</code> | 3.020 s | 3.018 s | 1 |
| Terra / off · ChatGPT | E — correct edit/undo | <code>replace L1: y = 2</code> | 3.050 s | 3.046 s | 1 |
| Gemini Flash-Lite / minimal · Zen | E — correct edit/undo | <code>replace L1: y = 2</code> | 0.544 s | 0.543 s | 1 |
| Gemini Flash-Lite / low · Zen | E — correct edit/undo | <code>replace L1: y = 2</code> | 0.785 s | 0.783 s | 1 |
| DeepSeek Flash / low · Zen | E — correct edit/undo | <code>replace L1: y = 2</code> | 1.104 s | 1.102 s | 1 |
| DeepSeek Flash / explicit off · Zen | E — correct edit/undo | <code>replace L1: y = 2</code> | 1.069 s | 1.066 s | 1 |
| GLM Flash / low · Zen | E — correct edit/undo | <code>replace L1: y = 2</code> | 1.421 s | 1.417 s | 1 |
| Haiku / off · Zen | E — correct edit/undo | <code>replace L1: y = 2</code> | 1.349 s | 1.344 s | 1 |
| Qwen Flash / off · Zen | E — correct edit/undo | <code>replace L1: y = 2</code> | 1.128 s | 1.119 s | 1 |
| Luna / off · Zen | E — correct edit/undo | <code>replace L1: y = 2</code> | 0.909 s | 0.899 s | 1 |
| Qwen 27B / off · Cerebras | E — correct edit/undo | <code>replace L1: y = 2</code> | 0.744 s | 0.742 s | 1 |
| Qwen 27B / low · Cerebras | E — correct edit/undo | <code>replace L1: y = 2</code> | 0.328 s | 0.325 s | 1 |
| GPT-OSS 120B / low · Cerebras | E — correct edit/undo | <code>replace L1: y = 2</code> | 0.349 s | 0.343 s | 1 |
| GPT-OSS 120B / medium · Cerebras | E — correct edit/undo | <code>replace L1: y = 2</code> | 1.900 s | 1.892 s | 1 |

<a id="case-17"></a>

### 17. Copy a specified archived line

**Frozen complete editor input** (JSON escaping: `\\` represents one stored backslash):

```json
{
  "state": {
    "lines": [
      {
        "id": "L1",
        "latex": "2 + 2 = 5"
      }
    ],
    "undo": []
  },
  "instruction": "Copy the first line of Entry 1 as a new line after my current working.",
  "cursorLineId": null,
  "history": [],
  "notebookHistory": [
    {
      "id": "75f89872-a952-4216-a911-9e9de3adbbf0",
      "sourceContextId": "bacf3743-4690-4b9e-b3ce-530dadfd9c05",
      "sourceRevision": 3,
      "createdAt": "2026-11-02T22:50:45.924Z",
      "lines": [
        {
          "id": "L1",
          "latex": "24 \\times 13 = 24 \\times 10 + 24 \\times 3"
        },
        {
          "id": "L2",
          "latex": "= 240 + + 72 = 312"
        }
      ],
      "label": "Entry 1"
    },
    {
      "id": "88228dd1-67f3-460f-91eb-985642da4082",
      "sourceContextId": "f8489ad1-9ef9-410d-a7b4-1cf8e3c1d04a",
      "sourceRevision": 1,
      "createdAt": "2026-11-02T22:52:24.241Z",
      "lines": [
        {
          "id": "L1",
          "latex": "300 \\times 50 - 300 \\times 3 + 6 \\times 4 = 7"
        }
      ],
      "label": "Entry 2"
    }
  ]
}
```

**Expected behavior:** Append the specified archived line, preserving source bytes, current working and archives.

| Setting | Outcome | Actual output (stored LaTeX shown directly) | Editor | Provider response(s) | Calls |
| --- | --- | --- | ---: | ---: | ---: |
| Luna / medium · ChatGPT | E — correct edit/undo | <code>insert L2 after L1: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 6.014 s | 6.013 s | 1 |
| Terra / low · ChatGPT | E — correct edit/undo | <code>insert L2 after L1: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 3.101 s | 3.098 s | 1 |
| Terra / off · ChatGPT | E — correct edit/undo | <code>insert L2 after L1: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 4.200 s | 4.196 s | 1 |
| Gemini Flash-Lite / minimal · Zen | E — correct edit/undo | <code>insert L2 after L1: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 0.815 s | 0.813 s | 1 |
| Gemini Flash-Lite / low · Zen | E — correct edit/undo | <code>insert L2 after L1: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 1.433 s | 1.430 s | 1 |
| DeepSeek Flash / low · Zen | E — correct edit/undo | <code>insert L2 after L1: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 1.945 s | 1.944 s | 1 |
| DeepSeek Flash / explicit off · Zen | E — correct edit/undo | <code>insert L2 after L1: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 0.772 s | 0.769 s | 1 |
| GLM Flash / low · Zen | E — correct edit/undo | <code>insert L2 after L1: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 1.240 s | 1.236 s | 1 |
| Haiku / off · Zen | E — correct edit/undo | <code>insert L2 after L1: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 1.131 s | 1.126 s | 1 |
| Qwen Flash / off · Zen | E — correct edit/undo | <code>insert L2 after L1: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 1.626 s | 1.616 s | 1 |
| Luna / off · Zen | E — correct edit/undo | <code>insert L2 after L1: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 1.613 s | 1.604 s | 1 |
| Qwen 27B / off · Cerebras | E — correct edit/undo | <code>insert L2 after L1: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 0.485 s | 0.483 s | 1 |
| Qwen 27B / low · Cerebras | E — correct edit/undo | <code>insert L2 after L1: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 0.500 s | 0.497 s | 1 |
| GPT-OSS 120B / low · Cerebras | X — incorrect edit | <code>insert L2 after L1: 24 \\times 13 = 24 \\times 10 + 24 \\times 3</code> | 0.374 s | 0.368 s | 1 |
| GPT-OSS 120B / medium · Cerebras | X — incorrect edit | <code>insert L2 after L1: 24 \\times 13 = 24 \\times 10 + 24 \\times 3</code> | 0.419 s | 0.411 s | 1 |

<a id="case-18"></a>

### 18. Ambiguous archived entry

**Frozen complete editor input** (JSON escaping: `\\` represents one stored backslash):

```json
{
  "state": {
    "lines": [
      {
        "id": "L1",
        "latex": "2 + 2 = 5"
      }
    ],
    "undo": []
  },
  "instruction": "Copy the first line from an earlier entry into my current working.",
  "cursorLineId": null,
  "history": [],
  "notebookHistory": [
    {
      "id": "75f89872-a952-4216-a911-9e9de3adbbf0",
      "sourceContextId": "bacf3743-4690-4b9e-b3ce-530dadfd9c05",
      "sourceRevision": 3,
      "createdAt": "2026-11-02T22:50:45.924Z",
      "lines": [
        {
          "id": "L1",
          "latex": "24 \\times 13 = 24 \\times 10 + 24 \\times 3"
        },
        {
          "id": "L2",
          "latex": "= 240 + + 72 = 312"
        }
      ],
      "label": "Entry 1"
    },
    {
      "id": "88228dd1-67f3-460f-91eb-985642da4082",
      "sourceContextId": "f8489ad1-9ef9-410d-a7b4-1cf8e3c1d04a",
      "sourceRevision": 1,
      "createdAt": "2026-11-02T22:52:24.241Z",
      "lines": [
        {
          "id": "L1",
          "latex": "300 \\times 50 - 300 \\times 3 + 6 \\times 4 = 7"
        }
      ],
      "label": "Entry 2"
    }
  ]
}
```

**Expected behavior:** Ask which target/source is intended; leave state unchanged.

| Setting | Outcome | Actual output (stored LaTeX shown directly) | Editor | Provider response(s) | Calls |
| --- | --- | --- | ---: | ---: | ---: |
| Luna / medium · ChatGPT | X — incorrect edit | <code>insert L2 after L1: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 5.342 s | 5.340 s | 1 |
| Terra / low · ChatGPT | Q — required clarification | Which earlier entry should I copy the first line from: Entry 1 or Entry 2? | 4.387 s | 4.384 s | 1 |
| Terra / off · ChatGPT | Q — required clarification | Which earlier entry should I copy the first line from, and where should I place it in your current working? | 3.543 s | 3.538 s | 1 |
| Gemini Flash-Lite / minimal · Zen | Q — required clarification | Which earlier entry would you like to copy from? | 0.628 s | 0.626 s | 1 |
| Gemini Flash-Lite / low · Zen | Q — required clarification | Which earlier entry would you like to copy the first line from, Entry 1 or Entry 2? | 1.169 s | 1.166 s | 1 |
| DeepSeek Flash / low · Zen | Q — required clarification | Which earlier entry should I copy the first line from: Entry 1 or Entry 2? | 1.033 s | 1.031 s | 1 |
| DeepSeek Flash / explicit off · Zen | Q — required clarification | Which earlier entry do you mean—Entry 1 or Entry 2? | 1.622 s | 1.620 s | 1 |
| GLM Flash / low · Zen | X — incorrect edit | <code>insert L2 after start: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 1.974 s | 1.971 s | 1 |
| Haiku / off · Zen | Q — required clarification | Which earlier entry should I copy its first line from? Entry 1's first line is 24 \times 13 = 24 \times 10 + 24 \times 3, and Entry 2's first line is 300 \times 50 - 300 \times 3 + 6 \times 4 = 7. | 2.575 s | 2.561 s | 2 |
| Qwen Flash / off · Zen | Q — required clarification | Which entry would you like to copy from? The available entries are Entry 1 and Entry 2. | 1.449 s | 1.440 s | 1 |
| Luna / off · Zen | X — incorrect edit | <code>insert L2 after L1: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 2.423 s | 2.397 s | 2 |
| Qwen 27B / off · Cerebras | Q — required clarification | Which of the earlier entries (Entry 1 or Entry 2) would you like the first line from? | 0.350 s | 0.348 s | 1 |
| Qwen 27B / low · Cerebras | Q — required clarification | Which entry would you like the first line from — Entry 1 or Entry 2? | 0.494 s | 0.491 s | 1 |
| GPT-OSS 120B / low · Cerebras | X — incorrect edit | <code>insert L2 after L1: 24 \times 13 = 24 \times 10 + 24 \times 3</code> | 0.636 s | 0.632 s | 1 |
| GPT-OSS 120B / medium · Cerebras | X — incorrect edit | <code>insert L2 after L1: 24 \\times 13 = 24 \\times 10 + 24 \\times 3</code> | 0.624 s | 0.616 s | 1 |

<a id="case-19"></a>

### 19. Explicit Undo

**Frozen complete editor input** (JSON escaping: `\\` represents one stored backslash):

```json
{
  "state": {
    "lines": [
      {
        "id": "L1",
        "latex": "p = \\frac{F}{2A}"
      }
    ],
    "undo": [
      [
        {
          "id": "L1",
          "latex": "p = \\frac{F}{A}"
        }
      ]
    ]
  },
  "instruction": "Undo the last change.",
  "cursorLineId": null,
  "history": [],
  "notebookHistory": []
}
```

**Expected behavior:** Return Undo and restore exactly the previous snapshot.

| Setting | Outcome | Actual output (stored LaTeX shown directly) | Editor | Provider response(s) | Calls |
| --- | --- | --- | ---: | ---: | ---: |
| Luna / medium · ChatGPT | E — correct edit/undo | Undo → <code>L1: p = \frac{F}{A}</code> | 3.079 s | 3.077 s | 1 |
| Terra / low · ChatGPT | E — correct edit/undo | Undo → <code>L1: p = \frac{F}{A}</code> | 2.543 s | 2.539 s | 1 |
| Terra / off · ChatGPT | E — correct edit/undo | Undo → <code>L1: p = \frac{F}{A}</code> | 2.447 s | 2.442 s | 1 |
| Gemini Flash-Lite / minimal · Zen | E — correct edit/undo | Undo → <code>L1: p = \frac{F}{A}</code> | 0.744 s | 0.742 s | 1 |
| Gemini Flash-Lite / low · Zen | E — correct edit/undo | Undo → <code>L1: p = \frac{F}{A}</code> | 0.594 s | 0.591 s | 1 |
| DeepSeek Flash / low · Zen | E — correct edit/undo | Undo → <code>L1: p = \frac{F}{A}</code> | 1.682 s | 1.680 s | 1 |
| DeepSeek Flash / explicit off · Zen | E — correct edit/undo | Undo → <code>L1: p = \frac{F}{A}</code> | 1.594 s | 1.591 s | 1 |
| GLM Flash / low · Zen | E — correct edit/undo | Undo → <code>L1: p = \frac{F}{A}</code> | 1.040 s | 1.036 s | 1 |
| Haiku / off · Zen | E — correct edit/undo | Undo → <code>L1: p = \frac{F}{A}</code> | 1.057 s | 1.051 s | 1 |
| Qwen Flash / off · Zen | E — correct edit/undo | Undo → <code>L1: p = \frac{F}{A}</code> | 1.061 s | 1.052 s | 1 |
| Luna / off · Zen | E — correct edit/undo | Undo → <code>L1: p = \frac{F}{A}</code> | 0.785 s | 0.774 s | 1 |
| Qwen 27B / off · Cerebras | E — correct edit/undo | Undo → <code>L1: p = \frac{F}{A}</code> | 0.716 s | 0.714 s | 1 |
| Qwen 27B / low · Cerebras | E — correct edit/undo | Undo → <code>L1: p = \frac{F}{A}</code> | 0.324 s | 0.321 s | 1 |
| GPT-OSS 120B / low · Cerebras | E — correct edit/undo | Undo → <code>L1: p = \frac{F}{A}</code> | 0.312 s | 0.306 s | 1 |
| GPT-OSS 120B / medium · Cerebras | E — correct edit/undo | Undo → <code>L1: p = \frac{F}{A}</code> | 0.359 s | 0.351 s | 1 |

<a id="case-20"></a>

### 20. Explicit mathematical correction

**Frozen complete editor input** (JSON escaping: `\\` represents one stored backslash):

```json
{
  "state": {
    "lines": [
      {
        "id": "L1",
        "latex": "2 + 2 = 5"
      },
      {
        "id": "L2",
        "latex": "x ="
      },
      {
        "id": "L3",
        "latex": "p = \\frac{F}{A} \\qquad 3 + 3 = 7"
      }
    ],
    "undo": []
  },
  "instruction": "Correct only 3 + 3 = 7 on line three to 3 + 3 = 6. Leave everything else as written.",
  "cursorLineId": null,
  "history": [],
  "notebookHistory": []
}
```

**Expected behavior:** Correct only the explicitly requested 3 + 3 = 7 to 3 + 3 = 6; preserve the other mistake and unfinished line.

| Setting | Outcome | Actual output (stored LaTeX shown directly) | Editor | Provider response(s) | Calls |
| --- | --- | --- | ---: | ---: | ---: |
| Luna / medium · ChatGPT | E — correct edit/undo | <code>replace L3: p = \frac{F}{A} \qquad 3 + 3 = 6</code> | 2.894 s | 2.893 s | 1 |
| Terra / low · ChatGPT | E — correct edit/undo | <code>replace L3: p = \frac{F}{A} \qquad 3 + 3 = 6</code> | 3.593 s | 3.590 s | 1 |
| Terra / off · ChatGPT | E — correct edit/undo | <code>replace L3: p = \frac{F}{A} \qquad 3 + 3 = 6</code> | 3.978 s | 3.974 s | 1 |
| Gemini Flash-Lite / minimal · Zen | E — correct edit/undo | <code>replace L3: p = \frac{F}{A} \qquad 3 + 3 = 6</code> | 0.868 s | 0.866 s | 1 |
| Gemini Flash-Lite / low · Zen | E — correct edit/undo | <code>replace L3: p = \frac{F}{A} \qquad 3 + 3 = 6</code> | 0.847 s | 0.845 s | 1 |
| DeepSeek Flash / low · Zen | E — correct edit/undo | <code>replace L3: p = \frac{F}{A} \qquad 3 + 3 = 6</code> | 1.199 s | 1.198 s | 1 |
| DeepSeek Flash / explicit off · Zen | E — correct edit/undo | <code>replace L3: p = \frac{F}{A} \qquad 3 + 3 = 6</code> | 1.108 s | 1.105 s | 1 |
| GLM Flash / low · Zen | E — correct edit/undo | <code>replace L3: p = \frac{F}{A} \qquad 3 + 3 = 6</code> | 1.582 s | 1.578 s | 1 |
| Haiku / off · Zen | E — correct edit/undo | <code>replace L3: p = \frac{F}{A} \qquad 3 + 3 = 6</code> | 0.827 s | 0.822 s | 1 |
| Qwen Flash / off · Zen | E — correct edit/undo | <code>replace L3: p = \frac{F}{A} \qquad 3 + 3 = 6</code> | 5.464 s | 5.440 s | 2 |
| Luna / off · Zen | E — correct edit/undo | <code>replace L3: p = \frac{F}{A} \qquad 3 + 3 = 6</code> | 1.632 s | 1.622 s | 1 |
| Qwen 27B / off · Cerebras | E — correct edit/undo | <code>replace L3: p = \frac{F}{A} \qquad 3 + 3 = 6</code> | 0.413 s | 0.411 s | 1 |
| Qwen 27B / low · Cerebras | E — correct edit/undo | <code>replace L3: p = \frac{F}{A} \qquad 3 + 3 = 6</code> | 0.378 s | 0.375 s | 1 |
| GPT-OSS 120B / low · Cerebras | E — correct edit/undo | <code>replace L3: p = \frac{F}{A} \qquad 3 + 3 = 6</code> | 0.366 s | 0.361 s | 1 |
| GPT-OSS 120B / medium · Cerebras | E — correct edit/undo | <code>replace L3: p = \frac{F}{A} \qquad 3 + 3 = 6</code> | 0.396 s | 0.388 s | 1 |

## Usage and effort verification

| Setting | HTTP calls | Reasoning tokens | Cache read tokens | Input tokens (excluding separately reported cache) | Output tokens |
| --- | ---: | ---: | ---: | ---: | ---: |
| DeepSeek Flash / low · Zen | 20 | 3856 | 13952 | 2092 | 4616 |
| Terra / off · ChatGPT | 20 | 0 | 0 | 15381 | 820 |
| Gemini Flash-Lite / low · Zen | 21 | 324 | 0 | 16985 | 1104 |
| Terra / low · ChatGPT | 20 | 35 | 0 | 15381 | 854 |
| Qwen Flash / off · Zen | 23 | 0 | 0 | 13971 | 2448 |
| Luna / medium · ChatGPT | 22 | 1837 | 0 | 17288 | 2800 |
| Gemini Flash-Lite / minimal · Zen | 21 | 0 | 0 | 16982 | 709 |
| Qwen 27B / low · Cerebras | 20 | 4017 | 1024 | 15506 | 4765 |
| DeepSeek Flash / explicit off · Zen | 20 | 0 | 12672 | 2852 | 728 |
| Haiku / off · Zen | 23 | 0 | 0 | 92 | 1820 |
| GLM Flash / low · Zen | 20 | 850 | 0 | 15451 | 1626 |
| Qwen 27B / off · Cerebras | 20 | 0 | 1024 | 14946 | 950 |
| GPT-OSS 120B / low · Cerebras | 20 | 1420 | 11520 | 5081 | 2396 |
| GPT-OSS 120B / medium · Cerebras | 20 | 4334 | 10624 | 5977 | 5263 |
| Luna / off · Zen | 26 | 0 | 0 | 19008 | 1107 |

Requested effort verified on every wire request. All explicit-off settings reported zero reasoning tokens and no reasoning stream blocks/characters. DeepSeek off uses the documented test-only disabled-thinking override; no production adapter change. Usage is retained as reported, not converted to measured monetary cost.

## Harness repair and accounting

The first Gemini minimal/low invocation each failed locally before network: `callerSignal.addEventListener is not a function`. The generic test-only payload clone/traversal stripped the SDK AbortSignal methods. An offline mock-transport reproduction failed with the original transform; removing both the structured clone and traversal of non-plain objects preserved the signal and reached the mock transport with the exact frozen prompt. Only the two unmeasured Gemini settings were then completed; no finished model/case cell was rerun.

**300 completed cells, 316 actual provider requests, 16 format retries, plus 2 zero-network harness failures = 318 editor dispatch attempts**, within the authorized 600-call cap. All 316 requests returned HTTP 200; no provider/transport retries. Zero speech/Tutor calls. The two failed preparations remain in the artifact and are not counted as Gemini correctness failures.

Cumulative integration verification: **432 editor dispatch attempts (430 reached providers), 5 Tutor calls, at most 930.968 speech seconds**. This distinguishes the two new zero-network failures from earlier “editor calls” totals. The unused allowance is not an instruction to continue testing.

Subscription runs used the existing free regular-profile owner/credential leases; the owner’s separate dev-server profile and previews were untouched. API-key copies were isolated and deleted afterward. Source auth/settings/production prompt hashes matched afterward. All suite processes exited. Production prompt/default unchanged; owner/physical-device acceptance remains separate.

## Evidence and reproducibility

- [Approved plan](../notebook-complete-model-comparison-plan.md)
- [Portable data artifact: all 300 results, frozen contexts/prompts and attempts](notebook-complete-model-comparison-data.json)
- Local source evidence: `/tmp/opencode/notebook-integration/check-28-complete-manifest.json` plus `check-28-complete-{subscription,zen,cerebras,zen-gemini-repair}.json`.
- Local runner: `check-28-complete-suite.mts`; frozen-manifest builder: `prepare-28-complete-suite.mts`; grader: `grade-28-complete-suite.mjs`; report generator: `report-28-complete-suite.mjs`.
- Offline Gemini regression probe: `probe-28-gemini-payload.mts --fixed` (mock HTTP only).
- Raw evidence retains provisional classifications; manual review of incorrect edits, questions and unfinished outputs found no classification changes necessary. State/Undo invariants were checked independently. No paid calls were used to resolve checker disagreements.
