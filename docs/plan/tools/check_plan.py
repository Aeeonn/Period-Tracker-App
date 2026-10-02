#!/usr/bin/env python3
"""Mechanical consistency checks for the planning documents (docs/plan, docs/adr).

Usage:  python3 docs/plan/tools/check_plan.py <repo-root>

Reads Markdown planning documents only. It executes no project code, needs no
dependencies beyond the Python 3 standard library, makes no network calls and
writes nothing. Exit code 0 = all checks passed, 1 = at least one failure.

Stage C checks (C1-C13) are kept. Stage E adds X1-X12 for the Stage D findings
(see docs/plan/consistency-check.md for the plain-language list).
"""
import collections
import fnmatch
import glob
import os
import re
import sys

root = sys.argv[1] if len(sys.argv) > 1 else "."
P = os.path.join(root, "docs/plan")
fails, notes = [], []


def fail(m):
    fails.append(m)


def read(p):
    with open(p, encoding="utf-8") as fh:
        return fh.read()


def plan_files():
    return [p for p in glob.glob(os.path.join(root, "docs/plan/**/*.md"), recursive=True)] + \
        glob.glob(os.path.join(root, "docs/adr/*.md"))


def nonresearch(p):
    return "/research/" not in p


# ---------------------------------------------------------------- C1 feature matrix
mx = read(os.path.join(P, "feature-parity-matrix.md"))
feat = {}
for line in mx.splitlines():
    m = re.match(r"\| (F-\d{3}) \|", line)
    if not m:
        continue
    cells = [c.strip() for c in line.strip().strip("|").split("|")]
    fid = cells[0]
    if fid in feat:
        fail(f"duplicate feature row {fid}")
    if fid < "F-100":
        if len(cells) != 10:
            fail(f"{fid}: expected 10 cells, got {len(cells)}")
            continue
        dec, just, mos, ph = cells[6], cells[7], cells[8], cells[9]
        if not cells[3]:
            fail(f"{fid}: missing tier")
        if not cells[5]:
            fail(f"{fid}: missing inputs/outputs")
    else:
        if len(cells) != 9:
            fail(f"{fid}: expected 9 cells, got {len(cells)}")
            continue
        dec, just, mos, ph = cells[5], cells[6], cells[7], cells[8]
        if not re.match(r"\d/\d/\d", cells[3]):
            fail(f"{fid}: missing V/E/P score")
    d = re.sub(r"\*|\(.*?\)", "", dec).strip()
    if not just:
        fail(f"{fid}: missing justification")
    feat[fid] = dict(dec=d, mos=mos, phase=ph, raw=dec)
flo_ids = [f for f in feat if f < "F-100"]
by_dec = collections.Counter(feat[f]["dec"] for f in flo_ids)
notes.append(f"matrix: {len(flo_ids)} Flo groups, {len(feat) - len(flo_ids)} Beyond-Flo; Flo decisions {dict(by_dec)}")
allowed = {"Replicate", "Adapt", "Replace", "Not applicable", "Not feasible on iOS web"}
for f in flo_ids:
    if feat[f]["dec"] not in allowed:
        fail(f"{f}: decision '{feat[f]['dec']}' not allowed")
for f in feat:
    if f >= "F-100" and feat[f]["dec"] not in {"Add", "Backlog", "Reject"}:
        fail(f"{f}: Beyond decision '{feat[f]['dec']}'")
for need in ["Checker", "Score", "Timeline", "Relief Options"]:
    if need not in mx:
        fail(f"perimenopause lead '{need}' missing")

# ---------------------------------------------------------------- C2 approval list covers deviations and Adds
plan = read(os.path.join(P, "plan.md"))
sec18 = plan.split("## 18.")[1]
for f in flo_ids:
    if feat[f]["dec"] != "Replicate" and f not in sec18:
        fail(f"approval list missing deviation {f} ({feat[f]['dec']})")
for f in feat:
    if f >= "F-100" and feat[f]["dec"] == "Add" and f not in sec18:
        fail(f"approval list missing Add {f}")
for dec in ["Adapt", "Replace", "Not applicable", "Not feasible on iOS web"]:
    m = re.search(rf"^\| {re.escape(dec)} \| (.*?) \|\s*$", sec18, re.M)
    if not m:
        fail(f"AP-02 row for {dec} missing")
        continue
    listed = set(re.findall(r"F-\d{3}", m.group(1)))
    expect = {f for f in flo_ids if feat[f]["dec"] == dec}
    if listed != expect:
        fail(f"AP-02 {dec} mismatch: missing {sorted(expect - listed)} extra {sorted(listed - expect)}")
