# Consistency check (Step 11 part 2 — mechanical checks only)

**Status:** Stage C, 2026-10-02.

This file records the **mechanical** checks run on the draft plan: their commands and their results. These checks are **not** the Step 11 part 1 plan critique.

- The **Stage D** plan critique (an independent Opus scout) and the **Stage E** fixes are later tasks.
- This document does **not** claim either of them has happened.
- After Stage E edits, re-run the checks and update this file.

## How the task files were produced

[task-briefs.md](task-briefs.md) and [backlog-import.md](backlog-import.md) were generated from a single task table by a drafting script, so that IDs, dependencies, waves and owned files stay identical in both files. The script is not committed. **The committed Markdown is now the source of truth**: later edits change the Markdown directly and re-run the checker below.

Waves were assigned greedily in topological order under these rules:
- at most 3 crewmates per wave;
- foundation tasks run with no other ship task;
- no two tasks in a wave own overlapping paths;
- no task shares a wave with any of its dependencies.

## Checks and results

| # | Check | Command | Result (2026-10-02) |
|---|---|---|---|
| 1 | Research copies are verbatim (body after the 2-line provenance note) | `tail -n +3 docs/plan/research/<file> \| cmp - ~/firstmate/data/<task>/report.md` for all 7 | **identical** ×7 |
| 2 | Only planning docs changed: no application code, prompt, AGENTS.md or dispatch edits | `git status --porcelain` | Only `docs/plan/**` and `docs/adr/**` added; `PLANNING_PROMPT.md` and `crew-dispatch.json` untouched |
| 3 | Test-vector arithmetic (TV-D, TV-P, TV-G, TV-W3, DST) | Python `datetime` re-computation while drafting (`date.fromisoformat`, `timedelta`) | All hand-computed dates and day counts matched (e.g. epochDay 2026-10-02 = 20728; TV-P3 window 10-04..10-10; TV-P4 Lc 24; EDD 2026-10-17) |
| 4 | Plan structure, matrix, approval coverage, backlog fields, dependency graph, waves, briefs, feature→task/test coverage, test catalogue, consent rules, the Section 3/4 enforcement matrix, links/anchors, unqualified "safe day" wording | `python3 check_plan.py <repo-root>` (source below) | **ALL CHECKS PASSED (0 failures)** — output below |
| 5 | No health-data rows or dataset files in any artefact | `git status --porcelain \| grep -v '\.md$'` | No non-Markdown files; the documents contain only synthetic test vectors |

### Checker output

```text
NOTES
 - matrix: 74 Flo groups, 20 Beyond-Flo; Flo decisions {'Replicate': 25, 'Adapt': 34, 'Replace': 8, 'Not applicable': 5, 'Not feasible on iOS web': 2}
 - plan.md sections: 18
 - backlog items: 91 (Counter({'ship': 47, 'scout': 39, 'gate': 5}))
 - waves: 44; max workers per wave 3
 - features with P0–P2 implementing tasks: 43
 - enforcement rows: 27; consent rules: 21
 - relative links checked: 297
ALL CHECKS PASSED 0
```

What the checker verifies, in plain words:

