import { useState, useEffect, useRef } from "react";

const STORE_KEY = "nutriai_app";
function saveData(d) { try { localStorage.setItem(STORE_KEY, JSON.stringify(d)); } catch (_) {} }
function loadData() { try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch (_) { return null; } }

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function calcAge(dob) {
  const b = new Date(dob), now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age--;
  return age;
}

function calcPlan(p) {
  // Mifflin-St Jeor BMR
  const bmr = p.gender === "male"
    ? 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + 5
    : 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age - 161;
  const tdee = Math.round(bmr * p.actMult);
  const totalDeficit = (p.weightKg - p.targetKg) * 7700;
  const dailyDeficit = Math.round(totalDeficit / (p.months * 30));
  const recommended = Math.max(1200, Math.round(tdee - dailyDeficit));
  const gentle     = Math.max(1200, Math.round(tdee - dailyDeficit * 0.6));
  const aggressive = Math.max(1200, Math.round(tdee - dailyDeficit * 1.4));
  const bmi = Math.round((p.weightKg / Math.pow(p.heightCm / 100, 2)) * 10) / 10;
  const protein = Math.round(recommended * 0.30 / 4);
  const carbs   = Math.round(recommended * 0.40 / 4);
  const fat     = Math.round(recommended * 0.30 / 9);
  const deadline = new Date();
  deadline.setMonth(deadline.getMonth() + p.months);
  return { bmr: Math.round(bmr), tdee, dailyDeficit, recommended, gentle, aggressive, bmi, protein, carbs, fat, deadline: deadline.toISOString() };
}

// Steps → calories burned: ~0.04 kcal per step (average 70kg person)
function stepCalsBurned(steps) { return Math.round(steps * 0.04); }
// Water goal: 8 glasses = 2000ml
const WATER_GOAL_ML = 2000;
const GLASS_ML = 250;

const ACTIVITIES = [
  { label: "Sedentary",         sub: "Desk job, little exercise",      mult: 1.2   },
  { label: "Lightly active",    sub: "Light exercise 1–3 days/week",   mult: 1.375 },
  { label: "Moderately active", sub: "Moderate exercise 3–5 days/week",mult: 1.55  },
  { label: "Very active",       sub: "Hard exercise 6–7 days/week",    mult: 1.725 },
  { label: "Athlete",           sub: "Physical job or twice/day",      mult: 1.9   },
];

const TIMELINES = [
  { label: "1 month",   sub: "Aggressive — strong deficit",   months: 1, icon: "⚡" },
  { label: "3 months",  sub: "Recommended — healthy pace",    months: 3, icon: "🎯" },
  { label: "6 months",  sub: "Gradual — easy to maintain",    months: 6, icon: "🌱" },
];

const MEAL_COLORS = { breakfast: "#f59e0b", lunch: "#10b981", dinner: "#8b5cf6", snack: "#f97316" };

// ─── tiny UI primitives ───────────────────────────────────────
function Ring({ pct = 0, size = 120, strokeW = 10, color = "#f97316", bg = "rgba(255,255,255,0.08)", children }) {
  const r = (size - strokeW) / 2;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - Math.min(1, pct / 100));
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)", display: "block" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={bg} strokeWidth={strokeW} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={strokeW}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={off}
          style={{ transition: "stroke-dashoffset 0.9s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        {children}
      </div>
    </div>
  );
}

function ProgressBar({ pct, color = "#f97316", h = 7 }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 99, overflow: "hidden", height: h }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: "100%", background: color, borderRadius: 99, transition: "width 0.8s ease" }} />
    </div>
  );
}

function Input({ label, ...props }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {label && <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 7 }}>{label}</div>}
      <input {...props} style={{
        width: "100%", padding: "13px 16px", borderRadius: 12,
        border: "1.5px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.06)", color: "#fff",
        fontSize: 15, outline: "none", boxSizing: "border-box",
        fontFamily: "inherit",
        ...(props.style || {})
      }} />
    </div>
  );
}

function PrimaryBtn({ children, onClick, style = {} }) {
  return (
    <button onClick={onClick} style={{
      width: "100%", padding: "15px 20px", borderRadius: 14, border: "none",
      background: "linear-gradient(135deg, #f97316, #ea580c)",
      color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer",
      boxShadow: "0 4px 20px rgba(249,115,22,0.4)", letterSpacing: "0.02em",
      ...style
    }}>{children}</button>
  );
}

function GhostBtn({ children, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: "100%", padding: "12px", background: "none", border: "none",
      color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer", marginTop: 6
    }}>{children}</button>
  );
}

function Chip({ active, onClick, children, style = {} }) {
  return (
    <button onClick={onClick} style={{
      padding: "10px 16px", borderRadius: 10, border: "none", cursor: "pointer",
      background: active ? "rgba(249,115,22,0.18)" : "rgba(255,255,255,0.06)",
      borderLeft: `3px solid ${active ? "#f97316" : "transparent"}`,
      color: "#fff", fontSize: 14, textAlign: "left", width: "100%",
      transition: "all 0.15s", ...style
    }}>{children}</button>
  );
}

function Seg({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} style={{
          flex: 1, padding: "10px 8px", borderRadius: 10, border: "none", cursor: "pointer",
          background: value === o.value ? "rgba(249,115,22,0.2)" : "rgba(255,255,255,0.06)",
          color: value === o.value ? "#f97316" : "rgba(255,255,255,0.5)",
          fontSize: 13, fontWeight: 600, transition: "all 0.15s",
          outline: value === o.value ? "1.5px solid #f97316" : "1.5px solid transparent"
        }}>{o.label}</button>
      ))}
    </div>
  );
}