s5 = plan.split("## 5.")[1].split("## 6.")[0]
for dec in ["Replicate", "Adapt", "Replace", "Not applicable"]:
    m = re.search(rf"^\| {dec} \| (\d+)", s5, re.M)
    if not m or int(m.group(1)) != by_dec[dec]:
        fail(f"plan §5 count for {dec} wrong (matrix {by_dec[dec]})")
m = re.search(r"^\| Not feasible on iOS web \| (\d+)", s5, re.M)
if not m or int(m.group(1)) != by_dec["Not feasible on iOS web"]:
    fail("plan §5 count for Not feasible wrong")

# ---------------------------------------------------------------- C3 plan.md has 18 sections in order
heads = re.findall(r"^## (\d+)\. (.+)$", plan, re.M)
if [int(h[0]) for h in heads] != list(range(1, 19)):
    fail(f"plan.md sections not 1..18: {[h[0] for h in heads]}")
notes.append(f"plan.md sections: {len(heads)}")

# ---------------------------------------------------------------- C4 backlog parse and fields
bl = read(os.path.join(P, "backlog-import.md"))
items, order = {}, []
items_txt = bl.split("## Items", 1)[1].split("## Waves", 1)[0]
for blk in re.split(r"^### ", items_txt, flags=re.M)[1:]:
    if not re.match(r"^[a-z0-9-]+\n", blk):
        continue
    iid = blk.split("\n", 1)[0].strip()
    items[iid] = dict(re.findall(r"^- ([a-z-]+): (.*)$", blk, re.M))
    order.append(iid)
req = ["title", "kind", "type", "phase", "wave", "risk", "features", "blocked-by", "owns", "tests", "route", "labels", "brief"]
for i, f in items.items():
    for r in req:
        if r not in f or not f[r].strip():
            fail(f"{i}: missing field {r}")
    if f["kind"] == "ship" and f["owns"] == "—":
        fail(f"{i}: ship task without owned files")
    if f["kind"] != "ship" and f["owns"] != "—":
        fail(f"{i}: non-ship item owns repo files")
    if f["kind"] == "ship" and f["risk"] == "high" and f"{i}-verify" not in items:
        fail(f"{i}: high-risk ship task lacks {i}-verify")
kinds = collections.Counter(v["kind"] for v in items.values())
notes.append(f"backlog items: {len(items)} ({dict(kinds)})")
deps = {i: [] if f["blocked-by"] == "—" else [d.strip() for d in f["blocked-by"].split(",")] for i, f in items.items()}
external = {"flo-plan-approval"}
for i, ds in deps.items():
    for d in ds:
        if d not in items and d not in external:
            fail(f"{i}: unknown dependency {d}")
        if d in items and order.index(d) > order.index(i):
            fail(f"{i}: dependency {d} appears later (import order not topological)")
for i, ds in deps.items():
    for d in ds:
        if d in items and items[d]["kind"] == "ship" and items[d]["risk"] == "high" and i != f"{d}-verify":
            fail(f"{i} depends on high-risk {d} directly instead of {d}-verify")

# ---------------------------------------------------------------- C5 dependency graph acyclic, phases chained
color = {}


def dfs(n, stack):
    color[n] = 1
    for d in deps.get(n, []):
        if d not in items:
            continue
        if color.get(d) == 1:
            fail(f"cycle: {' -> '.join(stack + [d])}")
        elif not color.get(d):
            dfs(d, stack + [d])
    color[n] = 2


for n in items:
    if not color.get(n):
        dfs(n, [n])

_anc = {}


def ancestors(n):
    if n in _anc:
        return _anc[n]
    seen = set()
    for d in deps.get(n, []):
        seen.add(d)
        if d in items:
            seen |= ancestors(d)
    _anc[n] = seen
    return seen


for ph in ["P0", "P1", "P2"]:
    gate = f"gate-phase-{ph[1]}"
    anc = ancestors(gate)
    for i, f in items.items():
        if f["phase"] == ph and i != gate and i not in anc:
            fail(f"{i} not upstream of {gate}")
    if ph != "P0":
        prev = f"gate-phase-{int(ph[1]) - 1}"
        for i, f in items.items():
            if f["phase"] == ph and prev not in ancestors(i):
                fail(f"{i} does not depend on {prev}")
