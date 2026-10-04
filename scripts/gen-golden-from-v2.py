#!/usr/bin/env python3
"""Erzeugt Golden-Fixtures aus der laufenden v2-Single-File-App (Referenzimplementierung).

Aufruf: python3 scripts/gen-golden-from-v2.py /pfad/zu/v2/index.html
Schreibt: packages/engine/test/golden/v2-scenarios.json

Die Fixtures frieren das v2-Verhalten ein. Die TypeScript-Engine muss sie reproduzieren (Toleranz 1e-6),
bevor sie erweitert wird (Dial-Solver, Phase 3).
"""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

V2 = sys.argv[1] if len(sys.argv) > 1 else "/home/claude/index.html"
OUT = Path(__file__).resolve().parent.parent / "packages/engine/test/golden/v2-scenarios.json"

ALL_DAYS = {d: True for d in ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]}
BASE = dict(weightKg=95, training=True, snack=True, taverna=False, tavernaMain="lavraki", factorMode="auto",
            mgPerSlot=150, tdee=None, unavailable={}, activeDays=ALL_DAYS)

def sc(name, **over):
    s = json.loads(json.dumps(BASE))
    s.update(over)
    return {"name": name, "state": s}

SCENARIOS = [
    sc("default-95kg"),
    sc("weight-65", weightKg=65),
    sc("weight-115", weightKg=115),
    sc("training-off", training=False),
    sc("snack-off", snack=False),
    sc("taverna-lavraki", taverna=True),
    sc("taverna-lamm", taverna=True, tavernaMain="lamm"),
    sc("fixed-mode", factorMode="fixed"),
    sc("mg-125", mgPerSlot=125),
    sc("tdee-3500", tdee=3500),
    sc("inventory-A", unavailable={"lavraki": True, "tsipoura": True, "anari": True, "kolokasi": True}),
    sc("inventory-B-almost-all-missing", unavailable={k: True for k in ["lavraki", "tsipoura", "lamm-keule", "ziege", "anari", "schafjoghurt", "ei", "kartoffel", "kolokasi"]}),
    sc("shop-workdays-only", activeDays={**ALL_DAYS, "sat": False, "sun": False}),
]

EXTRACT = """() => {
  const A = window.__app, p = A.getPlan(), sh = A.computeShopping();
  const r6 = (x) => (typeof x === 'number' ? Math.round(x * 1e6) / 1e6 : x);
  const n6 = (n) => ({ kcal: r6(n.kcal), p: r6(n.p), f: r6(n.f), c: r6(n.c), fib: r6(n.fib), grams: r6(n.grams) });
  const calc = (c) => c ? { factor: r6(c.factor), grams: r6(c.grams), n: n6(Object.assign({grams: c.grams}, c.n)),
      lines: c.lines.map(l => ({ baseId: l.baseId, id: l.id, grams: r6(l.grams), from: l.from, ratio: l.ratio == null ? null : r6(l.ratio), missing: l.missing })) } : null;
  const days = p.days.map(d => ({
    weekday: d.weekday, dayType: d.dayType, restDerived: d.restDerived, assumption: d.assumption,
    factor: r6(d.factor), limited: d.limited, autoRaw: r6(d.autoRaw), baseProtein: r6(d.baseProtein), snackProtein: r6(d.snackProtein),
    totals: { father: n6(d.totals.father), mother: n6(d.totals.mother), child: n6(d.totals.child) },
    eval: { pk: r6(d.eval.pk), ck: r6(d.eval.ck), fk: r6(d.eval.fk), protein: d.eval.protein, carbs: d.eval.carbs, fat: d.eval.fat, fiber: d.eval.fiber,
            balance: d.eval.balance == null ? null : r6(d.eval.balance), balanceStatus: d.eval.balanceStatus || null },
    workouts: d.workouts.map(w => w.type),
    suppTimes: d.suppSlots.map(s => s.slot + '@' + s.targetTime),
    meals: d.mealViews.map(mv => ({ slot: mv.slot, mealId: mv.mealId, time: mv.time,
      rows: mv.rows.map(r => ({ componentId: r.comp.id, pf: r.pf, father: calc(r.calc.father), mother: calc(r.calc.mother), child: calc(r.calc.child) })) }))
  }));
  const shop = sh.items.map(i => ({ id: i.id, grams: r6(i.grams), buy: i.buy, cat: i.cat, missing: i.missing,
      perDay: Object.fromEntries(Object.entries(i.perDay).map(([k, v]) => [k, r6(v)])) })).sort((a, b) => a.id.localeCompare(b.id));
  const audit = document.querySelector('#h-audit');
  const findings = audit ? Array.from(audit.parentElement.querySelectorAll('.grid.gap-2.mb-3 > .banner')).map(b => ({ kind: (b.className.match(/banner-(\\w+)/) || [])[1], text: b.textContent.trim() })) : [];
  return { plan: { target: r6(p.target), fixedFactor: r6(p.fixedFactor), avgFactor: r6(p.avgFactor), minFactor: r6(p.minFactor), maxFactor: r6(p.maxFactor), avgKcal: r6(p.avgKcal), avgP: r6(p.avgP) },
           days, shop, findings };
}"""

def main():
    out = {"source": "v2 single-file app (index.html)", "scenarios": []}
    with sync_playwright() as pw:
        b = pw.chromium.launch(args=["--no-sandbox"])
        ctx = b.new_context(viewport={"width": 1280, "height": 900})
        ctx.route("**/*", lambda r: r.abort() if r.request.url.startswith("http") else r.continue_())
        pg = ctx.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(f"file://{V2}")
        pg.wait_for_timeout(800)
        for s in SCENARIOS:
            pg.evaluate("(patch) => { const st = window.__app.state(); Object.keys(patch).forEach(k => { st[k] = patch[k]; }); window.__app.rerender(); }", s["state"])
            res = pg.evaluate(EXTRACT)
            out["scenarios"].append({"name": s["name"], "state": s["state"], **res})
            print(f"{s['name']:34} protein-days={[round(d['totals']['father']['p'], 1) for d in res['days']][:3]}… findings={len(res['findings'])} shop={len(res['shop'])}")
        if errors:
            print("PAGEERRORS", errors)
            sys.exit(1)
        b.close()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print("geschrieben:", OUT, OUT.stat().st_size, "Bytes")

main()