function StepShell({ step, total, title, sub, children, onNext, onBack, nextLabel = "Continue →" }) {
  const pct = (step / total) * 100;
  return (
    <div style={{ minHeight: "100vh", background: "#0f0f11", display: "flex", flexDirection: "column", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 460, margin: "0 auto", width: "100%", flex: 1, display: "flex", flexDirection: "column", padding: "0 22px 36px" }}>
        {/* Progress */}
        <div style={{ padding: "18px 0 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Step {step} of {total}</span>
            <span style={{ fontSize: 11, color: "#f97316", fontWeight: 600 }}>{Math.round(pct)}%</span>
          </div>
          <div style={{ height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 99, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg,#f97316,#ea580c)", borderRadius: 99, transition: "width 0.5s ease" }} />
          </div>
        </div>
        {/* Header */}
        <div style={{ padding: "16px 0 22px" }}>
          <div style={{ fontSize: 11, color: "#f97316", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Step {step}</div>
          <h2 style={{ fontSize: 26, fontWeight: 800, color: "#fff", margin: "0 0 6px", letterSpacing: "-0.5px", lineHeight: 1.2 }}>{title}</h2>
          {sub && <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", margin: 0, lineHeight: 1.5 }}>{sub}</p>}
        </div>
        {/* Body */}
        <div style={{ flex: 1 }}>{children}</div>
        {/* Nav */}
        <div style={{ paddingTop: 20 }}>
          <PrimaryBtn onClick={onNext}>{nextLabel}</PrimaryBtn>
          {onBack && <GhostBtn onClick={onBack}>← Back</GhostBtn>}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════
// ONBOARDING STEPS
// ════════════════════════════════════════════

function Step1({ data, set, onNext }) {
  const [err, setErr] = useState("");
  const go = () => { if (!data.name.trim()) { setErr("Please enter your name"); return; } setErr(""); onNext(); };
  return (
    <StepShell step={1} total={5} title="Let's meet you" sub="We'll personalise your plan around your profile" onNext={go}>
      <Input label="First name" placeholder="e.g. Sarah" value={data.name}
        onChange={e => { set("name", e.target.value); setErr(""); }} />
      {err && <div style={{ color: "#f87171", fontSize: 12, marginTop: -10, marginBottom: 12 }}>{err}</div>}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 9 }}>Gender</div>
        <Seg value={data.gender} onChange={v => set("gender", v)}
          options={[{ value: "female", label: "Female" }, { value: "male", label: "Male" }, { value: "other", label: "Other" }]} />
      </div>
    </StepShell>
  );
}

function Step2({ data, set, onNext, onBack }) {
  const [err, setErr] = useState("");
  const age = data.dob ? calcAge(data.dob) : null;
  const go = () => {
    if (!data.dob || !age || age < 10 || age > 110) { setErr("Please enter a valid date of birth"); return; }
    setErr(""); onNext();
  };
  return (
    <StepShell step={2} total={5} title="When were you born?" sub="Age changes your metabolic rate calculation" onNext={go} onBack={onBack}>
      <Input label="Date of birth" type="date" value={data.dob} max={todayStr()}
        onChange={e => { set("dob", e.target.value); setErr(""); }} />
      {err && <div style={{ color: "#f87171", fontSize: 12, marginTop: -10, marginBottom: 12 }}>{err}</div>}
      {age !== null && !err && (
        <div style={{ background: "rgba(249,115,22,0.1)", border: "1.5px solid rgba(249,115,22,0.25)", borderRadius: 14, padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, marginTop: 4 }}>
          <span style={{ fontSize: 28 }}>🎂</span>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{age} years old</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
              {new Date(data.dob).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
            </div>
          </div>
        </div>
      )}
    </StepShell>
  );
}

function Step3({ data, set, onNext, onBack }) {
  const [unit, setUnit] = useState("ft");
  const [ft, setFt] = useState("");
  const [inch, setInch] = useState("");
  const [cm, setCm] = useState("");
  const [err, setErr] = useState("");

  const fromFtIn = (f, i) => {
    const v = (parseFloat(f) || 0) * 30.48 + (parseFloat(i) || 0) * 2.54;
    if (v > 0) set("heightCm", Math.round(v));
  };

  const go = () => {
    if (!data.heightCm || data.heightCm < 100 || data.heightCm > 250) { setErr("Please enter a valid height"); return; }
    setErr(""); onNext();
  };

  const display = data.heightCm
    ? `${Math.floor(data.heightCm / 30.48)}ft ${Math.round((data.heightCm / 2.54) % 12)}in = ${data.heightCm} cm`
    : "";

  return (
    <StepShell step={3} total={5} title="How tall are you?" sub="Used to calculate your BMI and daily energy needs" onNext={go} onBack={onBack}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 9 }}>Unit</div>
        <Seg value={unit} onChange={v => { setUnit(v); setErr(""); }}
          options={[{ value: "ft", label: "ft & in" }, { value: "cm", label: "cm" }]} />
      </div>

      {unit === "ft" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Input label="Feet" type="number" min="3" max="8" placeholder="5" value={ft}
            onChange={e => { setFt(e.target.value); fromFtIn(e.target.value, inch); setErr(""); }} />
          <Input label="Inches" type="number" min="0" max="11" placeholder="1" value={inch}
            onChange={e => { setInch(e.target.value); fromFtIn(ft, e.target.value); setErr(""); }} />
        </div>
      ) : (
        <Input label="Centimetres" type="number" min="100" max="250" placeholder="155" value={cm}
          onChange={e => { setCm(e.target.value); const v = parseFloat(e.target.value); if (v > 0) set("heightCm", Math.round(v)); setErr(""); }} />
      )}

      {display && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: -8, marginBottom: 12 }}>{display}</div>}
      {err && <div style={{ color: "#f87171", fontSize: 12, marginBottom: 12 }}>{err}</div>}
    </StepShell>
  );
}

function Step4({ data, set, onNext, onBack }) {
  const [errs, setErrs] = useState({});
  const go = () => {
    const e = {};
    if (!data.weightKg || data.weightKg < 30) e.cw = "Enter current weight";
    if (!data.targetKg || data.targetKg < 30) e.tw = "Enter target weight";
    if (data.weightKg && data.targetKg && data.weightKg <= data.targetKg) e.tw = "Target must be lower than current for weight loss";
    if (Object.keys(e).length) { setErrs(e); return; }
    setErrs({}); onNext();
  };
  const diff = data.weightKg && data.targetKg && data.weightKg > data.targetKg
    ? (data.weightKg - data.targetKg).toFixed(1) : null;

  return (
    <StepShell step={4} total={5} title="Weight & goal" sub="We'll compute your exact daily calorie target" onNext={go} onBack={onBack}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <Input label="Current weight (kg)" type="number" min="30" max="300" step="0.1" placeholder="67"
            value={data.weightKg || ""}
            onChange={e => { set("weightKg", parseFloat(e.target.value) || ""); setErrs(p => ({ ...p, cw: "" })); }} />
          {errs.cw && <div style={{ color: "#f87171", fontSize: 11, marginTop: -12, marginBottom: 10 }}>{errs.cw}</div>}
        </div>
        <div>
          <Input label="Target weight (kg)" type="number" min="30" max="300" step="0.1" placeholder="55"
            value={data.targetKg || ""}
            onChange={e => { set("targetKg", parseFloat(e.target.value) || ""); setErrs(p => ({ ...p, tw: "" })); }} />
          {errs.tw && <div style={{ color: "#f87171", fontSize: 11, marginTop: -12, marginBottom: 10 }}>{errs.tw}</div>}
        </div>
      </div>

      {diff && (
        <div style={{ background: "rgba(16,185,129,0.1)", border: "1.5px solid rgba(16,185,129,0.25)", borderRadius: 12, padding: "12px 16px", fontSize: 14, color: "#6ee7b7", marginBottom: 16 }}>
          Goal: lose <strong style={{ color: "#34d399" }}>{diff} kg</strong> total
        </div>
      )}

      <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Timeline</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {TIMELINES.map(t => (
          <Chip key={t.months} active={data.months === t.months} onClick={() => set("months", t.months)}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 22 }}>{t.icon}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{t.label}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{t.sub}</div>
              </div>
              <div style={{ marginLeft: "auto", width: 18, height: 18, borderRadius: "50%",
                background: data.months === t.months ? "#f97316" : "transparent",
                border: data.months === t.months ? "none" : "1.5px solid rgba(255,255,255,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center" }}>
                {data.months === t.months && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff" }} />}
              </div>
            </div>
          </Chip>
        ))}
      </div>
    </StepShell>
  );
}

function Step5({ data, set, onNext, onBack }) {
  return (
    <StepShell step={5} total={5} title="How active are you?" sub="Determines your total daily energy expenditure (TDEE)" onNext={onNext} onBack={onBack} nextLabel="Calculate my plan ✨">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {ACTIVITIES.map(a => (
          <Chip key={a.mult} active={data.actMult === a.mult} onClick={() => { set("actMult", a.mult); set("actLabel", a.label); }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{a.label}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{a.sub}</div>
              </div>
              <div style={{ fontSize: 12, color: "#f97316", fontWeight: 700 }}>×{a.mult}</div>
            </div>
          </Chip>
        ))}
      </div>
    </StepShell>
  );
}

// ════════════════════════════════════════════
// RESULTS SCREEN
// ════════════════════════════════════════════
function Results({ profile, plan, onStart }) {
  const [chosen, setChosen] = useState("recommended");
  const goal = plan[chosen];
  const lossKg = (profile.weightKg - profile.targetKg).toFixed(1);
  const bmiLabel = plan.bmi < 18.5 ? "Underweight" : plan.bmi < 25 ? "Normal weight" : plan.bmi < 30 ? "Overweight" : "Obese";
  const bmiColor = plan.bmi < 18.5 ? "#60a5fa" : plan.bmi < 25 ? "#34d399" : plan.bmi < 30 ? "#fbbf24" : "#f87171";
  const ringPct = Math.round(goal / plan.tdee * 100);

  const milestones = [{ month: 0, label: "Start", weight: profile.weightKg, icon: "🚀" }];
  const perMonth = (profile.weightKg - profile.targetKg) / profile.months;
  for (let m = 1; m <= profile.months; m++) {
    const d = new Date(); d.setMonth(d.getMonth() + m);
    milestones.push({ month: m, label: d.toLocaleDateString("en-GB", { month: "short", year: "numeric" }), weight: (profile.weightKg - perMonth * m).toFixed(1), icon: m === profile.months ? "🏆" : "📍" });
  }

  const handleStart = () => {
    onStart({ ...profile, ...plan, goal, selectedPlan: chosen, startWeight: profile.weightKg, startDate: todayStr() });
  };

  return (
    <div style={{ background: "#0a0a0c", minHeight: "100vh", fontFamily: "'DM Sans', system-ui, sans-serif", color: "#fff" }}>
      <div style={{ maxWidth: 460, margin: "0 auto", padding: "0 20px 60px" }}>
        {/* Hero */}
        <div style={{ textAlign: "center", padding: "36px 0 24px" }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 10 }}>Your personalised plan</div>
          <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 6 }}>Hi, {profile.name}! 👋</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)" }}>Lose {lossKg} kg in {profile.months} month{profile.months > 1 ? "s" : ""}</div>
        </div>

        {/* Big ring */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
          <Ring size={176} strokeW={14} pct={ringPct} color="#f97316" bg="rgba(255,255,255,0.06)">
            <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-1.5px", lineHeight: 1 }}>{goal}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 4 }}>kcal / day</div>
          </Ring>
        </div>

        {/* Intensity picker */}
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", textAlign: "center", marginBottom: 12 }}>Choose your intensity</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 24 }}>
          {[["gentle", "Gentle"], ["recommended", "⭐ Best"], ["aggressive", "Intense"]].map(([key, lbl]) => (
            <button key={key} onClick={() => setChosen(key)} style={{
              padding: "14px 6px", borderRadius: 14, border: "none", cursor: "pointer", textAlign: "center",
              background: chosen === key ? "#f97316" : "rgba(255,255,255,0.06)",
              outline: chosen === key ? "none" : "1px solid rgba(255,255,255,0.08)",
              transition: "all 0.2s"
            }}>
              <div style={{ fontSize: 10, color: chosen === key ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.35)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>{lbl}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{plan[key]}</div>
              <div style={{ fontSize: 10, color: chosen === key ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.3)", marginTop: 2 }}>kcal</div>
            </button>
          ))}
        </div>

        {/* Stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          {[
            { label: "BMR",         val: plan.bmr,         unit: "kcal", note: "Calories at rest" },
            { label: "TDEE",        val: plan.tdee,        unit: "kcal", note: "Total daily burn" },
            { label: "Daily deficit",val: plan.dailyDeficit,unit: "kcal", note: "Below maintenance" },
            { label: "BMI",         val: plan.bmi,         unit: "",     note: bmiLabel, noteColor: bmiColor },
          ].map(s => (
            <div key={s.label} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 14, padding: "16px 14px", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{s.label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#fff" }}>{s.val}<span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginLeft: 3 }}>{s.unit}</span></div>
              <div style={{ fontSize: 11, color: s.noteColor || "rgba(255,255,255,0.3)", marginTop: 4 }}>{s.note}</div>
            </div>
          ))}
        </div>

        {/* Macros */}
        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 16, padding: "18px 16px", marginBottom: 16, border: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16 }}>Daily macro targets</div>
          {[["Protein", plan.protein, 30, "#60a5fa"], ["Carbs", plan.carbs, 40, "#fbbf24"], ["Fat", plan.fat, 30, "#f472b6"]].map(([name, g, pct, color]) => (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", width: 52 }}>{name}</div>
              <div style={{ flex: 1 }}><ProgressBar pct={pct} color={color} h={5} /></div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", width: 40, textAlign: "right" }}>{g}g</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", width: 30, textAlign: "right" }}>{pct}%</div>
            </div>
          ))}
        </div>

        {/* Timeline */}
        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 16, padding: "18px 16px", marginBottom: 24, border: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16 }}>Weight milestone plan</div>
          {milestones.map((m, i) => (
            <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: i < milestones.length - 1 ? 14 : 0 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: i === 0 ? "rgba(249,115,22,0.25)" : i === milestones.length - 1 ? "rgba(52,211,153,0.25)" : "rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>{m.icon}</div>
                {i < milestones.length - 1 && <div style={{ width: 1.5, height: 18, background: "rgba(255,255,255,0.08)", marginTop: 4 }} />}
              </div>
              <div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 2 }}>{m.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{i === 0 ? "Start journey" : i === milestones.length - 1 ? "Reach goal! 🎉" : `Month ${m.month} checkpoint`}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>Target: {m.weight} kg</div>
              </div>
            </div>
          ))}
        </div>

        <PrimaryBtn onClick={handleStart} style={{ padding: "17px 20px", fontSize: 16 }}>Start tracking →</PrimaryBtn>
        <div style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.2)", marginTop: 10 }}>Based on Mifflin-St Jeor · Adjust anytime in Profile</div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════