for i, f in items.items():
    if f["phase"] == "P0" and "flo-plan-approval" not in ancestors(i) and i != "flo-plan-approval":
        fail(f"{i} does not depend on flo-plan-approval")


# ---------------------------------------------------------------- C6 wave rules
def globs(s):
    return [] if s == "—" else [g.strip().strip("`") for g in s.split(",")]


def overlap(a, b):
    for x in a:
        for y in b:
            if x == y or fnmatch.fnmatch(x, y) or fnmatch.fnmatch(y, x):
                return True
            xs, ys = x.rstrip("*").rstrip("/"), y.rstrip("*").rstrip("/")
            if x.endswith("**") and (y.startswith(xs + "/") or ys == xs):
                return True
            if y.endswith("**") and (x.startswith(ys + "/") or xs == ys):
                return True
    return False


waves = collections.defaultdict(list)
for i, f in items.items():
    waves[f["wave"]].append(i)
wave_index = {}
for w in waves:
    ph, n = w.split("-W")
    wave_index[w] = (ph, int(n))
for w, ms in waves.items():
    workers = [m for m in ms if items[m]["kind"] != "gate"]
    if len(workers) > 3:
        fail(f"{w}: {len(workers)} workers > 3")
    for a in range(len(workers)):
        for b in range(a + 1, len(workers)):
            if overlap(globs(items[workers[a]]["owns"]), globs(items[workers[b]]["owns"])):
                fail(f"{w}: file overlap {workers[a]} / {workers[b]}")
    for m_ in ms:
        for d in deps[m_]:
            if d in items and items[d]["wave"] == w:
                fail(f"{w}: {m_} depends on same-wave {d}")
            if d in items and wave_index[items[d]["wave"]][0] == wave_index[w][0] and wave_index[items[d]["wave"]][1] > wave_index[w][1]:
                fail(f"{m_} scheduled before its dependency {d}")
notes.append(f"waves: {len(waves)}; max workers per wave {max(len([m for m in ms if items[m]['kind'] != 'gate']) for ms in waves.values())}")
# waves table matches item fields
wt = bl.split("## Waves", 1)[1].split("## Import script", 1)[0]
table = {}
for w, ms in re.findall(r"^\| (P\d-W\d+) \| (.*?) \|$", wt, re.M):
    table[w] = [x.strip() for x in ms.split(",")]
if {w: sorted(v) for w, v in table.items()} != {w: sorted(v) for w, v in waves.items()}:
    fail("waves table does not match item wave fields")

# ---------------------------------------------------------------- C7 briefs
br = read(os.path.join(P, "task-briefs.md"))
bids = re.findall(r"^### ([a-z0-9-]+)$", br, re.M)
if set(bids) != set(items):
    fail(f"brief/backlog id mismatch: {set(bids) ^ set(items)}")
brief_blk = {}
for blk in re.split(r"^### ", br, flags=re.M)[1:]:
    i = blk.split("\n", 1)[0].strip()
    blk = re.split(r"\n## P\d\n", blk)[0]
    brief_blk[i] = blk
    if i not in items:
        continue
    if "Given " not in blk or " When " not in blk or " Then " not in blk:
        fail(f"brief {i}: no Given/When/Then")
    if items[i]["kind"] == "ship" and "**Commands:**" not in blk:
        fail(f"brief {i}: no commands")
    if "**Route:**" not in blk:
        fail(f"brief {i}: no route")
    hdr = re.search(r"· wave (P\d-W\d+) ·", blk)
    if not hdr or hdr.group(1) != items[i]["wave"]:
        fail(f"brief {i}: header wave differs from backlog")
    dm = re.search(r"^- \*\*Depends on:\*\* (.*)$", blk, re.M)
    if not dm or [x.strip() for x in dm.group(1).split(",")] != (deps[i] or ["—"]):
        fail(f"brief {i}: Depends on differs from backlog blocked-by")
    if items[i]["kind"] == "ship":
        om = re.search(r"^- \*\*Owns:\*\* (.*)$", blk, re.M)
        if not om or om.group(1).strip() != items[i]["owns"]:
            fail(f"brief {i}: Owns differs from backlog")