1. **Feature matrix.** Each row has an ID, a tier, inputs and outputs, a decision from the allowed sets, a justification, a MoSCoW priority and a phase. The 2026 perimenopause leads (Checker, Score, Timeline, Relief Options) are present.
2. **Approval list.** [plan.md §18](plan.md#18-open-questions-and-items-needing-approval) contains every non-Replicate Flo feature and every Beyond-Flo Add. The AP-02 rows match the matrix decisions exactly, and the §5 counts match the matrix.
3. **plan.md structure.** It has exactly the 18 required sections, in order.
4. **Backlog fields.** Every backlog item has all of these fields: title, kind, type, phase, wave, risk, features, blocked-by, owns, tests, route, labels and brief.
   - Ship tasks own files; scouts and gates own none.
   - Every high-risk ship task has a `-verify` item.
5. **Dependency graph.**
   - It is **acyclic**, and the import order is topological.
   - Every P0 item depends (transitively) on `flo-plan-approval`.
   - Every item is upstream of its phase gate, and every P1/P2 item depends on the previous gate.
   - No task consumes a high-risk ship task's output before its independent verify passes.
6. **Waves.** At most 3 workers per wave, no owned-file overlap within a wave, and no same-wave or out-of-order dependencies.
7. **Briefs.** There is one per backlog item, each with Given/When/Then, a route, and commands for ship tasks.
8. **Feature coverage.** Every P0–P2 feature maps to at least one implementing ship task and at least one task with tests. Later features carry a phase.
9. **Test catalogue.** Every test ID in the backlog exists in the [test-strategy.md](test-strategy.md) catalogue.
10. **Consent rules.** All 21 consent rules have an enforcement mechanism and a test, and each test is assigned to a P0–P2 task.
11. **Enforcement matrix.** Every Section 3 and Section 4 rule (S3-01…S3-09, S4-1…S4-10 with sub-rules) has an enforcement mechanism and a check.
12. **Links.** Every relative Markdown link and anchor resolves.
13. **Wording.** No unqualified "safe day" appears in the plan text (the research copies are excluded).

## Prompt §8 quality checklist — status after Stage C

| Checklist item | Status | Evidence |
|---|---|---|
| Every Flo feature in the matrix with a decision; deviations justified and listed for approval | Mechanically checked | Checks 1–2 |
| Beyond-Flo candidates scored and marked Add/Backlog/Reject | Mechanically checked | Matrix Beyond table (V/E/P present) |
| Every computation states Flo-documented vs substitute, with citations, edge cases and test vectors | Drafted; **needs Stage D critique and the later Opus algorithm/medical audits** | algorithms-spec.md A0–A18, edge-case map |
| Every consent rule enforced by encryption/separation and has a test | Mechanically checked (rule → enforcement → test mapping); **tests not yet written or run** | Check 10 |
| No screen, insight or notification implies safe days or birth control | Design rule plus copy lint and T-UX-04 planned; wording scan of plan text passed | Check 13; ux-spec §6–7 |
| Storage/sync decision has scored options, a plain-language recommendation and a tested plan for pairing, backup, restore and recovery | Drafted; tests are planned, **not executed** | storage-sync-decision.md, test-strategy T-PAIR/T-BAK |
| Every privacy and security rule has an automated check or a named review step | Mechanically checked | Check 11; security-privacy §2 |
| P0–P2 tasks small and self-contained, with owned files, criteria, commands and risk; graph acyclic; waves disjoint; ready to load | Mechanically checked; "small enough" is a judgement for Stage D | Checks 4–7 |
| Every phase ends with a gate, a verification report and a demo | Mechanically checked for P0–P2 (`pN-phase-verify` → `gate-phase-N`); P3–P7 in roadmap.md | Check 5, roadmap.md |
| Research ran on Sol or a documented Luna override; every execution role has a recorded model with high or above | Research: all scout reports record `gpt-6.1-sol` high. Roles: every item has a route | R1–R6 and cross-check method sections; backlog `route` |
| Operating model covers routing priority, escalation after 2 failed rounds, Opus verify before high-risk merge, and that model changes don't reset the 3-round limit | Drafted | agent-operating-model.md §2–5 |
| Phase 0 includes disposable-fixture verification of verifier safeguards, with gaps recorded as blockers | Planned (`p0-verifier-sandbox-proof` + verify); **not run**; FB-08 defined | agent-operating-model.md §6 |
| Nothing depends on paid services, an always-on server or a cloud AI | Drafted; the hard-$0 claim is **pending FB-01/FB-09** | storage-sync-decision.md §3 |
| Nothing copies Flo's content or branding | Planned (original content, placeholder name, fact-check plus originality review); not mechanically checkable | ux-spec.md §8 |
| A non-expert can follow the executive summary and glossary | Drafted; judgement for Stage D | plan.md §1–2 |

## Checker source (`check_plan.py`)

```python
#!/usr/bin/env python3
"""Mechanical consistency checks for docs/plan (Stage C). Usage: check_plan.py <repo-root>"""
import re, sys, os, glob, fnmatch, collections

root = sys.argv[1]
P = os.path.join(root, "docs/plan")
fails, notes = [], []
def fail(m): fails.append(m)
def read(p): return open(p, encoding="utf-8").read()

# ---------- 1. feature matrix
mx = read(os.path.join(P, "feature-parity-matrix.md"))
feat = {}
for line in mx.splitlines():
    m = re.match(r"\| (F-\d{3}) \|", line)
    if not m: continue
    cells = [c.strip() for c in line.strip().strip("|").split("|")]
    fid = cells[0]
    if fid in feat: fail(f"duplicate feature row {fid}")
    if fid < "F-100":   # Flo table: ID Src Feature Tier What Inputs Decision Justification MoSCoW Phase
        if len(cells) != 10: fail(f"{fid}: expected 10 cells, got {len(cells)}"); continue
        dec, just, mos, ph = cells[6], cells[7], cells[8], cells[9]
        if not cells[3]: fail(f"{fid}: missing tier")
        if not cells[5]: fail(f"{fid}: missing inputs/outputs")
    else:               # Beyond: ID R6 Feature VEP What Decision Justification MoSCoW Phase
        if len(cells) != 9: fail(f"{fid}: expected 9 cells, got {len(cells)}"); continue
        dec, just, mos, ph = cells[5], cells[6], cells[7], cells[8]
        if not re.match(r"\d/\d/\d", cells[3]): fail(f"{fid}: missing V/E/P score")
    d = re.sub(r"\*|\(.*?\)", "", dec).strip()
    if not just: fail(f"{fid}: missing justification")
    feat[fid] = dict(dec=d, mos=mos, phase=ph, raw=dec)
flo_ids = [f for f in feat if f < "F-100"]
by_dec = collections.Counter(feat[f]["dec"] for f in flo_ids)
notes.append(f"matrix: {len(flo_ids)} Flo groups, {len(feat)-len(flo_ids)} Beyond-Flo; Flo decisions {dict(by_dec)}")
allowed = {"Replicate", "Adapt", "Replace", "Not applicable", "Not feasible on iOS web"}
for f in flo_ids:
    if feat[f]["dec"] not in allowed: fail(f"{f}: decision '{feat[f]['dec']}' not allowed")
for f in feat:
    if f >= "F-100" and feat[f]["dec"] not in {"Add", "Backlog", "Reject"}: fail(f"{f}: Beyond decision '{feat[f]['dec']}'")
for line in mx.splitlines():
    pass
for need in ["Checker", "Score", "Timeline", "Relief Options"]:
    if not re.search(rf"\|[^|]*{need}[^|]*\| Premium-U", mx) and need not in mx: fail(f"perimenopause lead '{need}' missing")

# ---------- 2. approval list covers all deviations and Adds
plan = read(os.path.join(P, "plan.md"))
sec18 = plan.split("## 18.")[1]
for f in flo_ids:
    if feat[f]["dec"] != "Replicate" and f not in sec18: fail(f"approval list missing deviation {f} ({feat[f]['dec']})")
for f in feat:
    if f >= "F-100" and feat[f]["dec"] == "Add" and f not in sec18: fail(f"approval list missing Add {f}")
# check AP-02 table rows match matrix decisions exactly
for dec in ["Adapt", "Replace", "Not applicable", "Not feasible on iOS web"]:
    m = re.search(rf"^\| {re.escape(dec)} \| (.*?) \|\s*$", sec18, re.M)
    if not m: fail(f"AP-02 row for {dec} missing"); continue
    listed = set(re.findall(r"F-\d{3}", m.group(1)))
    expect = {f for f in flo_ids if feat[f]["dec"] == dec}
    if listed != expect: fail(f"AP-02 {dec} mismatch: missing {sorted(expect-listed)} extra {sorted(listed-expect)}")
# summary counts in plan §5
s5 = plan.split("## 5.")[1].split("## 6.")[0]
for dec in ["Replicate", "Adapt", "Replace", "Not applicable"]:
    m = re.search(rf"^\| {dec} \| (\d+)", s5, re.M)
    if not m or int(m.group(1)) != by_dec[dec]: fail(f"plan §5 count for {dec} wrong (matrix {by_dec[dec]})")
m = re.search(r"^\| Not feasible on iOS web \| (\d+)", s5, re.M)
if not m or int(m.group(1)) != by_dec["Not feasible on iOS web"]: fail("plan §5 count for Not feasible wrong")

# ---------- 3. plan.md has 18 sections in order
heads = re.findall(r"^## (\d+)\. (.+)$", plan, re.M)
if [int(h[0]) for h in heads] != list(range(1, 19)): fail(f"plan.md sections not 1..18: {[h[0] for h in heads]}")
notes.append(f"plan.md sections: {len(heads)}")

# ---------- 4. backlog parse
bl = read(os.path.join(P, "backlog-import.md"))
items = {}
order = []
for blk in re.split(r"^### ", bl, flags=re.M)[1:]:
    if not re.match(r"^[a-z0-9-]+\n", blk): continue
    iid = blk.split("\n", 1)[0].strip()
    fields = dict(re.findall(r"^- ([a-z-]+): (.*)$", blk, re.M))
    items[iid] = fields; order.append(iid)
req = ["title", "kind", "type", "phase", "wave", "risk", "features", "blocked-by", "owns", "tests", "route", "labels", "brief"]
for i, f in items.items():
    for r in req:
        if r not in f or not f[r].strip(): fail(f"{i}: missing field {r}")
    if f["kind"] == "ship" and f["owns"] == "—": fail(f"{i}: ship task without owned files")
    if f["kind"] != "ship" and f["owns"] != "—": fail(f"{i}: non-ship item owns repo files")
    if f["kind"] == "ship" and f["risk"] == "high" and f"{i}-verify" not in items: fail(f"{i}: high-risk ship task lacks {i}-verify")
notes.append(f"backlog items: {len(items)} ({collections.Counter(v['kind'] for v in items.values())})")
deps = {i: [] if f["blocked-by"] == "—" else [d.strip() for d in f["blocked-by"].split(",")] for i, f in items.items()}
external = {"flo-plan-approval"}
for i, ds in deps.items():
    for d in ds:
        if d not in items and d not in external: fail(f"{i}: unknown dependency {d}")
        if d in items and order.index(d) > order.index(i): fail(f"{i}: dependency {d} appears later (import order not topological)")
# high-risk ship outputs may only be consumed after their independent verify (except by that verify)
for i, ds in deps.items():
    for d in ds:
        if d in items and items[d]["kind"] == "ship" and items[d]["risk"] == "high" and i != f"{d}-verify":
            fail(f"{i} depends on high-risk {d} directly instead of {d}-verify")
# cycle detection
color = {}
def dfs(n, stack):
    color[n] = 1
    for d in deps.get(n, []):
        if d not in items: continue
        if color.get(d) == 1: fail(f"cycle: {' -> '.join(stack+[d])}")
        elif not color.get(d): dfs(d, stack + [d])
    color[n] = 2
for n in items:
    if not color.get(n): dfs(n, [n])
# every high-risk ship task's verify must gate the phase (transitively)
def ancestors(n, seen=None):
    seen = set() if seen is None else seen
    for d in deps.get(n, []):
        if d not in seen:
            seen.add(d)
            if d in items: ancestors(d, seen)
    return seen
for ph in ["P0", "P1", "P2"]:
    gate = f"gate-phase-{ph[1]}"
    anc = ancestors(gate)
    for i, f in items.items():
        if f["phase"] == ph and i != gate and i not in anc: fail(f"{i} not upstream of {gate}")
    if ph != "P0":
        prev = f"gate-phase-{int(ph[1])-1}"
        for i, f in items.items():
            if f["phase"] == ph and prev not in ancestors(i): fail(f"{i} does not depend on {prev}")
first = [i for i, f in items.items() if f["phase"] == "P0"]
for i in first:
    if "flo-plan-approval" not in ancestors(i): fail(f"{i} does not depend on flo-plan-approval")

# ---------- 5. wave rules
def globs(s):
    return [] if s == "—" else [g.strip().strip("`") for g in s.split(",")]
def overlap(a, b):
    for x in a:
        for y in b:
            if x == y or fnmatch.fnmatch(x, y) or fnmatch.fnmatch(y, x): return True
            xs, ys = x.rstrip("*").rstrip("/"), y.rstrip("*").rstrip("/")
            if x.endswith("**") and (y.startswith(xs + "/") or ys == xs): return True
            if y.endswith("**") and (x.startswith(ys + "/") or xs == ys): return True
    return False
waves = collections.defaultdict(list)
for i, f in items.items(): waves[f["wave"]].append(i)
wave_index = {}
for w in waves:
    ph, n = w.split("-W"); wave_index[w] = (ph, int(n))
for w, ms in waves.items():
    workers = [m for m in ms if items[m]["kind"] != "gate"]
    if len(workers) > 3: fail(f"{w}: {len(workers)} workers > 3")
    for a in range(len(workers)):
        for b in range(a + 1, len(workers)):
            if overlap(globs(items[workers[a]]["owns"]), globs(items[workers[b]]["owns"])): fail(f"{w}: file overlap {workers[a]} / {workers[b]}")
    for m in ms:
        for d in deps[m]:
            if d in items and items[d]["wave"] == w: fail(f"{w}: {m} depends on same-wave {d}")
            if d in items and wave_index[items[d]["wave"]][0] == wave_index[w][0] and wave_index[items[d]["wave"]][1] > wave_index[w][1]: fail(f"{m} scheduled before its dependency {d}")
notes.append(f"waves: {len(waves)}; max workers per wave {max(len([m for m in ms if items[m]['kind']!='gate']) for ms in waves.values())}")

# ---------- 6. briefs
br = read(os.path.join(P, "task-briefs.md"))
bids = re.findall(r"^### ([a-z0-9-]+)$", br, re.M)
if set(bids) != set(items): fail(f"brief/backlog id mismatch: {set(bids) ^ set(items)}")
for blk in re.split(r"^### ", br, flags=re.M)[1:]:
    i = blk.split("\n", 1)[0].strip()
    if i not in items: continue
    if "Given " not in blk or " When " not in blk or " Then " not in blk: fail(f"brief {i}: no Given/When/Then")
    if items[i]["kind"] == "ship" and "**Commands:**" not in blk: fail(f"brief {i}: no commands")
    if "**Route:**" not in blk: fail(f"brief {i}: no route")

# ---------- 7. feature coverage
impl_feats = collections.defaultdict(set); test_feats = collections.defaultdict(set)
for i, f in items.items():
    fs = [] if f["features"] == "—" else [x.strip() for x in f["features"].split(",")]
    for x in fs:
        if x not in feat: fail(f"{i}: unknown feature {x}")
        if f["kind"] == "ship": impl_feats[x].add(i)
        if f["tests"] != "—": test_feats[x].add(i)
for fid, v in feat.items():
    ph = v["phase"]
    if v["dec"] in {"Not applicable", "Backlog", "Reject"} or v["mos"].startswith("Won't") or v["dec"] == "Not feasible on iOS web" and ph in ("—", ""):
        continue
    phases = re.findall(r"P\d", ph)
    if not phases: fail(f"{fid}: no phase"); continue
    if any(p in ("P0", "P1", "P2") for p in phases):
        if not impl_feats[fid]: fail(f"{fid} ({ph}) has no implementing task")
        if not test_feats[fid]: fail(f"{fid} ({ph}) has no task with tests")
cov = sum(1 for fid in feat if impl_feats[fid])
notes.append(f"features with P0–P2 implementing tasks: {cov}")

# ---------- 8. test IDs referenced exist in catalogue
ts = read(os.path.join(P, "test-strategy.md"))
cat = set(re.findall(r"^\| (T-[A-Z0-9]+-\d+(?:…\d+)?)", ts, re.M))
known = set()
for c in cat:
    m = re.match(r"(T-[A-Z]+-)(\d+)…(\d+)", c)
    if m:
        for k in range(int(m.group(2)), int(m.group(3)) + 1): known.add(f"{m.group(1)}{k:02d}")
    else: known.add(c)
for i, f in items.items():
    for t in ([] if f["tests"] == "—" else [x.strip() for x in f["tests"].split(",")]):
        if t not in known: fail(f"{i}: test id {t} not in catalogue")

# ---------- 9. consent rules each have enforcement + test, and tests exist
sp = read(os.path.join(P, "security-privacy.md"))
crs = re.findall(r"^\| (CR-\d+) \| (.*?) \| (.*?) \| (T-CON-\d+)[^|]*\|", sp, re.M)
if len(crs) != 21: fail(f"expected 21 consent rules, parsed {len(crs)}")
for cr, rule, enf, t in crs:
    if not enf.strip(): fail(f"{cr}: no enforcement")
    if t not in known: fail(f"{cr}: test {t} not in catalogue")
    if not any(t in (f["tests"]) for f in items.values()): fail(f"{cr}: {t} not assigned to any P0–P2 task")
# ---------- 10. Section 3/4 enforcement matrix complete
em = re.findall(r"^\| (S[34]-[0-9a-z]+) \| (.*?) \| (.*?) \| (.*?) \|", ts, re.M)
ids = [e[0] for e in em]
need = [f"S3-0{k}" for k in range(1, 10)] + ["S4-1", "S4-2", "S4-3", "S4-4a", "S4-4b", "S4-4c", "S4-4d", "S4-4e", "S4-5", "S4-6a", "S4-6b", "S4-6c", "S4-7a", "S4-7b", "S4-7c", "S4-8", "S4-9", "S4-10"]
for n in need:
    if n not in ids: fail(f"enforcement matrix missing {n}")
for e in em:
    if not e[2].strip() or not e[3].strip(): fail(f"{e[0]}: missing enforcement or check")
notes.append(f"enforcement rows: {len(em)}; consent rules: {len(crs)}")

# ---------- 11. links and anchors
def anchor(h):
    h = h.strip().lower()
    h = re.sub(r"[^\w\- ]", "", h)
    return h.replace(" ", "-")
anchors = {}
mdfiles = glob.glob(os.path.join(root, "docs/plan/**/*.md"), recursive=True) + glob.glob(os.path.join(root, "docs/adr/*.md"))
for p in mdfiles:
    txt = read(p)
    txt_nocode = re.sub(r"```.*?```", "", txt, flags=re.S)
    anchors[os.path.abspath(p)] = {anchor(re.sub(r"`", "", h)) for h in re.findall(r"^#+ (.+)$", txt_nocode, re.M)}
nlinks = 0
for p in mdfiles:
    txt = re.sub(r"```.*?```", "", read(p), flags=re.S)
    for tgt in re.findall(r"\]\(([^)\s]+)\)", txt):
        if tgt.startswith("http"): continue
        nlinks += 1
        path, _, frag = tgt.partition("#")
        dest = os.path.abspath(os.path.join(os.path.dirname(p), path)) if path else os.path.abspath(p)
        if not os.path.exists(dest): fail(f"{os.path.relpath(p, root)}: broken link {tgt}"); continue
        if frag and dest.endswith(".md") and frag not in anchors.get(dest, set()): fail(f"{os.path.relpath(p, root)}: missing anchor {tgt}")
notes.append(f"relative links checked: {nlinks}")

# ---------- 12. forbidden wording outside quoted/negated contexts (spot check)
for p in mdfiles:
    if "/research/" in p: continue
    for ln, line in enumerate(read(p).splitlines(), 1):
        if re.search(r"\bsafe days?\b", line, re.I) and not re.search(r"no|never|not|\"|'|ban|lint|reject|“|”|label", line, re.I):
            fail(f"{os.path.relpath(p, root)}:{ln}: unqualified 'safe day'")

print("NOTES"); [print(" -", n) for n in notes]
print("FAILURES" if fails else "ALL CHECKS PASSED", len(fails)); [print(" -", f) for f in fails]
sys.exit(1 if fails else 0)
```
