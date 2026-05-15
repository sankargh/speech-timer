import { useState, useEffect, useRef } from "react";

const SPEECH_TYPES = {
  "Table Topics":              { min: 60,  max: 120, warning: 90,  label: "1 – 2 min" },
  "Prepared Speech (5–7 min)": { min: 300, max: 420, warning: 360, label: "5 – 7 min" },
  "Prepared Speech (7–9 min)": { min: 420, max: 540, warning: 480, label: "7 – 9 min" },
  "Evaluation":                { min: 120, max: 180, warning: 150, label: "2 – 3 min" },
  "General Evaluator":         { min: 180, max: 300, warning: 240, label: "3 – 5 min" },
};

function formatTime(s) {
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}
function formatDateTime(ts) {
  return new Date(ts).toLocaleString("en-SG", { dateStyle: "short", timeStyle: "short" });
}
function getStatus(elapsed, type) {
  if (elapsed >= type.max)     return "red";
  if (elapsed >= type.warning) return "orange";
  if (elapsed >= type.min)     return "green";
  return "idle";
}
function padR(str, width) {
  return String(str).slice(0, width).padEnd(width);
}

const STATUS = {
  idle:   { timerBg: "#f8fafc", timerBorder: "#e2e8f0", clockColor: "#94a3b8", labelColor: "#94a3b8", label: "",                    barColor: "#cbd5e1" },
  green:  { timerBg: "#f0fdf4", timerBorder: "#86efac", clockColor: "#15803d", labelColor: "#16a34a", label: "✓  Minimum reached",   barColor: "#22c55e" },
  orange: { timerBg: "#fffbeb", timerBorder: "#fcd34d", clockColor: "#b45309", labelColor: "#d97706", label: "⚠  Approaching limit", barColor: "#f59e0b" },
  red:    { timerBg: "#fef2f2", timerBorder: "#fca5a5", clockColor: "#b91c1c", labelColor: "#dc2626", label: "✕  Time exceeded",     barColor: "#ef4444" },
};
const RESULT_LABEL = { green: "On Time", orange: "Approaching", red: "Exceeded", idle: "—" };