# ---------------------------------------------------------------- C8 feature coverage
impl_feats = collections.defaultdict(set)
test_feats = collections.defaultdict(set)
for i, f in items.items():
    fs = [] if f["features"] == "—" else [x.strip() for x in f["features"].split(",")]
    for x in fs:
        if x not in feat:
            fail(f"{i}: unknown feature {x}")
        if f["kind"] == "ship":
            impl_feats[x].add(i)
        if f["tests"] != "—":
            test_feats[x].add(i)
for fid, v in feat.items():
    ph = v["phase"]
    if v["dec"] in {"Not applicable", "Backlog", "Reject"} or v["mos"].startswith("Won't") or (v["dec"] == "Not feasible on iOS web" and ph in ("—", "")):
        continue
    phases = re.findall(r"P\d", ph)
    if not phases:
        fail(f"{fid}: no phase")
        continue
    if any(p in ("P0", "P1", "P2") for p in phases):
        if not impl_feats[fid]:
            fail(f"{fid} ({ph}) has no implementing task")
        if not test_feats[fid]:
            fail(f"{fid} ({ph}) has no task with tests")
notes.append(f"features with P0–P2 implementing tasks: {sum(1 for fid in feat if impl_feats[fid])}")

# ---------------------------------------------------------------- C9 test IDs exist in catalogue
ts = read(os.path.join(P, "test-strategy.md"))
cat = set(re.findall(r"^\| (T-[A-Z0-9]+-\d+(?:…\d+)?)", ts, re.M))
known = set()
for c in cat:
    m = re.match(r"(T-[A-Z0-9]+-)(\d+)…(\d+)", c)
    if m:
        for k in range(int(m.group(2)), int(m.group(3)) + 1):
            known.add(f"{m.group(1)}{k:02d}")
    else:
        known.add(c)
assigned = collections.defaultdict(set)
for i, f in items.items():
    for t in ([] if f["tests"] == "—" else [x.strip() for x in f["tests"].split(",")]):
        if t not in known:
            fail(f"{i}: test id {t} not in catalogue")
        assigned[t].add(i)

# ---------------------------------------------------------------- C10 consent rules
sp = read(os.path.join(P, "security-privacy.md"))
crs = re.findall(r"^\| (CR-\d+) \| (.*?) \| (.*?) \| (T-CON-\d+)[^|]*\|", sp, re.M)
if len(crs) != 21:
    fail(f"expected 21 consent rules, parsed {len(crs)}")
for cr, rule, enf, t in crs:
    if not enf.strip():
        fail(f"{cr}: no enforcement")
    if t not in known:
        fail(f"{cr}: test {t} not in catalogue")
    if not assigned.get(t):
        fail(f"{cr}: {t} not assigned to any P0–P2 task")

# ---------------------------------------------------------------- C11 Section 3/4 enforcement matrix
em = re.findall(r"^\| (S[34]-[0-9a-z]+) \| (.*?) \| (.*?) \| (.*?) \|", ts, re.M)
ids = [e[0] for e in em]
need = [f"S3-0{k}" for k in range(1, 10)] + ["S4-1", "S4-2", "S4-3", "S4-4a", "S4-4b", "S4-4c", "S4-4d", "S4-4e", "S4-5",
                                             "S4-6a", "S4-6b", "S4-6c", "S4-7a", "S4-7b", "S4-7c", "S4-8", "S4-9", "S4-10"]
for n in need:
    if n not in ids:
        fail(f"enforcement matrix missing {n}")
for e in em:
    if not e[2].strip() or not e[3].strip():
        fail(f"{e[0]}: missing enforcement or check")
notes.append(f"enforcement rows: {len(em)}; consent rules: {len(crs)}")


# ---------------------------------------------------------------- C12 links and anchors
def anchor(h):
    h = h.strip().lower()
    h = re.sub(r"[^\w\- ]", "", h)
    return h.replace(" ", "-")


anchors = {}
mdfiles = plan_files()
for p in mdfiles:
    txt_nocode = re.sub(r"```.*?```", "", read(p), flags=re.S)
    anchors[os.path.abspath(p)] = {anchor(re.sub(r"`", "", h)) for h in re.findall(r"^#+ (.+)$", txt_nocode, re.M)}