// MAIN APP
// ════════════════════════════════════════════
function MainApp({ profile, log, setLog, onReset }) {
  const [tab, setTab] = useState("today");
  const [preview, setPreview] = useState(null);
  const [b64, setB64] = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [meal, setMeal] = useState("lunch");
  const [editEntry, setEditEntry] = useState(null);
  const [activity, setActivity] = useState(() => {
    try {
      const all = JSON.parse(localStorage.getItem("nutriai_activity") || "{}");
      return all[todayStr()] || { steps: 0, waterMl: 0 };
    } catch { return { steps: 0, waterMl: 0 }; }
  });
  const [currentDay, setCurrentDay] = useState(todayStr());
  const [stepsInput, setStepsInput] = useState("");
  const [showStepsModal, setShowStepsModal] = useState(false);
  const fileRef = useRef();

  // Re-sync activity if the date changes (app left open across midnight)
  useEffect(() => {
    const checkDay = () => {
      const newDay = todayStr();
      if (newDay !== currentDay) {
        setCurrentDay(newDay);
        try {
          const all = JSON.parse(localStorage.getItem("nutriai_activity") || "{}");
          setActivity(all[newDay] || { steps: 0, waterMl: 0 });
        } catch { setActivity({ steps: 0, waterMl: 0 }); }
      }
    };
    // Check every minute
    const timer = setInterval(checkDay, 60000);
    return () => clearInterval(timer);
  }, [currentDay]);

  // Persist activity keyed by date — data is NEVER lost, just filed under its day
  const saveActivity = (newAct) => {
    setActivity(newAct);
    try {
      const all = JSON.parse(localStorage.getItem("nutriai_activity") || "{}");
      all[todayStr()] = newAct;
      localStorage.setItem("nutriai_activity", JSON.stringify(all));
    } catch (_) {}
  };

  const addGlass = () => saveActivity({ ...activity, waterMl: Math.min(WATER_GOAL_ML * 2, activity.waterMl + GLASS_ML) });
  const removeGlass = () => saveActivity({ ...activity, waterMl: Math.max(0, activity.waterMl - GLASS_ML) });

  const today = currentDay;  // stays in sync with date changes via useEffect
  const todayLog = log[today] || [];
  const totalCal = todayLog.reduce((s, e) => s + e.calories, 0);
  const totalP   = todayLog.reduce((s, e) => s + e.protein, 0);
  const totalC   = todayLog.reduce((s, e) => s + e.carbs, 0);
  const totalF   = todayLog.reduce((s, e) => s + e.fat, 0);
  const stepsBurned = stepCalsBurned(activity.steps);
  const adjustedGoal = profile.goal + stepsBurned;  // extra calories earned from steps
  const ringPct  = Math.round(totalCal / adjustedGoal * 100);
  const remaining = adjustedGoal - totalCal;

  // streak
  let streak = 0;
  const tmp = new Date();
  for (let i = 0; i < 365; i++) {
    const k = `${tmp.getFullYear()}-${String(tmp.getMonth()+1).padStart(2,"0")}-${String(tmp.getDate()).padStart(2,"0")}`;
    if ((log[k] || []).length > 0) { streak++; tmp.setDate(tmp.getDate() - 1); } else break;
  }
  const onGoalDays = Object.keys(log).filter(k => { const dc = (log[k] || []).reduce((s, e) => s + e.calories, 0); return dc > 0 && dc <= profile.goal; }).length;

  const deadline = new Date(profile.deadline);
  const daysLeft = Math.max(0, Math.ceil((deadline - new Date()) / 86400000));
  const startW = profile.startWeight || profile.weightKg;
  const totalLoss = startW - profile.targetKg;
  const progressPct = totalLoss > 0 ? Math.min(100, ((startW - profile.weightKg) / totalLoss) * 100) : 0;

  const weekBars = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    return { label: d.toLocaleDateString("en-GB", { weekday: "short" }), cal: (log[k] || []).reduce((s, e) => s + e.calories, 0), isToday: k === today };
  });
  const maxBar = Math.max(...weekBars.map(b => b.cal), profile.goal, 1);

  const bmiLabel = profile.bmi < 18.5 ? "Underweight" : profile.bmi < 25 ? "Normal" : profile.bmi < 30 ? "Overweight" : "Obese";
  const bmiColor = profile.bmi < 18.5 ? "#60a5fa" : profile.bmi < 25 ? "#34d399" : profile.bmi < 30 ? "#fbbf24" : "#f87171";
  const bmiPct   = Math.min(100, Math.max(0, (profile.bmi - 15) / 25 * 100));

  const handleFile = e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => { setPreview(ev.target.result); setB64(ev.target.result.split(",")[1]); setScanResult(null); setError(""); };
    r.readAsDataURL(f);
  };

  const analyse = async () => {
    if (!b64) return;
    setLoading(true); setError("");
    try {
      const mm = preview.match(/^data:(image\/\w+);base64,/);
      const mt = (mm && mm[1]) || "image/jpeg";
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 800,
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: mt, data: b64 } },
            { type: "text", text: `Analyse this food. Reply ONLY with JSON, no markdown:\n{"name":"specific food","calories":450,"protein_g":35,"carbs_g":45,"fat_g":8,"serving":"~400g","notes":"Brief nutrition note."}\nIf no food: {"error":"No food detected."}` }
          ]}]
        })
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || "";
      let parsed;
      try { parsed = JSON.parse(text.trim()); } catch { const m = text.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); else throw new Error("Parse error"); }
      if (parsed.error) setError(parsed.error);
      else setScanResult(parsed);
    } catch (err) { setError("Could not analyse. " + err.message); }
    finally { setLoading(false); }
  };

  const addLog = () => {
    if (!scanResult) return;
    const entry = { id: Date.now(), name: scanResult.name, calories: scanResult.calories, protein: scanResult.protein_g, carbs: scanResult.carbs_g, fat: scanResult.fat_g, meal };
    const updated = { ...log, [today]: [...(log[today] || []), entry] };
    setLog(updated);
    setPreview(null); setB64(null); setScanResult(null); setError("");
  };

  const removeEntry = id => setLog({ ...log, [today]: (log[today] || []).filter(e => e.id !== id) });

  const updateEntry = (id, changes) => {
    const updated = { ...log, [today]: (log[today] || []).map(e => e.id === id ? { ...e, ...changes } : e) };
    setLog(updated);
    setEditEntry(null);
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const S = {
    page: { background: "#0f0f11", minHeight: "100vh", color: "#fff", fontFamily: "'DM Sans', system-ui, sans-serif" },
    nav: { position: "sticky", top: 0, zIndex: 99, background: "rgba(15,15,17,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex" },
    navTab: active => ({ flex: 1, padding: "13px 4px", border: "none", background: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, textTransform: "capitalize", letterSpacing: "0.04em", color: active ? "#f97316" : "rgba(255,255,255,0.3)", borderBottom: active ? "2px solid #f97316" : "2px solid transparent", transition: "all 0.15s" }),
    inner: { maxWidth: 460, margin: "0 auto", padding: "18px 20px 80px" },
    card: { background: "rgba(255,255,255,0.04)", borderRadius: 18, padding: "18px 16px", border: "1px solid rgba(255,255,255,0.07)", marginBottom: 14 },
    darkCard: { background: "#18181b", borderRadius: 20, padding: "20px 18px", marginBottom: 14, border: "1px solid rgba(255,255,255,0.06)" },
    sectionLabel: { fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 },
  };

  return (
    <div style={S.page}>
      <div style={S.nav}>
        {["today", "progress", "profile"].map(t => (
          <button key={t} style={S.navTab(tab === t)} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {/* ─── TODAY ─── */}
      {tab === "today" && (
        <div style={S.inner}>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{greeting}, {profile.name}! 👋</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>
              {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
            </div>
          </div>

          {/* Calorie card */}
          <div style={S.darkCard}>
            <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 18 }}>
              <Ring size={96} strokeW={9} pct={ringPct} color={ringPct > 100 ? "#f87171" : "#f97316"} bg="rgba(255,255,255,0.06)">
                <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>{Math.min(ringPct, 999)}<span style={{ fontSize: 11 }}>%</span></div>
              </Ring>
              <div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Eaten today</div>
                <div style={{ fontSize: 42, fontWeight: 800, color: "#fff", letterSpacing: "-2px", lineHeight: 1 }}>{totalCal}</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginTop: 5 }}>
                  Goal: <span style={{ color: "#f97316" }}>{adjustedGoal}</span>{stepsBurned > 0 && <span style={{ color: "#34d399", fontSize: 11 }}> (+{stepsBurned} steps)</span>}
                </div>
                <div style={{ fontSize: 13, marginTop: 3 }}>
                  {remaining >= 0 ? <span style={{ color: "#34d399" }}>{remaining} kcal left</span> : <span style={{ color: "#f87171" }}>{Math.abs(remaining)} over</span>}
                </div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[["Protein", totalP, "#60a5fa", profile.protein], ["Carbs", totalC, "#fbbf24", profile.carbs], ["Fat", totalF, "#f472b6", profile.fat]].map(([name, val, color, target]) => (
                <div key={name} style={{ background: "rgba(255,255,255,0.06)", borderRadius: 12, padding: "10px" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>{val}g</div>
                  <div style={{ fontSize: 10, color, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>{name}</div>
                  <div style={{ marginTop: 6 }}><ProgressBar pct={Math.round(val / target * 100)} color={color} h={3} /></div>
                </div>
              ))}
            </div>
          </div>

          {/* Weight journey */}
          <div style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Weight journey</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>{daysLeft} days left</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#f97316" }}>{startW}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", marginTop: 2 }}>Start</div>
              </div>
              <div style={{ flex: 1, position: "relative" }}>
                <ProgressBar pct={progressPct} color="#f97316" h={8} />
                <div style={{ position: "absolute", top: "50%", left: `${progressPct}%`, transform: "translate(-50%,-50%)", width: 14, height: 14, borderRadius: "50%", background: "#f97316", border: "2px solid #0f0f11", boxShadow: "0 0 0 2px rgba(249,115,22,0.4)" }} />
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#34d399" }}>{profile.targetKg}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", marginTop: 2 }}>Goal</div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ background: "rgba(52,211,153,0.12)", color: "#34d399", padding: "4px 12px", borderRadius: 99, fontSize: 12, fontWeight: 700 }}>
                🎯 {deadline.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
                ~{((profile.weightKg - profile.targetKg) / Math.max(1, daysLeft / 7)).toFixed(1)} kg/week
              </div>
            </div>
          </div>

          {/* Steps & Water card */}
          <div style={S.card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Activity & Hydration</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.06)", padding: "3px 10px", borderRadius: 99 }}>Manual · Apple Health soon</div>
            </div>

            {/* Steps row */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 20 }}>👟</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>Steps today</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>+{stepsBurned} kcal bonus earned</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#34d399" }}>{activity.steps.toLocaleString()}</div>
                  <button onClick={() => { setStepsInput(String(activity.steps)); setShowStepsModal(true); }}
                    style={{ background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.3)", color: "#34d399", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Edit</button>
                </div>
              </div>
              {/* Steps progress bar — 10,000 step goal */}
              <div style={{ marginBottom: 4 }}>
                <ProgressBar pct={Math.round(activity.steps / 10000 * 100)} color="#34d399" h={6} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
                <span>0</span><span>Goal: 10,000 steps</span>
              </div>
            </div>

            {/* Steps input modal inline */}
            {showStepsModal && (
              <div style={{ background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 12, padding: "14px 14px", marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>Enter steps count</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="number" value={stepsInput} min="0" max="100000" placeholder="e.g. 7500"
                    onChange={e => setStepsInput(e.target.value)}
                    style={{ flex: 1, padding: "9px 12px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 14, fontFamily: "inherit" }} />
                  <button onClick={() => { saveActivity({ ...activity, steps: Math.max(0, parseInt(stepsInput) || 0) }); setShowStepsModal(false); }}
                    style={{ background: "#34d399", color: "#0f0f11", border: "none", padding: "9px 16px", borderRadius: 9, fontWeight: 800, fontSize: 13, cursor: "pointer" }}>Save</button>
                  <button onClick={() => setShowStepsModal(false)}
                    style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.4)", border: "none", padding: "9px 12px", borderRadius: 9, cursor: "pointer" }}>✕</button>
                </div>
                <div style={{ fontSize: 11, color: "rgba(52,211,153,0.6)", marginTop: 8 }}>
                  {Math.max(0, parseInt(stepsInput) || 0).toLocaleString()} steps = +{stepCalsBurned(Math.max(0, parseInt(stepsInput) || 0))} kcal · New goal: {profile.goal + stepCalsBurned(Math.max(0, parseInt(stepsInput) || 0))} kcal
                </div>
              </div>
            )}

            {/* Water row */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 20 }}>💧</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>Water intake</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{activity.waterMl} ml of {WATER_GOAL_ML} ml goal</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button onClick={removeGlass} style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#60a5fa", minWidth: 32, textAlign: "center" }}>{Math.round(activity.waterMl / GLASS_ML)}</div>
                  <button onClick={addGlass} style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(96,165,250,0.15)", border: "1px solid rgba(96,165,250,0.3)", color: "#60a5fa", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                </div>
              </div>
              {/* Glass icons */}
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
                {Array.from({ length: Math.round(WATER_GOAL_ML / GLASS_ML) }).map((_, i) => {
                  const filled = i < Math.round(activity.waterMl / GLASS_ML);
                  return (
                    <button key={i} onClick={() => saveActivity({ ...activity, waterMl: (i + 1) * GLASS_ML })}
                      style={{ width: 30, height: 36, borderRadius: 6, border: "1.5px solid " + (filled ? "#60a5fa" : "rgba(255,255,255,0.1)"), background: filled ? "rgba(96,165,250,0.2)" : "rgba(255,255,255,0.03)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
                      {filled ? "💧" : "🫙"}
                    </button>
                  );
                })}
              </div>
              <ProgressBar pct={Math.round(activity.waterMl / WATER_GOAL_ML * 100)} color="#60a5fa" h={5} />
            </div>
          </div>

          {/* Scanner */}
          <div style={{ ...S.card, border: preview ? "1px solid rgba(255,255,255,0.07)" : "1.5px dashed rgba(255,255,255,0.12)" }}>
            {!preview ? (
              <div style={{ textAlign: "center", padding: "10px 0", cursor: "pointer" }} onClick={() => fileRef.current.click()}>
                <input type="file" ref={fileRef} accept="image/*" style={{ display: "none" }} onChange={handleFile} />
                <div style={{ fontSize: 38, marginBottom: 10 }}>📸</div>
                <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 5 }}>Scan your food</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginBottom: 16 }}>AI identifies calories & macros instantly</div>
                <button style={{ background: "linear-gradient(135deg,#f97316,#ea580c)", color: "#fff", border: "none", padding: "11px 24px", borderRadius: 99, fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 16px rgba(249,115,22,0.35)" }}
                  onClick={e => { e.stopPropagation(); fileRef.current.click(); }}>📷 Choose photo</button>
              </div>
            ) : (
              <div>
                <div style={{ position: "relative", marginBottom: 12 }}>
                  <img src={preview} alt="" style={{ width: "100%", borderRadius: 12, maxHeight: 200, objectFit: "cover", display: "block" }} />
                  <button
                    onClick={() => { setPreview(null); setB64(null); setScanResult(null); setError(""); if(fileRef.current) fileRef.current.value = ""; }}
                    style={{ position: "absolute", top: 8, right: 8, width: 30, height: 30, borderRadius: "50%", background: "rgba(0,0,0,0.65)", border: "1.5px solid rgba(255,255,255,0.25)", color: "#fff", fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}
                  >✕</button>
                </div>
                {loading ? (
                  <div>
                    <div style={{ height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 99, overflow: "hidden", marginBottom: 10 }}>
                      <div style={{ height: "100%", background: "#f97316", width: "70%", borderRadius: 99 }} />
                    </div>
                    <div style={{ textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Analysing your food…</div>
                  </div>
                ) : !scanResult ? (
                  <button style={{ width: "100%", background: "linear-gradient(135deg,#f97316,#ea580c)", color: "#fff", border: "none", padding: "12px", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer" }} onClick={analyse}>⚡ Analyse</button>
                ) : null}
              </div>
            )}
            {error && <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", color: "#f87171", padding: "10px 14px", borderRadius: 10, fontSize: 13, marginTop: 10 }}>⚠️ {error}</div>}
          </div>

          {/* Scan result */}
          {scanResult && (
            <div style={S.card}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 22 }}>🍽️</span>
                <div style={{ flex: 1, fontWeight: 700, fontSize: 16 }}>{scanResult.name}</div>
                <div style={{ background: "#f97316", color: "#fff", padding: "4px 12px", borderRadius: 99, fontSize: 13, fontWeight: 700 }}>{scanResult.calories} kcal</div>
                <button onClick={() => { setScanResult(null); setPreview(null); setB64(null); setError(""); if(fileRef.current) fileRef.current.value = ""; }} style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.5)", fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 700 }} title="Discard">✕</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                {[["Protein", scanResult.protein_g, "#60a5fa"], ["Carbs", scanResult.carbs_g, "#fbbf24"], ["Fat", scanResult.fat_g, "#f472b6"]].map(([n, v, c]) => (
                  <div key={n} style={{ background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: "10px", textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: c }}>{v}g</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{n}</div>
                  </div>
                ))}
              </div>
              {scanResult.notes && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 12, lineHeight: 1.6 }}>{scanResult.notes}</div>}
              <div style={{ display: "flex", gap: 8 }}>
                <select value={meal} onChange={e => setMeal(e.target.value)} style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 13, fontFamily: "inherit" }}>
                  <option value="breakfast">🌅 Breakfast</option>
                  <option value="lunch">☀️ Lunch</option>
                  <option value="dinner">🌙 Dinner</option>
                  <option value="snack">🍎 Snack</option>
                </select>
                <button style={{ background: "linear-gradient(135deg,#f97316,#ea580c)", color: "#fff", border: "none", padding: "10px 18px", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }} onClick={addLog}>+ Log it</button>
              </div>
            </div>
          )}

          {/* Food log */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Today's log</div>
            {todayLog.length > 0 && <button style={{ background: "none", border: "none", color: "#f87171", fontSize: 12, cursor: "pointer" }} onClick={() => setLog({ ...log, [today]: [] })}>Clear all</button>}
          </div>
          {todayLog.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px", color: "rgba(255,255,255,0.25)", fontSize: 13, background: "rgba(255,255,255,0.03)", border: "1.5px dashed rgba(255,255,255,0.08)", borderRadius: 14 }}>
              Nothing logged yet — scan your first meal!
            </div>
          ) : (
            [...todayLog].reverse().map(e => (
              <div key={e.id} style={{ ...S.card, padding: 0, overflow: "hidden" }}>
                {/* Normal row */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: MEAL_COLORS[e.meal] || "#888", flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{e.name}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
                      <span style={{ background: "rgba(255,255,255,0.07)", padding: "1px 7px", borderRadius: 6, marginRight: 6, textTransform: "capitalize" }}>{e.meal}</span>
                      P:{e.protein}g · C:{e.carbs}g · F:{e.fat}g
                    </div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#f97316" }}>{e.calories}</div>
                  {/* Edit button */}
                  <button
                    onClick={() => setEditEntry(editEntry?.id === e.id ? null : { ...e })}
                    style={{ background: editEntry?.id === e.id ? "rgba(249,115,22,0.2)" : "rgba(255,255,255,0.06)", border: "1px solid " + (editEntry?.id === e.id ? "rgba(249,115,22,0.4)" : "rgba(255,255,255,0.1)"), color: editEntry?.id === e.id ? "#f97316" : "rgba(255,255,255,0.4)", borderRadius: 8, padding: "4px 9px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}
                  >✏️</button>
                  <button style={{ background: "none", border: "none", color: "rgba(255,255,255,0.2)", cursor: "pointer", fontSize: 16, padding: "0 2px" }} onClick={() => removeEntry(e.id)}>✕</button>
                </div>
                {/* Inline edit panel */}
                {editEntry?.id === e.id && (
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", padding: "14px 16px", background: "rgba(249,115,22,0.04)" }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Edit entry</div>
                    {/* Name */}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 5 }}>Food name</div>
                      <input value={editEntry.name} onChange={ev => setEditEntry(p => ({ ...p, name: ev.target.value }))}
                        style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
                    </div>
                    {/* Meal type */}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 7 }}>Meal</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {["breakfast","lunch","dinner","snack"].map(m => (
                          <button key={m} onClick={() => setEditEntry(p => ({ ...p, meal: m }))} style={{
                            flex: 1, padding: "8px 4px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, textTransform: "capitalize",
                            background: editEntry.meal === m ? MEAL_COLORS[m] : "rgba(255,255,255,0.07)",
                            color: editEntry.meal === m ? "#fff" : "rgba(255,255,255,0.4)",
                            outline: editEntry.meal === m ? "2px solid " + MEAL_COLORS[m] : "none",
                          }}>{m}</button>
                        ))}
                      </div>
                    </div>
                    {/* Calories */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 5 }}>Calories (kcal)</div>
                      <input type="number" value={editEntry.calories} onChange={ev => setEditEntry(p => ({ ...p, calories: parseInt(ev.target.value) || 0 }))}
                        style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
                    </div>
                    {/* Save / Cancel */}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => updateEntry(e.id, editEntry)} style={{ flex: 1, background: "linear-gradient(135deg,#f97316,#ea580c)", color: "#fff", border: "none", padding: "10px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Save changes</button>
                      <button onClick={() => setEditEntry(null)} style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)", border: "none", padding: "10px 14px", borderRadius: 10, fontSize: 13, cursor: "pointer" }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ─── PROGRESS ─── */}
      {tab === "progress" && (
        <div style={S.inner}>
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Your progress</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginBottom: 18 }}>
            {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
          </div>

          {/* BMI gauge */}
          <div style={S.card}>
            <div style={S.sectionLabel}>BMI analysis</div>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <div>
                <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-1px" }}>{profile.bmi}</div>
                <div style={{ fontSize: 13, color: bmiColor, fontWeight: 700, marginTop: 3 }}>{bmiLabel}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ height: 10, borderRadius: 99, background: "linear-gradient(90deg,#60a5fa 0%,#34d399 25%,#fbbf24 60%,#f87171 100%)", marginBottom: 8, position: "relative" }}>
                  <div style={{ position: "absolute", top: "50%", left: `${bmiPct}%`, transform: "translate(-50%,-50%)", width: 16, height: 16, borderRadius: "50%", background: "#fff", border: `3px solid ${bmiColor}`, boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
                  <span>Under</span><span>Normal</span><span>Over</span><span>Obese</span>
                </div>
              </div>
            </div>
          </div>

          {/* Stats grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            {[
              { icon: "🔥", val: streak,   label: "Day streak" },
              { icon: "⚖️", val: `${(profile.weightKg - profile.targetKg).toFixed(1)} kg`, label: "To goal" },
              { icon: "🎯", val: onGoalDays, label: "Days on goal" },
              { icon: "📅", val: daysLeft,  label: "Days left" },
            ].map(s => (
              <div key={s.label} style={S.card}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>{s.icon}</div>
                <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.5px" }}>{s.val}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Weekly bars */}
          <div style={S.card}>
            <div style={S.sectionLabel}>7-day calories</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 130 }}>
              {weekBars.map((b, i) => {
                const h = maxBar > 0 ? Math.round((b.cal / maxBar) * 110) : 0;
                const over = b.cal > profile.goal;
                const color = b.cal === 0 ? "rgba(255,255,255,0.05)" : over ? "rgba(248,113,113,0.5)" : "rgba(249,115,22,0.6)";
                const border = b.isToday ? "1.5px solid #f97316" : "none";
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                    {b.cal > 0 && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>{b.cal}</div>}
                    <div style={{ width: "100%", height: Math.max(h, b.cal > 0 ? 4 : 0), background: color, borderRadius: "4px 4px 0 0", border, transition: "height 0.6s ease" }} />
                    <div style={{ fontSize: 10, color: b.isToday ? "#f97316" : "rgba(255,255,255,0.3)", fontWeight: b.isToday ? 700 : 400 }}>{b.label}</div>
                  </div>
                );
              })}
            </div>
            {/* Goal line label */}
            <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.25)", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
              Daily goal: {profile.goal} kcal · <span style={{ color: "#34d399" }}>● on track</span> · <span style={{ color: "#f87171" }}>● over</span>
            </div>
          </div>

          {/* Macro bars */}
          <div style={S.card}>
            <div style={S.sectionLabel}>Today's macros vs. target</div>
            {totalCal === 0 ? (
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "14px 0" }}>Log food to see breakdown</div>
            ) : (
              [["Protein", totalP, "#60a5fa", profile.protein], ["Carbs", totalC, "#fbbf24", profile.carbs], ["Fat", totalF, "#f472b6", profile.fat]].map(([name, val, color, target]) => (
                <div key={name} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                    <span style={{ color }}>{name}</span>
                    <span style={{ fontWeight: 700 }}>{val}g <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>/ {target}g</span></span>
                  </div>
                  <ProgressBar pct={Math.round(val / target * 100)} color={color} h={6} />
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ─── PROFILE ─── */}
      {tab === "profile" && (
        <div style={S.inner}>
          {/* Hero */}
          <div style={{ ...S.darkCard, textAlign: "center", padding: "28px 20px 24px" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(135deg,#f97316,#ea580c)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, margin: "0 auto 14px" }}>👤</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{profile.name}</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginTop: 5 }}>
              {profile.weightKg} kg → {profile.targetKg} kg in {profile.months} month{profile.months > 1 ? "s" : ""}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, background: "rgba(255,255,255,0.08)", borderRadius: 14, overflow: "hidden", marginTop: 20 }}>
              {[["Age", profile.age + " yrs"], ["Height", Math.floor(profile.heightCm / 30.48) + "ft " + Math.round((profile.heightCm / 2.54) % 12) + "in"], ["BMI", profile.bmi]].map(([l, v]) => (
                <div key={l} style={{ background: "rgba(255,255,255,0.04)", padding: "12px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{v}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 3 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Settings */}
          <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
            {[
              { icon: "🎯", label: "Daily calorie goal", val: profile.goal + " kcal", bg: "rgba(249,115,22,0.15)" },
              { icon: "⚖️", label: "Current weight",     val: profile.weightKg + " kg",   bg: "rgba(52,211,153,0.12)" },
              { icon: "🏁", label: "Target weight",      val: profile.targetKg + " kg",   bg: "rgba(96,165,250,0.12)" },
              { icon: "🏃", label: "Activity level",     val: profile.actLabel,           bg: "rgba(251,191,36,0.12)" },
              { icon: "📅", label: "Goal deadline",      val: deadline.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }), bg: "rgba(244,114,182,0.12)" },
              { icon: "🧬", label: "BMR",                val: profile.bmr + " kcal",      bg: "rgba(139,92,246,0.12)" },
              { icon: "⚡", label: "TDEE",               val: profile.tdee + " kcal",     bg: "rgba(249,115,22,0.12)" },
            ].map((s, i, arr) => (
              <div key={s.label} style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: s.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{s.icon}</div>
                <div style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{s.label}</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>{s.val}</div>
              </div>
            ))}
          </div>

          <button style={{ width: "100%", padding: "14px", borderRadius: 14, border: "1px solid rgba(248,113,113,0.25)", background: "rgba(248,113,113,0.08)", color: "#f87171", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
            onClick={() => { if (window.confirm("Reset everything and start over?")) { localStorage.removeItem(STORE_KEY); onReset(); } }}>
            Reset & start over
          </button>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════
// ROOT
// ════════════════════════════════════════════
export default function App() {
  const [phase, setPhase] = useState("boot");
  const [step, setStep]   = useState(1);
  const [form, setForm]   = useState({ name: "", gender: "female", dob: "", heightCm: 0, weightKg: "", targetKg: "", months: 3, actMult: 1.2, actLabel: "Sedentary" });
  const [profile, setProfile] = useState(null);
  const [plan, setPlan]       = useState(null);
  const [log, setLogState]    = useState({});

  useEffect(() => {
    const saved = loadData();
    if (saved?.profile?.goal) {
      setProfile(saved.profile);
      setLogState(saved.log || {});
      setPhase("app");
    } else {
      setPhase("splash");
    }
  }, []);

  const setLog = (newLog) => {
    setLogState(newLog);
    saveData({ profile, log: newLog });
  };

  const setField = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const finishOnboarding = () => {
    const age = calcAge(form.dob);
    const full = { ...form, age };
    const computed = calcPlan(full);
    setPlan(computed);
    setProfile({ ...full, ...computed, startWeight: form.weightKg, startDate: todayStr() });
    setPhase("results");
  };

  const launchApp = (finalProfile) => {
    saveData({ profile: finalProfile, log });
    setProfile(finalProfile);
    setPhase("app");
  };

  const reset = () => {
    setProfile(null); setPlan(null); setLogState({});
    setStep(1); setForm({ name: "", gender: "female", dob: "", heightCm: 0, weightKg: "", targetKg: "", months: 3, actMult: 1.2, actLabel: "Sedentary" });
    setPhase("splash");
  };

  if (phase === "boot") return (
    <div style={{ minHeight: "100vh", background: "#0f0f11", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid #f97316", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
    </div>
  );

  if (phase === "splash") return (
    <div style={{ minHeight: "100vh", background: "#0a0a0c", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 24px", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div style={{ fontSize: 48, fontWeight: 900, color: "#fff", letterSpacing: "-2px", marginBottom: 10 }}>
        Nutri<span style={{ color: "#f97316" }}>AI</span>
      </div>
      <div style={{ fontSize: 16, color: "rgba(255,255,255,0.35)", marginBottom: 52, lineHeight: 1.5 }}>
        Smart calorie tracking,<br />powered by AI
      </div>
      <PrimaryBtn onClick={() => setPhase("onboard")} style={{ maxWidth: 300, padding: "17px 32px", fontSize: 16, borderRadius: 99 }}>
        Get started free →
      </PrimaryBtn>
    </div>
  );

  if (phase === "onboard") return (
    <>
      {step === 1 && <Step1 data={form} set={setField} onNext={() => setStep(2)} />}
      {step === 2 && <Step2 data={form} set={setField} onNext={() => setStep(3)} onBack={() => setStep(1)} />}
      {step === 3 && <Step3 data={form} set={setField} onNext={() => setStep(4)} onBack={() => setStep(2)} />}
      {step === 4 && <Step4 data={form} set={setField} onNext={() => setStep(5)} onBack={() => setStep(3)} />}
      {step === 5 && <Step5 data={form} set={setField} onNext={finishOnboarding} onBack={() => setStep(4)} />}
    </>
  );

  if (phase === "results") return <Results profile={{ ...form, age: calcAge(form.dob) }} plan={plan} onStart={launchApp} />;
  if (phase === "app")     return <MainApp profile={profile} log={log} setLog={setLog} onReset={reset} />;
  return null;
}
