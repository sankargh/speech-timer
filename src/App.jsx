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

const STATUS = {
  idle:   { timerBg: "#f8fafc", timerBorder: "#e2e8f0", clockColor: "#94a3b8", labelColor: "#94a3b8",  label: "Waiting to start",   barColor: "#cbd5e1" },
  green:  { timerBg: "#f0fdf4", timerBorder: "#86efac", clockColor: "#15803d", labelColor: "#16a34a",  label: "✓ Minimum reached",   barColor: "#22c55e" },
  orange: { timerBg: "#fffbeb", timerBorder: "#fcd34d", clockColor: "#b45309", labelColor: "#d97706",  label: "⚠ Approaching limit", barColor: "#f59e0b" },
  red:    { timerBg: "#fef2f2", timerBorder: "#fca5a5", clockColor: "#b91c1c", labelColor: "#dc2626",  label: "✕ Time exceeded",      barColor: "#ef4444" },
};

const RESULT_LABEL = { green: "On Time", orange: "Approaching", red: "Exceeded", idle: "—" };

export default function SpeechTimer() {
  const [speakers,      setSpeakers]      = useState([]);
  const [nameInput,     setNameInput]     = useState("");
  const [selectedType,  setSelectedType]  = useState("Table Topics");
  const [running,       setRunning]       = useState(false);
  const [elapsed,       setElapsed]       = useState(0);
  const [activeSpeaker, setActiveSpeaker] = useState(null);
  const [records,       setRecords]       = useState([]);
  const [confirmClear,  setConfirmClear]  = useState(false);
  const [exportStatus,  setExportStatus]  = useState(null);
  const [selectedRows,  setSelectedRows]  = useState(new Set());
  const [flash,         setFlash]         = useState(false);

  const intervalRef    = useRef(null);
  const startRef       = useRef(null);
  const prevStatusRef  = useRef("idle");
  const checkboxAllRef = useRef(null);

  const type     = SPEECH_TYPES[selectedType];
  const status   = running || elapsed > 0 ? getStatus(elapsed, type) : "idle";
  const st       = STATUS[status];
  const progress = Math.min(elapsed / type.max, 1);
  const minMark  = type.min / type.max;
  const warnMark = type.warning / type.max;

  // Timer tick
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

  // Flash on status change
  useEffect(() => {
    if (status !== prevStatusRef.current && status !== "idle") {
      setFlash(true);
      setTimeout(() => setFlash(false), 600);
    }
    prevStatusRef.current = status;
  }, [status]);

  // Indeterminate checkbox
  useEffect(() => {
    if (checkboxAllRef.current) {
      checkboxAllRef.current.indeterminate =
        selectedRows.size > 0 && selectedRows.size < records.length;
    }
  }, [selectedRows, records]);

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

  function startTimer() {
    if (!activeSpeaker || running) return;
    setElapsed(0);
    setRunning(true);
  }

  function stopTimer() {
    if (!running) return;
    setRunning(false);
    setRecords(r => [
      { id: Date.now(), speaker: activeSpeaker, type: selectedType,
        duration: elapsed, status, timestamp: Date.now() },
      ...r,
    ]);
  }

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

  function exportToSheets() {
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
      a.click();
      setTimeout(() => window.open("https://sheets.new", "_blank"), 500);
      setExportStatus("success");
      setTimeout(() => setExportStatus(null), 4000);
    } catch {
      setExportStatus("error");
      setTimeout(() => setExportStatus(null), 3000);
    }
  }

  const allSelected  = records.length > 0 && selectedRows.size === records.length;
  const totalTime    = records.reduce((a, r) => a + r.duration, 0);

  /* ─── render ─────────────────────────────────────────────────── */
  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", fontFamily: "'Inter', system-ui, sans-serif", color: "#1e293b" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        /* ── buttons ── */
        .btn { cursor: pointer; border: none; font-family: inherit; transition: background 0.14s, box-shadow 0.14s, transform 0.1s; }
        .btn:hover:not(:disabled) { filter: brightness(0.95); transform: translateY(-1px); }
        .btn:active:not(:disabled){ transform: translateY(0); }
        .btn:disabled { opacity: 0.38; cursor: not-allowed; }

        /* ── inputs ── */
        input, select { font-family: inherit; }
        input:focus, select:focus { outline: 2px solid #3b82f6; outline-offset: 0; }

        /* ── speaker chips ── */
        .chip {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 12px 20px;
          border-radius: 12px;
          font-size: 15px; font-weight: 600;
          cursor: pointer;
          border: 2px solid #e2e8f0;
          background: #ffffff;
          color: #334155;
          transition: border-color 0.15s, background 0.15s, color 0.15s, box-shadow 0.15s;
          user-select: none;
          line-height: 1.2;
          min-width: 80px;
          justify-content: center;
        }
        .chip:hover { border-color: #93c5fd; color: #1e40af; box-shadow: 0 2px 8px rgba(59,130,246,0.12); }
        .chip.active { border-color: #3b82f6; background: #eff6ff; color: #1d4ed8; box-shadow: 0 0 0 3px rgba(59,130,246,0.15); }
        .chip .xbtn {
          display: none; width: 20px; height: 20px; border-radius: 50%;
          background: #fee2e2; color: #dc2626; font-size: 11px;
          align-items: center; justify-content: center;
          cursor: pointer; flex-shrink: 0; border: none; font-family: inherit;
          transition: background 0.12s;
        }
        .chip:hover .xbtn { display: flex; }
        .chip .xbtn:hover { background: #fca5a5; }

        /* ── card ── */
        .card { background: #ffffff; border-radius: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04); }

        /* ── timer block ── */
        .timer-block {
          border-radius: 16px;
          border-width: 2px; border-style: solid;
          padding: 32px 24px 28px;
          text-align: center;
          transition: background 0.4s, border-color 0.4s;
        }
        .timer-block.flash { animation: flashBg 0.6s ease; }
        @keyframes flashBg {
          0%   { opacity: 1; }
          30%  { opacity: 0.55; }
          100% { opacity: 1; }
        }

        /* ── clock digits ── */
        .clock {
          font-family: 'JetBrains Mono', monospace;
          font-size: clamp(64px, 18vw, 100px);
          font-weight: 700;
          letter-spacing: -2px;
          line-height: 1;
          transition: color 0.4s;
        }

        /* ── progress bar ── */
        .progress-track {
          height: 8px; border-radius: 99px;
          background: #e2e8f0;
          position: relative; overflow: visible; margin-top: 20px;
        }
        .progress-fill {
          height: 100%; border-radius: 99px;
          transition: width 0.2s linear, background 0.4s;
        }
        .progress-mark {
          position: absolute; top: -4px;
          width: 3px; height: 16px; border-radius: 2px; opacity: 0.7;
        }

        /* ── records table ── */
        .rec-row {
          display: grid;
          grid-template-columns: 36px 1fr auto auto 36px;
          gap: 0 12px; align-items: center;
          padding: 13px 16px;
          border-bottom: 1px solid #f1f5f9;
          transition: background 0.1s;
        }
        .rec-row:last-child  { border-bottom: none; }
        .rec-row:hover       { background: #f8fafc; }
        .rec-row.sel         { background: #eff6ff; }
        .cb { width: 16px; height: 16px; accent-color: #3b82f6; cursor: pointer; }

        /* ── result tags ── */
        .tag { font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 5px; white-space: nowrap; }
        .tag-green  { background: #dcfce7; color: #15803d; }
        .tag-orange { background: #fef9c3; color: #a16207; }
        .tag-red    { background: #fee2e2; color: #b91c1c; }
        .tag-idle   { background: #f1f5f9; color: #94a3b8; }

        /* ── toast ── */
        .toast {
          position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
          padding: 11px 22px; border-radius: 10px; font-size: 13px; font-weight: 500;
          z-index: 1000; white-space: nowrap;
          box-shadow: 0 4px 20px rgba(0,0,0,0.12);
          animation: toastIn 0.3s ease;
        }
        @keyframes toastIn {
          from { opacity:0; transform: translateX(-50%) translateY(10px); }
          to   { opacity:1; transform: translateX(-50%) translateY(0); }
        }

        /* ── section label ── */
        .section-label {
          font-size: 11px; font-weight: 600; color: #94a3b8;
          letter-spacing: 0.07em; text-transform: uppercase; margin-bottom: 14px;
        }

        /* ── responsive ── */
        @media (min-width: 640px) {
          .controls-grid { grid-template-columns: 1fr 1fr !important; }
          .rec-row { padding: 13px 20px; }
        }
        @media (max-width: 400px) {
          .chip { padding: 10px 14px; font-size: 14px; }
          .rec-row { grid-template-columns: 28px 1fr auto auto 28px; gap: 0 8px; padding: 11px 12px; }
        }
      `}</style>

      {/* ── Toast ── */}
      {exportStatus && (
        <div className="toast" style={{
          background: exportStatus === "success" ? "#f0fdf4" : "#fef2f2",
          border:     `1px solid ${exportStatus === "success" ? "#86efac" : "#fca5a5"}`,
          color:       exportStatus === "success" ? "#15803d" : "#b91c1c",
        }}>
          {exportStatus === "success"
            ? "✓ CSV downloaded · Google Sheets opened → File → Import to load"
            : "✗ Export failed — please try again"}
        </div>
      )}

      {/* ── Top bar ── */}
      <div style={{ background: "#ffffff", borderBottom: "1px solid #e2e8f0" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.3px" }}>
              Speech Timer
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>Toastmasters Session</div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", background: "#f1f5f9", padding: "6px 12px", borderRadius: 8, border: "1px solid #e2e8f0" }}>
            {records.length} logged
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px 60px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ── Setup card ── */}
        <div className="card" style={{ padding: "20px" }}>
          <p className="section-label">Session Setup</p>

          {/* Add speaker input */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addSpeaker()}
              placeholder="Enter speaker name…"
              style={{
                flex: 1, border: "1.5px solid #e2e8f0", borderRadius: 10,
                padding: "11px 14px", fontSize: 15, color: "#1e293b",
                background: "#f8fafc",
              }}
            />
            <button className="btn" onClick={addSpeaker} style={{
              padding: "11px 18px", borderRadius: 10, fontSize: 14, fontWeight: 600,
              background: "#1d4ed8", color: "#fff",
              boxShadow: "0 1px 4px rgba(29,78,216,0.2)",
            }}>
              + Add
            </button>
          </div>

          {/* Speaker chips */}
          {speakers.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
              {speakers.map(s => (
                <div
                  key={s}
                  className={`chip${activeSpeaker === s ? " active" : ""}`}
                  onClick={() => setActiveSpeaker(s)}
                >
                  {s}
                  <button
                    className="xbtn"
                    onClick={e => { e.stopPropagation(); removeSpeaker(s); }}
                    title="Remove speaker"
                  >✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Speech type select */}
          <select
            value={selectedType}
            onChange={e => { setSelectedType(e.target.value); setElapsed(0); setRunning(false); }}
            style={{
              width: "100%", border: "1.5px solid #e2e8f0", borderRadius: 10,
              padding: "11px 14px", fontSize: 15, color: "#1e293b",
              background: "#f8fafc", appearance: "none",
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2394a3b8' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat", backgroundPosition: "right 14px center",
              paddingRight: 40,
            }}
          >
            {Object.entries(SPEECH_TYPES).map(([k, v]) => (
              <option key={k} value={k}>{k} ({v.label})</option>
            ))}
          </select>

          {/* Time legend */}
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
        </div>

        {/* ── Timer display ── */}
        <div
          className={`timer-block${flash ? " flash" : ""}`}
          style={{ background: st.timerBg, borderColor: st.timerBorder }}
        >
          {/* Active speaker */}
          <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 10, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            {activeSpeaker
              ? `▶  ${activeSpeaker}`
              : "Select a speaker to begin"}
          </div>

          {/* Clock */}
          <div className="clock" style={{ color: st.clockColor }}>
            {formatTime(elapsed)}
          </div>

          {/* Status label */}
          <div style={{ marginTop: 10, fontSize: 14, fontWeight: 600, color: st.labelColor, minHeight: 22 }}>
            {status !== "idle" ? st.label : ""}
          </div>

          {/* Progress bar */}
          <div className="progress-track">
            <div className="progress-mark" style={{ left: `${minMark * 100}%`,  background: "#22c55e" }} />
            <div className="progress-mark" style={{ left: `${warnMark * 100}%`, background: "#f59e0b" }} />
            <div
              className="progress-fill"
              style={{ width: `${progress * 100}%`, background: st.barColor }}
            />
          </div>
        </div>

        {/* ── Start / Stop buttons ── */}
        <div className="controls-grid" style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
          <button
            className="btn"
            onClick={startTimer}
            disabled={running || !activeSpeaker}
            style={{
              padding: "15px", borderRadius: 12, fontSize: 15, fontWeight: 700,
              background: running || !activeSpeaker ? "#e2e8f0" : "#16a34a",
              color:      running || !activeSpeaker ? "#94a3b8"  : "#ffffff",
              letterSpacing: "0.02em",
            }}
          >
            ▶  Start Timer
          </button>
          <button
            className="btn"
            onClick={stopTimer}
            disabled={!running}
            style={{
              padding: "15px", borderRadius: 12, fontSize: 15, fontWeight: 700,
              background: !running ? "#e2e8f0" : "#dc2626",
              color:      !running ? "#94a3b8"  : "#ffffff",
              letterSpacing: "0.02em",
            }}
          >
            ■  Stop & Record
          </button>
        </div>

        {/* ── Speech Records ── */}
        {records.length > 0 && (
          <div className="card" style={{ overflow: "hidden" }}>

            {/* Records toolbar */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
              padding: "12px 16px", borderBottom: "1px solid #f1f5f9",
            }}>
              <input
                type="checkbox"
                className="cb"
                ref={checkboxAllRef}
                checked={allSelected}
                onChange={toggleAll}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#475569", flex: 1 }}>
                Speech Records
                <span style={{ fontWeight: 400, color: "#94a3b8", marginLeft: 6 }}>· {records.length}</span>
              </span>

              {/* Bulk delete */}
              {selectedRows.size > 0 && (
                <button className="btn" onClick={deleteSelected} style={{
                  padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: "#fef2f2", border: "1px solid #fca5a5", color: "#b91c1c",
                }}>
                  Delete ({selectedRows.size})
                </button>
              )}

              {/* Export */}
              <button className="btn" onClick={exportToSheets} style={{
                padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: "#f0fdf4", border: "1px solid #86efac", color: "#15803d",
                display: "flex", alignItems: "center", gap: 5,
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <line x1="3" y1="9" x2="21" y2="9"/>
                  <line x1="3" y1="15" x2="21" y2="15"/>
                  <line x1="9" y1="9" x2="9" y2="21"/>
                </svg>
                Export to Sheets
              </button>

              {/* Clear all */}
              {!confirmClear ? (
                <button className="btn" onClick={() => setConfirmClear(true)} style={{
                  padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: "#f8fafc", border: "1px solid #e2e8f0", color: "#64748b",
                }}>
                  Clear All
                </button>
              ) : (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#dc2626", fontWeight: 500 }}>Sure?</span>
                  <button className="btn" onClick={clearAll} style={{
                    padding: "5px 10px", borderRadius: 7, fontSize: 12, fontWeight: 600,
                    background: "#dc2626", color: "#fff",
                  }}>Yes</button>
                  <button className="btn" onClick={() => setConfirmClear(false)} style={{
                    padding: "5px 10px", borderRadius: 7, fontSize: 12, fontWeight: 600,
                    background: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0",
                  }}>No</button>
                </div>
              )}
            </div>

            {/* Column headers */}
            <div style={{
              display: "grid", gridTemplateColumns: "36px 1fr auto auto 36px",
              gap: "0 12px", padding: "7px 16px",
              borderBottom: "1px solid #f1f5f9",
              fontSize: 11, fontWeight: 600, color: "#94a3b8",
              textTransform: "uppercase", letterSpacing: "0.06em",
            }}>
              <span />
              <span>Speaker</span>
              <span style={{ textAlign: "right" }}>Time</span>
              <span>Result</span>
              <span />
            </div>

            {/* Rows */}
            {records.map(r => (
              <div
                key={r.id}
                className={`rec-row${selectedRows.has(r.id) ? " sel" : ""}`}
              >
                <input
                  type="checkbox"
                  className="cb"
                  checked={selectedRows.has(r.id)}
                  onChange={() => toggleRow(r.id)}
                />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1e293b" }}>{r.speaker}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                    {r.type} · {formatDateTime(r.timestamp)}
                  </div>
                </div>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 16, fontWeight: 700, color: "#334155",
                  textAlign: "right", whiteSpace: "nowrap",
                }}>
                  {formatTime(r.duration)}
                </div>
                <span className={`tag tag-${r.status}`}>
                  {RESULT_LABEL[r.status]}
                </span>
                <button
                  className="btn"
                  onClick={() => deleteRecord(r.id)}
                  title="Delete record"
                  style={{
                    width: 28, height: 28, borderRadius: 7,
                    background: "#fef2f2", border: "1px solid #fca5a5",
                    color: "#dc2626", fontSize: 13,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >✕</button>
              </div>
            ))}

            {/* Summary footer */}
            <div style={{
              display: "flex", gap: 24, padding: "12px 16px",
              borderTop: "1px solid #f1f5f9",
              background: "#f8fafc",
              fontSize: 13, color: "#64748b", flexWrap: "wrap",
            }}>
              <span>Total <strong style={{ color: "#334155" }}>{formatTime(totalTime)}</strong></span>
              <span>Avg <strong style={{ color: "#334155" }}>{formatTime(Math.round(totalTime / records.length))}</strong></span>
              <span>Sessions <strong style={{ color: "#334155" }}>{records.length}</strong></span>
            </div>

            {/* Export hint */}
            <div style={{ padding: "8px 16px", fontSize: 11, color: "#cbd5e1", textAlign: "center", borderTop: "1px solid #f1f5f9" }}>
              Export downloads a .csv file · Google Sheets opens automatically · use File → Import to load
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