nlinks = 0
for p in mdfiles:
    txt = re.sub(r"```.*?```", "", read(p), flags=re.S)
    for tgt in re.findall(r"\]\(([^)\s]+)\)", txt):
        if tgt.startswith("http"):
            continue
        nlinks += 1
        path, _, frag = tgt.partition("#")
        dest = os.path.abspath(os.path.join(os.path.dirname(p), path)) if path else os.path.abspath(p)
        if not os.path.exists(dest):
            fail(f"{os.path.relpath(p, root)}: broken link {tgt}")
            continue
        if frag and dest.endswith(".md") and frag not in anchors.get(dest, set()):
            fail(f"{os.path.relpath(p, root)}: missing anchor {tgt}")
notes.append(f"relative links checked: {nlinks}")

# ---------------------------------------------------------------- C13 no unqualified "safe day"
for p in mdfiles:
    if not nonresearch(p):
        continue
    for ln, line in enumerate(read(p).splitlines(), 1):
        if re.search(r"\bsafe days?\b", line, re.I) and not re.search(r"no|never|not|\"|'|ban|lint|reject|“|”|label", line, re.I):
            fail(f"{os.path.relpath(p, root)}:{ln}: unqualified 'safe day'")

# ================================================================ Stage E additions
# ---------------------------------------------------------------- X1 acceptance-file ownership and ancestry
# Every repository path named in a brief's acceptance criteria must be owned by the task itself or by
# one of its (transitive) dependencies, so the owning task or an earlier landed task produces it.
PATH_RE = re.compile(r"(?<![\w./-])((?:src|tools|tests|relay|relay-spike|public|probe|docs)/[\w./*\-]+[\w*]|AGENTS\.md|package\.json|tsconfig\.json|index\.html)")
PREEXISTING = ["docs/plan/**", "docs/adr/README.md"]
n_paths = 0
for i, blk in brief_blk.items():
    if i not in items:
        continue
    acc = re.search(r"^- \*\*Acceptance \(Given/When/Then\):\*\*\n((?:  - .*\n?)+)", blk, re.M)
    if not acc:
        continue
    scope = globs(items[i]["owns"])
    for a in ancestors(i):
        if a in items:
            scope += globs(items[a]["owns"])
    for pth in PATH_RE.findall(acc.group(1)):
        pth = pth.rstrip(".")
        n_paths += 1
        if overlap([pth], PREEXISTING):
            continue
        if not overlap([pth], scope) and not any(g.startswith(pth.rstrip("/") + "/") for g in scope):
            fail(f"X1 {i}: acceptance path {pth} is not owned by the task or any ancestor")
notes.append(f"X1 acceptance paths checked: {n_paths}")

# ---------------------------------------------------------------- X2 no owned-path overlap between dependency-unordered tasks
ship = [i for i in items if items[i]["kind"] == "ship"]
for a in range(len(ship)):
    for b in range(a + 1, len(ship)):
        x, y = ship[a], ship[b]
        if x in ancestors(y) or y in ancestors(x):
            continue
        if overlap(globs(items[x]["owns"]), globs(items[y]["owns"])):
            fail(f"X2 unordered tasks share owned paths: {x} / {y}")

# ---------------------------------------------------------------- X3 test assignment
LATER_PHASE_TESTS = {"T-ENG-02", "T-ENG-05"}
for t in sorted(known):
    if t in LATER_PHASE_TESTS:
        row = re.search(rf"^\| {t} \|(.*)$", ts, re.M)
        if not row or not re.search(r"\(P[3-7]", row.group(1)):
            fail(f"X3 later-phase test {t} must name its phase in the catalogue row")
        continue
    if not assigned.get(t):
        fail(f"X3 catalogue test {t} is assigned to no P0–P2 backlog item")
notes.append(f"X3 catalogue tests: {len(known)}; later-phase only: {sorted(LATER_PHASE_TESTS)}")

# ---------------------------------------------------------------- X4 feature/phase coverage (matrix vs roadmap)
rm = read(os.path.join(P, "roadmap.md"))


def expand(s):
    out = set()
    for a, b in re.findall(r"F-(\d{3})(?:[–-]F-(\d{3}))?", s):
        if b:
            out |= {f"F-{k:03d}" for k in range(int(a), int(b) + 1)}
        else:
            out.add(f"F-{a}")
    return out