export default function SpeechTimer() {
  const [speakers,      setSpeakers]      = useState([]);
  const [nameInput,     setNameInput]     = useState("");
  const [selectedType,  setSelectedType]  = useState("Table Topics");
  const [running,       setRunning]       = useState(false);
  const [stopped,       setStopped]       = useState(false);
  const [elapsed,       setElapsed]       = useState(0);
  const [activeSpeaker, setActiveSpeaker] = useState(null);
  const [records,       setRecords]       = useState([]);
  const [confirmClear,  setConfirmClear]  = useState(false);
  const [exportStatus,  setExportStatus]  = useState(null);
  const [selectedRows,  setSelectedRows]  = useState(new Set());
  const [flash,         setFlash]         = useState(false);
  const [customMin,     setCustomMin]     = useState("");
  const [customMax,     setCustomMax]     = useState("");

  const intervalRef    = useRef(null);
  const startRef       = useRef(null);
  const prevStatusRef  = useRef("idle");
  const checkboxAllRef = useRef(null);

  // ── Derived type (handles Custom Speech) ──
  const isCustom     = selectedType === "Custom Speech";
  const customMinSec = Math.round(parseFloat(customMin || 0) * 60);
  const customMaxSec = Math.round(parseFloat(customMax || 0) * 60);
  const customValid  = isCustom && customMinSec > 0 && customMaxSec > customMinSec;
  const type = isCustom && customValid
    ? { min: customMinSec, max: customMaxSec,
        warning: Math.round(customMinSec + (customMaxSec - customMinSec) * 0.75),
        label: `${customMin}–${customMax} min` }
    : (SPEECH_TYPES[selectedType] || SPEECH_TYPES["Table Topics"]);

  const status   = running || elapsed > 0 ? getStatus(elapsed, type) : "idle";
  const st       = STATUS[status];
  const progress = Math.min(elapsed / type.max, 1);
  const minMark  = type.min / type.max;
  const warnMark = type.warning / type.max;

  // ── Timer tick ──
  useEffect(() => {
    if (running) {
      startRef.current = Date.now() - elapsed * 1000;
      intervalRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }, 200);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [running]);

  // ── Flash on colour change ──
  useEffect(() => {
    if (status !== prevStatusRef.current && status !== "idle") {
      setFlash(true);
      setTimeout(() => setFlash(false), 600);
    }
    prevStatusRef.current = status;
  }, [status]);

  // ── Indeterminate checkbox ──
  useEffect(() => {
    if (checkboxAllRef.current) {
      checkboxAllRef.current.indeterminate =
        selectedRows.size > 0 && selectedRows.size < records.length;
    }
  }, [selectedRows, records]);

  // ── Speakers ──
  function addSpeaker() {
    const name = nameInput.trim();
    if (!name || speakers.includes(name)) return;
    setSpeakers(s => [...s, name]);
    setNameInput("");
  }
  function removeSpeaker(name) {
    setSpeakers(s => s.filter(x => x !== name));
    if (activeSpeaker === name) setActiveSpeaker(null);
  }

  // ── Timer controls ──
  function startTimer() {
    if (!activeSpeaker || running) return;
    setElapsed(0);
    setStopped(false);
    setRunning(true);
  }
  function stopTimer() {
    if (!running) return;
    setRunning(false);
    setStopped(true);
    const typLabel = isCustom && customValid
      ? `Custom Speech (${customMin}–${customMax} min)`
      : selectedType;
    setRecords(r => [
      { id: Date.now(), speaker: activeSpeaker, type: typLabel,
        duration: elapsed, status, timestamp: Date.now() },
      ...r,
    ]);
  }
  function resetTimer() {
    setRunning(false);
    setStopped(false);
    setElapsed(0);
  }

  // ── Record management ──
  function deleteRecord(id) {
    setRecords(r => r.filter(x => x.id !== id));
    setSelectedRows(s => { const n = new Set(s); n.delete(id); return n; });
  }
  function deleteSelected() {
    setRecords(r => r.filter(x => !selectedRows.has(x.id)));
    setSelectedRows(new Set());
  }
  function clearAll() {
    setRecords([]);
    setSelectedRows(new Set());
    setConfirmClear(false);
  }
  function toggleRow(id) {
    setSelectedRows(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSelectedRows(
      selectedRows.size === records.length
        ? new Set()
        : new Set(records.map(r => r.id))
    );
  }

  // ── CSV export ──
  function exportCSV() {
    try {
      const header = ["#", "Speaker", "Speech Type", "Duration (mm:ss)", "Duration (sec)", "Result", "Date & Time"];
      const rows   = records.map((r, i) => [
        records.length - i, r.speaker, r.type,
        formatTime(r.duration), r.duration,
        RESULT_LABEL[r.status], formatDateTime(r.timestamp),
      ]);
      const total   = records.reduce((a, r) => a + r.duration, 0);
      const summary = [
        [], ["Summary"],
        ["Total Sessions", records.length],
        ["Total Time",     formatTime(total)],
        ["Average Time",   formatTime(Math.round(total / records.length))],
        ["Exported",       new Date().toLocaleString("en-SG")],
      ];
      const csv = [...[header], ...rows, ...summary]
        .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))
        .join("\n");
      const a    = document.createElement("a");
      a.href     = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
      a.download = `speech-log-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setExportStatus({ type: "csv", ok: true });
      setTimeout(() => setExportStatus(null), 3000);
    } catch {
      setExportStatus({ type: "csv", ok: false });
      setTimeout(() => setExportStatus(null), 3000);
    }
  }

  // ── TXT export — works on all devices including mobile ──
  function exportTXT() {
    try {
      const total = records.reduce((a, r) => a + r.duration, 0);
      const avg   = records.length ? Math.round(total / records.length) : 0;
      const date  = new Date().toLocaleString("en-SG");
      const line  = "=".repeat(70);
      const thin  = "-".repeat(70);

      const headerLines = [
        line,
        "       SPEECH TIMER LOG  ·  TOASTMASTERS SESSION",
        line,
        `  Exported : ${date}`,
        `  Sessions : ${records.length}   |   Total: ${formatTime(total)}   |   Average: ${formatTime(avg)}`,
        "",
        thin,
        padR("#", 4) + padR("Speaker", 18) + padR("Speech Type", 26) + padR("Duration", 10) + padR("Result", 14) + "Date & Time",
        thin,
      ];

      const rows = records.map((r, i) =>
        padR(String(records.length - i), 4) +
        padR(r.speaker.slice(0, 16), 18) +
        padR(r.type.length > 24 ? r.type.slice(0, 23) + "…" : r.type, 26) +
        padR(formatTime(r.duration), 10) +
        padR(RESULT_LABEL[r.status], 14) +
        formatDateTime(r.timestamp)
      );

      const footerLines = [
        thin,
        "",
        "  SUMMARY",
        thin,
        `  Total Sessions : ${records.length}`,
        `  Total Time     : ${formatTime(total)}`,
        `  Average Time   : ${formatTime(avg)}`,
        "",
        thin,
        "  Generated by Speech Timer · Toastmasters",
        line,
      ];

      const content = [...headerLines, ...rows, ...footerLines].join("\n");
      const a = document.createElement("a");
      a.href  = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8;" }));
      a.download = `speech-log-${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setExportStatus({ type: "txt", ok: true });
      setTimeout(() => setExportStatus(null), 3000);
    } catch {
      setExportStatus({ type: "txt", ok: false });
      setTimeout(() => setExportStatus(null), 3000);
    }
  }

  const allSelected = records.length > 0 && selectedRows.size === records.length;
  const totalTime   = records.reduce((a, r) => a + r.duration, 0);
  const canStart    = !running && !stopped && !!activeSpeaker && (!isCustom || customValid);
  const canStop     = running;
  const canReset    = !running && (stopped || elapsed > 0);

  // ─────────────────────────── RENDER ───────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", fontFamily: "'Inter', system-ui, sans-serif", color: "#1e293b" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .btn { cursor:pointer; border:none; font-family:inherit; transition:filter 0.13s, transform 0.1s; }
        .btn:hover:not(:disabled)  { filter:brightness(0.93); transform:translateY(-1px); }
        .btn:active:not(:disabled) { transform:translateY(0); }
        .btn:disabled { opacity:0.35; cursor:not-allowed; }

        input, select { font-family:inherit; }
        input:focus, select:focus { outline:2px solid #3b82f6; outline-offset:0; }

        /* Speaker chips */
        .chip {
          display:inline-flex; align-items:center; gap:8px;
          padding:12px 20px; border-radius:12px;
          font-size:15px; font-weight:600; cursor:pointer;
          border:2px solid #e2e8f0; background:#fff; color:#334155;
          transition:border-color 0.15s, background 0.15s, color 0.15s, box-shadow 0.15s;
          user-select:none; min-width:80px; justify-content:center;
        }
        .chip:hover { border-color:#93c5fd; color:#1e40af; box-shadow:0 2px 8px rgba(59,130,246,0.12); }
        .chip.active { border-color:#3b82f6; background:#eff6ff; color:#1d4ed8; box-shadow:0 0 0 3px rgba(59,130,246,0.15); }
        .chip .xbtn {
          display:none; width:20px; height:20px; border-radius:50%;
          background:#fee2e2; color:#dc2626; font-size:11px;
          align-items:center; justify-content:center;
          cursor:pointer; flex-shrink:0; border:none; font-family:inherit;
        }
        .chip:hover .xbtn { display:flex; }
        .chip .xbtn:hover  { background:#fca5a5; }

        /* Cards */
        .card { background:#fff; border-radius:16px; box-shadow:0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04); }

        /* Timer block */
        .timer-block { border-radius:16px; border-width:2px; border-style:solid; padding:32px 24px 28px; text-align:center; transition:background 0.4s, border-color 0.4s; }
        .timer-block.flash { animation:flashBg 0.6s ease; }
        @keyframes flashBg { 0%,100%{opacity:1} 30%{opacity:0.5} }

        /* Clock */
        .clock { font-family:'JetBrains Mono',monospace; font-size:clamp(60px,16vw,96px); font-weight:700; letter-spacing:-2px; line-height:1; transition:color 0.4s; }

        /* Progress bar */
        .progress-track { height:8px; border-radius:99px; background:#e2e8f0; position:relative; overflow:visible; margin-top:20px; }
        .progress-fill  { height:100%; border-radius:99px; transition:width 0.2s linear, background 0.4s; }
        .progress-mark  { position:absolute; top:-4px; width:3px; height:16px; border-radius:2px; opacity:0.7; }

        /* Records table */
        .rec-row { display:grid; grid-template-columns:36px 1fr auto auto 36px; gap:0 12px; align-items:center; padding:13px 16px; border-bottom:1px solid #f1f5f9; transition:background 0.1s; }
        .rec-row:last-child { border-bottom:none; }
        .rec-row:hover { background:#f8fafc; }
        .rec-row.sel   { background:#eff6ff; }
        .cb { width:16px; height:16px; accent-color:#3b82f6; cursor:pointer; }

        /* Result tags */
        .tag        { font-size:11px; font-weight:600; padding:3px 8px; border-radius:5px; white-space:nowrap; }
        .tag-green  { background:#dcfce7; color:#15803d; }
        .tag-orange { background:#fef9c3; color:#a16207; }
        .tag-red    { background:#fee2e2; color:#b91c1c; }
        .tag-idle   { background:#f1f5f9; color:#94a3b8; }

        /* Toast */
        .toast { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); padding:11px 22px; border-radius:10px; font-size:13px; font-weight:500; z-index:1000; white-space:nowrap; box-shadow:0 4px 20px rgba(0,0,0,0.12); animation:toastIn 0.3s ease; }
        @keyframes toastIn { from{opacity:0;transform:translateX(-50%) translateY(10px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }

        /* Section label */
        .section-label { font-size:11px; font-weight:600; color:#94a3b8; letter-spacing:0.07em; text-transform:uppercase; margin-bottom:14px; }

        /* Number input — hide spinners */
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
        input[type=number] { -moz-appearance:textfield; }

        /* Responsive */
        @media (min-width:600px) {
          .controls-grid { grid-template-columns:1fr 1fr 1fr !important; }
          .rec-row { padding:13px 20px; }
        }
        @media (max-width:400px) {
          .chip { padding:10px 14px; font-size:14px; }
          .rec-row { grid-template-columns:28px 1fr auto auto 28px; gap:0 8px; padding:11px 12px; }
        }
      `}</style>

      {/* Toast notification */}
      {exportStatus && (
        <div className="toast" style={{
          background: exportStatus.ok ? "#f0fdf4" : "#fef2f2",
          border:     `1px solid ${exportStatus.ok ? "#86efac" : "#fca5a5"}`,
          color:       exportStatus.ok ? "#15803d" : "#b91c1c",
        }}>
          {exportStatus.ok
            ? exportStatus.type === "csv"
              ? "✓ CSV downloaded successfully"
              : "✓ Text file downloaded successfully"
            : `✗ Export failed — please try again`}
        </div>
      )}

      {/* Top bar */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.3px" }}>Speech Timer</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>Toastmasters Session</div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", background: "#f1f5f9", padding: "6px 12px", borderRadius: 8, border: "1px solid #e2e8f0" }}>
            {records.length} logged
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px 60px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ── Setup card ── */}
        <div className="card" style={{ padding: 20 }}>
          <p className="section-label">Session Setup</p>

          {/* Add speaker */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addSpeaker()}
              placeholder="Enter speaker name…"
              style={{ flex: 1, border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "11px 14px", fontSize: 15, color: "#1e293b", background: "#f8fafc" }}
            />
            <button className="btn" onClick={addSpeaker} style={{ padding: "11px 18px", borderRadius: 10, fontSize: 14, fontWeight: 600, background: "#1d4ed8", color: "#fff" }}>
              + Add
            </button>
          </div>

          {/* Speaker chips */}
          {speakers.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
              {speakers.map(s => (
                <div key={s} className={`chip${activeSpeaker === s ? " active" : ""}`} onClick={() => setActiveSpeaker(s)}>
                  {s}
                  <button className="xbtn" onClick={e => { e.stopPropagation(); removeSpeaker(s); }}>✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Speech type dropdown */}
          <select
            value={selectedType}
            onChange={e => {
              setSelectedType(e.target.value);
              setElapsed(0); setRunning(false); setStopped(false);
            }}
            style={{
              width: "100%", border: "1.5px solid #e2e8f0", borderRadius: 10,
              padding: "11px 14px", fontSize: 15, color: "#1e293b", background: "#f8fafc",
              appearance: "none",
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2394a3b8' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat", backgroundPosition: "right 14px center", paddingRight: 40,
            }}
          >
            {Object.entries(SPEECH_TYPES).map(([k, v]) => (
              <option key={k} value={k}>{k} ({v.label})</option>
            ))}
            <option value="Custom Speech">⚙ Custom Speech</option>
          </select>

          {/* Custom timing panel */}
          {isCustom && (
            <div style={{ marginTop: 12, padding: 16, borderRadius: 10, background: "#f8fafc", border: "1.5px solid #e2e8f0" }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 12 }}>
                Enter timing range (minutes)
              </p>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Min · Green
                  </label>
                  <input
                    type="number" min="0.5" step="0.5" placeholder="e.g. 2"
                    value={customMin}
                    onChange={e => { setCustomMin(e.target.value); setElapsed(0); setStopped(false); setRunning(false); }}
                    style={{ width: "100%", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "10px 12px", fontSize: 16, color: "#1e293b", background: "#fff", textAlign: "center", fontWeight: 700 }}
                  />
                </div>
                <div style={{ paddingTop: 28, color: "#94a3b8", fontWeight: 700, fontSize: 20 }}>→</div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Max · Red
                  </label>
                  <input
                    type="number" min="1" step="0.5" placeholder="e.g. 5"
                    value={customMax}
                    onChange={e => { setCustomMax(e.target.value); setElapsed(0); setStopped(false); setRunning(false); }}
                    style={{ width: "100%", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "10px 12px", fontSize: 16, color: "#1e293b", background: "#fff", textAlign: "center", fontWeight: 700 }}
                  />
                </div>
              </div>

              {/* Validation error */}
              {customMin && customMax && !customValid && (
                <p style={{ marginTop: 8, fontSize: 12, color: "#dc2626", fontWeight: 500 }}>
                  ⚠ Max must be greater than Min
                </p>
              )}

              {/* Timing preview when valid */}
              {customValid && (
                <div style={{ display: "flex", gap: 14, marginTop: 12, flexWrap: "wrap" }}>
                  {[
                    { color: "#16a34a", label: `Green  ${formatTime(customMinSec)}` },
                    { color: "#d97706", label: `Amber  ${formatTime(Math.round(customMinSec + (customMaxSec - customMinSec) * 0.75))}` },
                    { color: "#dc2626", label: `Red    ${formatTime(customMaxSec)}` },
                  ].map(({ color, label }) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b" }}>
                      <div style={{ width: 9, height: 9, borderRadius: "50%", background: color, flexShrink: 0 }} />
                      {label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Timing legend for preset types */}
          {!isCustom && (
            <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
              {[
                { color: "#16a34a", label: `Green  ${formatTime(type.min)}` },
                { color: "#d97706", label: `Amber  ${formatTime(type.warning)}` },
                { color: "#dc2626", label: `Red    ${formatTime(type.max)}` },
              ].map(({ color, label }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b" }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
                  {label}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Timer display ── */}
        <div
          className={`timer-block${flash ? " flash" : ""}`}
          style={{ background: st.timerBg, borderColor: st.timerBorder }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 10, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            {activeSpeaker
              ? `▶  ${activeSpeaker}${isCustom && customValid ? `  ·  ${customMin}–${customMax} min` : ""}`
              : "Select a speaker to begin"}
          </div>

          <div className="clock" style={{ color: st.clockColor }}>
            {formatTime(elapsed)}
          </div>

          <div style={{ marginTop: 10, fontSize: 14, fontWeight: 600, color: st.labelColor, minHeight: 22 }}>
            {st.label}
          </div>

          <div className="progress-track">
            <div className="progress-mark" style={{ left: `${minMark * 100}%`,  background: "#22c55e" }} />
            <div className="progress-mark" style={{ left: `${warnMark * 100}%`, background: "#f59e0b" }} />
            <div className="progress-fill" style={{ width: `${progress * 100}%`, background: st.barColor }} />
          </div>
        </div>

        {/* ── Controls ── */}
        <div className="controls-grid" style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
          <button
            className="btn" onClick={startTimer} disabled={!canStart}
            title={isCustom && !customValid ? "Enter valid Min and Max times above" : ""}
            style={{ padding: "15px", borderRadius: 12, fontSize: 15, fontWeight: 700, letterSpacing: "0.02em", background: canStart ? "#16a34a" : "#e2e8f0", color: canStart ? "#fff" : "#94a3b8" }}
          >
            ▶  Start Timer
          </button>
          <button
            className="btn" onClick={stopTimer} disabled={!canStop}
            style={{ padding: "15px", borderRadius: 12, fontSize: 15, fontWeight: 700, letterSpacing: "0.02em", background: canStop ? "#dc2626" : "#e2e8f0", color: canStop ? "#fff" : "#94a3b8" }}
          >
            ■  Stop &amp; Record
          </button>
          <button
            className="btn" onClick={resetTimer} disabled={!canReset}
            style={{ padding: "15px", borderRadius: 12, fontSize: 15, fontWeight: 700, letterSpacing: "0.02em", background: canReset ? "#f1f5f9" : "#e2e8f0", color: canReset ? "#475569" : "#94a3b8", border: canReset ? "1.5px solid #cbd5e1" : "1.5px solid #e2e8f0" }}
          >
            ↺  Reset Timer
          </button>
        </div>

        {/* ── Speech Records ── */}
        {records.length > 0 && (
          <div className="card" style={{ overflow: "hidden" }}>

            {/* Toolbar */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "12px 16px", borderBottom: "1px solid #f1f5f9" }}>
              <input type="checkbox" className="cb" ref={checkboxAllRef} checked={allSelected} onChange={toggleAll} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#475569", flex: 1 }}>
                Speech Records
                <span style={{ fontWeight: 400, color: "#94a3b8", marginLeft: 6 }}>· {records.length}</span>
              </span>

              {/* Bulk delete */}
              {selectedRows.size > 0 && (
                <button className="btn" onClick={deleteSelected} style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "#fef2f2", border: "1px solid #fca5a5", color: "#b91c1c" }}>
                  Delete ({selectedRows.size})
                </button>
              )}

              {/* CSV */}
              <button className="btn" onClick={exportCSV} style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "#eff6ff", border: "1px solid #93c5fd", color: "#1d4ed8", display: "flex", alignItems: "center", gap: 5 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                CSV
              </button>

              {/* TXT */}
              <button className="btn" onClick={exportTXT} style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "#fdf4ff", border: "1px solid #e9d5ff", color: "#7e22ce", display: "flex", alignItems: "center", gap: 5 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="9" y1="13" x2="15" y2="13"/>
                  <line x1="9" y1="17" x2="13" y2="17"/>
                </svg>
                TXT
              </button>

              {/* Clear all */}
              {!confirmClear ? (
                <button className="btn" onClick={() => setConfirmClear(true)} style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "#f8fafc", border: "1px solid #e2e8f0", color: "#64748b" }}>
                  Clear All
                </button>
              ) : (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#dc2626", fontWeight: 500 }}>Sure?</span>
                  <button className="btn" onClick={clearAll} style={{ padding: "5px 10px", borderRadius: 7, fontSize: 12, fontWeight: 600, background: "#dc2626", color: "#fff" }}>Yes</button>
                  <button className="btn" onClick={() => setConfirmClear(false)} style={{ padding: "5px 10px", borderRadius: 7, fontSize: 12, fontWeight: 600, background: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0" }}>No</button>
                </div>
              )}
            </div>

            {/* Column headers */}
            <div style={{ display: "grid", gridTemplateColumns: "36px 1fr auto auto 36px", gap: "0 12px", padding: "7px 16px", borderBottom: "1px solid #f1f5f9", fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              <span /><span>Speaker</span>
              <span style={{ textAlign: "right" }}>Time</span>
              <span>Result</span><span />
            </div>

            {/* Rows */}
            {records.map(r => (
              <div key={r.id} className={`rec-row${selectedRows.has(r.id) ? " sel" : ""}`}>
                <input type="checkbox" className="cb" checked={selectedRows.has(r.id)} onChange={() => toggleRow(r.id)} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1e293b" }}>{r.speaker}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{r.type} · {formatDateTime(r.timestamp)}</div>
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 700, color: "#334155", textAlign: "right", whiteSpace: "nowrap" }}>
                  {formatTime(r.duration)}
                </div>
                <span className={`tag tag-${r.status}`}>{RESULT_LABEL[r.status]}</span>
                <button className="btn" onClick={() => deleteRecord(r.id)} title="Delete" style={{ width: 28, height: 28, borderRadius: 7, background: "#fef2f2", border: "1px solid #fca5a5", color: "#dc2626", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  ✕
                </button>
              </div>
            ))}

            {/* Summary footer */}
            <div style={{ display: "flex", gap: 24, padding: "12px 16px", borderTop: "1px solid #f1f5f9", background: "#f8fafc", fontSize: 13, color: "#64748b", flexWrap: "wrap" }}>
              <span>Total <strong style={{ color: "#334155" }}>{formatTime(totalTime)}</strong></span>
              <span>Avg <strong style={{ color: "#334155" }}>{formatTime(Math.round(totalTime / records.length))}</strong></span>
              <span>Sessions <strong style={{ color: "#334155" }}>{records.length}</strong></span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
