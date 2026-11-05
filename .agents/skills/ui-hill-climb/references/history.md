# Run history

Use this when recording or resuming a run, importing older evidence, or auditing the skill. Normal reviewers receive their selected evidence pack, not this entire archive.

## Location and identity

Keep retained local history at `<main-project-root>/.scratch/ui-hill-climb/runs/<UTC-timestamp>-<short-id>/`. Use a filesystem-safe timestamp such as `2026-11-05T142344Z` and a unique suffix. Allocate a new directory per run; reuse an ID only to resume that same recorded run. An imported old run must identify its original dates separately from its import timestamp.

Resolve the main checkout using Git's worktree metadata, not the agent's current directory. Record its absolute path and the run's absolute archive path in the brief. In a bare or custom Git layout where the durable project root is ambiguous, ask rather than selecting a disposable worktree. All participants use the coordinator's recorded archive path.

The history directory is git-ignored and retained despite the `.scratch` name. Verify the ignore rule before storing private material. Leave `.ui-hill-climb.md` outside that ignore rule so project guidance can be version-controlled. Keep a small archive-root `README.md` index linking each run's manifest and outcome. Local retention is not a backup; do not automatically delete old runs, place them in system temporary storage or imply they survive loss of the project disk.

## Layout

```text
<run-id>/
  manifest.md
  brief.md
  timeline.md
  inputs/
    skill/
    project-context.md
    references/
  baseline/
    implementer/
    reviewers/<call-id>/
    evidence/
  rounds/01/
    implementer/
    reviewers/<call-id>/
    evidence/
    decision.md
  result.md
```

Create directories as artifacts arrive; absence is explicit in the manifest, not filled with invented content. An additional `legacy-evidence/` tree may preserve an imported run's original paths and galleries. Index those artifacts from the logical baseline/round folders instead of rewriting historical evidence to fit the new convention.

## What to retain

| Record | Contents |
| --- | --- |
| `manifest.md` | Run ID, status, timestamps, coordinator/worktree paths, source identities, model/provider/settings, reviewer-call and iteration limits, artifact inventory/hashes, known omissions and privacy limits. Record actual usage separately from estimates or unavailable accounting. |
| `brief.md` | The run request and setup record: source, goal, selected target, explicit requirements with their sources, rubric, references and execution budget. |
| `timeline.md` | Append-only chronology of actions, owner decisions, calls, failures, fixes, promotions and stopping. Preserve corrections as additions rather than rewriting earlier claims. |
| `inputs/` | Frozen copies of the hill-climb and council skills and supporting instructions actually used, selected project context, rubric and references. Keep each skill in its own subdirectory. Record an absent optional context file as absent. Later guidance changes must not silently replace these inputs. |
| `implementer/` | Exact instructions/updates sent, available message/tool transcripts, source snapshots or reproducible base plus patches, changed-file lists, rationale and validation records. Record baseline repairs separately from design rounds. |
| `reviewers/<call-id>/` | Exact council/delegate request, neutral labels, evidence inventory, provider/model/settings, raw returned response and available transcript. Give every call its own ID, including failed or partial calls. Keep council's synthesis separate from individual responses and label summaries as summaries. |
| `evidence/` | Capture scripts and configuration, source/fixture identities, state manifests, original screenshots/recordings, interaction checks, test commands, outputs and exit codes. Preserve failed attempts as well as successful reruns. |
| `decision.md` | Compared source IDs, each reviewer's explicit promote/retain/unable-to-judge verdict, regressions/trade-offs and the resulting promotion or retention. Record subsequent evidence and fresh verdicts separately. Keep the coordinator's build mapping out of blinded reviewer inputs. |
| `result.md` | Final incumbent and judged-source identities, separate scorecards, outcome versus target, usage, tests, actual-device observations, gaps, preview details and owner adoption status. Identify post-review repairs as distinct from the judged build. |

Retain the user-visible instructions, messages and tool records available through the runtime; internal model reasoning is not an archive input. If transcripts, exact commands, source states or billing were not captured or cannot be exported, name the omission. A condensed review is not a raw response. Keep original outputs intact when adding interpretations.

Use disposable fixtures. Exclude credentials, auth stores, live environment files and private keys; do not copy a whole runtime home or dependency cache. Keep approved private screenshots and potentially sensitive transcripts local. Describe any redaction or exclusion without recording the secret itself. A git-ignored path is not permission to publish its contents.

## During the run

1. At authorized setup, allocate the archive and record the run brief, source, actual skill inputs and selected context before implementation or paid review. The coordinator owns the manifest and timeline; give concurrent agents separate artifact directories.
2. Save each request before dispatch and its response, metadata, failures and available transcript on completion. Supply fresh reviewers only the frozen rubric, necessary constraints and neutral evidence. Preserve prior scores and narratives for audit, not as instructions for the next judge.
3. Before each comparison, record both source states and validate the evidence pack against them. Use snapshots or a known base plus complete patches, including required untracked files; a branch name alone cannot reproduce an uncommitted candidate.
4. At each decision, append the separate verdicts and apply the promotion rule to update the incumbent identity. Preserve rejected candidates, failed captures and test runs rather than replacing them with the successful attempt. Record later instruction or rubric changes as dated amendments; keep frozen inputs and original grades intact, and treat changed rubrics as a new evaluation setup.
5. At handoff, inventory retained artifacts and omissions, verify archive-local evidence links and named source identities, and report where the owner can find the run. Keep any live preview's location/lifetime distinct from the durable archive.

## Existing runs

Copy available historical artifacts into a fresh import directory and retain the originals. Preserve relative paths that galleries or manifests use. Verify copied files against source hashes; record the import time, source location, exclusions and verification result. If content is sensitive or space is insufficient, report the blocker rather than truncating the archive or deleting another run.

Do not apply today's skill, criteria or thresholds retroactively. Mark reconstructed briefs/decisions as reconstructions, keep subsequent retrospectives separate, and list unavailable original prompts, responses or intermediate source states. Link external thread IDs as provenance only; a link is not a locally retained transcript.

When auditing prior work, start with `manifest.md` and `result.md`, then open the relevant round and role records. Ordinary setup should load only the history needed to resolve the chosen source, inherited constraints or a known blocker.