road = {}
for ph, body in re.findall(r"^## (P\d) — .*?\n(.*?)(?=^## )", rm + "\n## END", re.M | re.S):
    fl = re.search(r"^- \*\*Features\.\*\*(.*?)(?=^- \*\*|\Z)", body, re.M | re.S)
    road[ph] = expand(fl.group(1)) if fl else set()
for fid, v in feat.items():
    if v["dec"] in {"Not applicable", "Backlog", "Reject"}:
        continue
    for ph in set(re.findall(r"P\d", v["phase"])):
        if "gate" in v["phase"]:
            continue
        if ph in road and fid not in road[ph]:
            fail(f"X4 {fid} has phase {ph} in the matrix but is missing from roadmap {ph} features")
for ph, fs in road.items():
    for fid in fs:
        if fid not in feat:
            fail(f"X4 roadmap {ph} lists unknown feature {fid}")
notes.append("X4 roadmap phases with feature lists: " + ", ".join(f"{k}={len(v)}" for k, v in sorted(road.items())))

# ---------------------------------------------------------------- X5 captain holds only when actionable
script = bl.split("## Import script", 1)[1]
held_at_import = re.findall(r"fm-captain-hold\.sh\" hold ([a-z0-9-]+)", script)
if held_at_import != ["p0-approvals"]:
    fail(f"X5 import script must hold only p0-approvals at import; holds {held_at_import}")
for i, f in items.items():
    if f["kind"] == "gate" and i != "p0-approvals" and f"hold {i}" not in bl.split("## Items", 1)[0]:
        fail(f"X5 gate {i} has no 'hold when actionable' command in the import procedure")
if "when" not in rm.split("## Phase gate procedure", 1)[1].lower():
    fail("X5 roadmap gate procedure does not state hold timing")

# ---------------------------------------------------------------- X6 each demo gate traces to a deploy item
for ph in ["0", "1", "2"]:
    g = f"gate-phase-{ph}"
    dep_items = [a for a in ancestors(g) if a in items and f"docs/deploy/p{ph}-demo.md" in items[a]["owns"]]
    if not dep_items:
        fail(f"X6 {g} has no ancestor deploy item producing docs/deploy/p{ph}-demo.md")
if not any("docs/deploy/p0-probe.md" in items[a]["owns"] for a in ancestors("p0-device-feasibility") if a in items):
    fail("X6 p0-device-feasibility has no ancestor that deploys the probe")
if not any("relay-spike/**" in items[a]["owns"] for a in ancestors("p0-device-feasibility") if a in items):
    fail("X6 p0-device-feasibility has no live push-test endpoint ancestor")
if re.search(r"[Dd]elete the spike deployment", br):
    fail("X6 a brief still deletes the spike before the push probe")

# ---------------------------------------------------------------- X7 forbidden or re-opened wording (Stage D findings)
FORBIDDEN = [
    (r"first mate running tests|first-mate-run|first mate runs? (?:the )?tests", "D-C01 first mate executing project tests"),
    (r"local-only vs private GitHub|or move to a private GitHub repo|Repository mode is confirmed", "D-M02 settled local-only re-opened"),
    (r"confirms ovulation", "D-M04 BBT over-claim"),
    (r"None at the encryption level, assuming the code is genuine and the verifier signs off", "D-C03 T1 residual"),
    (r"the first mate writes it", "D-M01 first mate writing verifier reports"),
    (r"short text code", "D-M07 impractical typed pairing fallback"),
]
for p in mdfiles:
    if not nonresearch(p) or p.endswith("stage-e-resolution.md"):
        continue
    txt = read(p)
    for pat, why in FORBIDDEN:
        for mm in re.finditer(pat, txt, re.I):
            ln = txt[:mm.start()].count("\n") + 1
            fail(f"X7 {os.path.relpath(p, root)}:{ln}: {why}: '{mm.group(0)}'")

# ---------------------------------------------------------------- X8 approval list integrity
ap_rows = re.findall(r"^\| (AP-\d{2}) \|", sec18, re.M)
dup = [a for a, c in collections.Counter(ap_rows).items() if c > 1]
if dup:
    fail(f"X8 duplicate approval rows {dup}")
apset = set(ap_rows) | {"AP-02", "AP-03"}
expected = {f"AP-{k:02d}" for k in range(1, 30)}
if apset != expected:
    fail(f"X8 approval IDs differ from AP-01..AP-29: missing {sorted(expected - apset)} extra {sorted(apset - expected)}")
for p in mdfiles:
    if not nonresearch(p):
        continue
    for a in set(re.findall(r"AP-\d{2}", read(p))):
        if a not in expected:
            fail(f"X8 {os.path.relpath(p, root)} references unknown approval item {a}")
notes.append(f"X8 approval rows: {len(ap_rows)} (+AP-02/AP-03 grouped tables)")

# ---------------------------------------------------------------- X9 Stage E resolution record complete
rr_path = os.path.join(P, "stage-e-resolution.md")
if not os.path.exists(rr_path):
    fail("X9 docs/plan/stage-e-resolution.md missing")
else:
    rr = read(rr_path)
    for fid in [f"D-C0{k}" for k in range(1, 4)] + [f"D-M{k:02d}" for k in range(1, 15)]:
        row = re.search(rf"^\| {fid} \|(.*)\|\s*$", rr, re.M)
        if not row:
            fail(f"X9 resolution record lacks a row for {fid}")
            continue
        cells = [c.strip() for c in row.group(1).split("|")]
        if len(cells) < 5 or any(not c for c in cells[:5]):
            fail(f"X9 {fid} row needs files, change, check, residual and status")

# ---------------------------------------------------------------- X10 summary counts match the backlog
s15 = plan.split("## 15.")[1].split("## 16.")[0]
m = re.search(r"\*\*(\d+) items\*\*.*?(\d+) ship tasks[^,]*, (\d+) scout .*?tasks and (\d+) gates", s15, re.S)
if not m or (int(m.group(1)), int(m.group(2)), int(m.group(3)), int(m.group(4))) != (len(items), kinds["ship"], kinds["scout"], kinds["gate"]):
    fail(f"X10 plan.md §15 counts differ from backlog ({len(items)}, {dict(kinds)})")
hb = bl.split("## Items", 1)[0]
for label, val in [("items in total", len(items)), ("ship tasks", kinds["ship"]), ("scout tasks", kinds["scout"]), ("gates", kinds["gate"])]:
    if not re.search(rf"\*\*{val}\*\* {label}", hb):
        fail(f"X10 backlog-import header count for '{label}' is not {val}")

# ---------------------------------------------------------------- X11 suppression states all map to a chance category
al = read(os.path.join(P, "algorithms-spec.md"))
a4 = al.split("## A4.", 1)[1].split("## A5.", 1)[0]
a5 = al.split("## A5.", 1)[1].split("## A6.", 1)[0]
reasons = re.findall(r"Suppressed\{reason\s*=\s*([a-z_]+)\}", a4)
if len(reasons) < 5:
    fail(f"X11 A4 lists {len(reasons)} named suppression reasons (expected ≥5)")
for r in reasons:
    row = re.search(rf"^\| `{r}` \| ([A-Z_]+) \|", a5, re.M)
    if not row:
        fail(f"X11 suppression reason {r} has no chance category row in A5")
    elif row.group(1) in {"ZERO", "NONE", "SAFE"}:
        fail(f"X11 suppression reason {r} maps to forbidden category {row.group(1)}")

# ---------------------------------------------------------------- X12 every P1 warning rule has a hand vector
p1_rules = set()
mm = re.search(r"### p1-warnings-v1\n.*?\*\*Goal:\*\*(.*?)\n", br, re.S)
if mm:
    for a, b in re.findall(r"W-(\d{2})(?:\.\.W-(\d{2}))?", mm.group(1)):
        p1_rules |= {f"W-{k:02d}" for k in range(int(a), int(b or a) + 1)}
a11 = al.split("## A11.", 1)[1].split("## A12.", 1)[0]
vec_rows = re.findall(r"^\| TV-W\w+ \|.*?\|(.*?)\|\s*$", a11, re.M)
covered = set()
for r in vec_rows:
    covered |= set(re.findall(r"W-\d{2}", r))
for r in sorted(p1_rules):
    if r not in covered:
        fail(f"X12 P1 warning rule {r} has no TV-W vector")
notes.append(f"X12 P1 warning rules {sorted(p1_rules)}; vectors cover {sorted(covered)}")

print("NOTES")
for n in notes:
    print(" -", n)
print("FAILURES" if fails else "ALL CHECKS PASSED", len(fails))
for f in fails:
    print(" -", f)
sys.exit(1 if fails else 0)
