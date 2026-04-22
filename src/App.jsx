import { useState, useEffect, useRef } from "react";

const SPEECH_TYPES = {
  "Table Topics": { min: 60, max: 120, warning: 90, label: "1–2 min" },
  "Prepared Speech (5–7 min)": { min: 300, max: 420, warning: 360, label: "5–7 min" },
  "Prepared Speech (7–9 min)": { min: 420, max: 540, warning: 480, label: "7–9 min" },
  "Evaluation": { min: 120, max: 180, warning: 150, label: "2–3 min" },
  "General Evaluator": { min: 180, max: 300, warning: 240, label: "3–5 min" },
};

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatDateTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString("en-SG", { dateStyle: "short", timeStyle: "short" });
}

function getStatus(elapsed, type) {
  const { min, warning, max } = type;
  if (elapsed >= max) return "red";
  if (elapsed >= warning) return "orange";
  if (elapsed >= min) return "green";
  return "idle";
}

const STATUS_CONFIG = {
  idle: { bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.1)", text: "#8a9bb0", label: "WAITING" },
  green: { bg: "rgba(34,197,94,0.12)", border: "#22c55e", text: "#4ade80", label: "MINIMUM REACHED" },
  orange: { bg: "rgba(251,146,60,0.12)", border: "#fb923c", text: "#fdba74", label: "APPROACHING LIMIT" },
  red: { bg: "rgba(239,68,68,0.14)", border: "#ef4444", text: "#f87171", label: "TIME EXCEEDED" },
};

const STATUS_LABELS = { green: "On Time", orange: "Approaching", red: "Exceeded", idle: "Unknown" };

export default function SpeechTimer() {
  const [speakers, setSpeakers] = useState([]);
  const [nameInput, setNameInput] = useState("");
  const [selectedType, setSelectedType] = useState("Table Topics");
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [activeSpeaker, setActiveSpeaker] = useState(null);
  const [records, setRecords] = useState([]);
  const [flash, setFlash] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [exportStatus, setExportStatus] = useState(null);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const intervalRef = useRef(null);
  const startTimeRef = useRef(null);

  const speechType = SPEECH_TYPES[selectedType];
  const status = running || elapsed > 0 ? getStatus(elapsed, speechType) : "idle";
  const sc = STATUS_CONFIG[status];
  const progress = Math.min(elapsed / speechType.max, 1);
  const minMark = speechType.min / speechType.max;
  const warnMark = speechType.warning / speechType.max;

  useEffect(() => {
    if (running) {
      startTimeRef.current = Date.now() - elapsed * 1000;
      intervalRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 250);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [running]);

  const prevStatus = useRef("idle");
  useEffect(() => {
    if (status !== prevStatus.current && status !== "idle") {
      setFlash(status);
      setTimeout(() => setFlash(null), 600);
    }
    prevStatus.current = status;
  }, [status]);

  function addSpeaker() {
    const name = nameInput.trim();
    if (!name || speakers.includes(name)) return;
    setSpeakers((s) => [...s, name]);
    setNameInput("");
  }

  function removeSpeaker(name) {
    setSpeakers((s) => s.filter((x) => x !== name));
    if (activeSpeaker === name) setActiveSpeaker(null);
  }

  function startTimer() {
    if (!activeSpeaker) return;
    setElapsed(0);
    setRunning(true);
  }

  function stopTimer() {
    if (!running) return;
    setRunning(false);
    const duration = elapsed;
    setRecords((r) => [
      { id: Date.now(), speaker: activeSpeaker, type: selectedType, duration, status, timestamp: Date.now() },
      ...r,
    ]);
  }

  function resetTimer() {
    setRunning(false);
    setElapsed(0);
  }

  function deleteRecord(id) {
    setRecords((r) => r.filter((x) => x.id !== id));
    setSelectedRows((s) => { const n = new Set(s); n.delete(id); return n; });
  }

  function deleteSelected() {
    setRecords((r) => r.filter((x) => !selectedRows.has(x.id)));
    setSelectedRows(new Set());
  }

  function clearAll() {
    setRecords([]);
    setSelectedRows(new Set());
    setConfirmClear(false);
  }

  function toggleRow(id) {
    setSelectedRows((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleAll() {
    if (selectedRows.size === records.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(records.map((r) => r.id)));
    }
  }

  function exportToGoogleSheets() {
    try {
      const header = ["#", "Speaker", "Speech Type", "Duration (mm:ss)", "Duration (seconds)", "Result", "Date & Time"];
      const rows = records.map((r, i) => [
        records.length - i,
        r.speaker,
        r.type,
        formatTime(r.duration),
        r.duration,
        STATUS_LABELS[r.status] || r.status,
        formatDateTime(r.timestamp),
      ]);
      const totalSecs = records.reduce((a, r) => a + r.duration, 0);
      const avgSecs = Math.round(totalSecs / records.length);
      const summary = [
        [],
        ["Summary"],
        ["Total Sessions", records.length],
        ["Total Time", formatTime(totalSecs)],
        ["Average Time", formatTime(avgSecs)],
        ["Exported At", new Date().toLocaleString("en-SG")],
      ];

      const csvContent = [header, ...rows, ...summary]
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
        .join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const filename = `speech-log-${new Date().toISOString().slice(0, 10)}.csv`;
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);

      setTimeout(() => window.open("https://sheets.new", "_blank"), 600);
      setExportStatus("success");
      setTimeout(() => setExportStatus(null), 4000);
    } catch (e) {
      setExportStatus("error");
      setTimeout(() => setExportStatus(null), 3000);
    }
  }

  const allSelected = records.length > 0 && selectedRows.size === records.length;
  const someSelected = selectedRows.size > 0 && !allSelected;

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0a0e1a 0%, #111827 60%, #0d1525 100%)",
      fontFamily: "'DM Mono', 'Courier New', monospace",
      color: "#c8d6e8",
      padding: "24px 16px 48px",
      boxSizing: "border-box",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; }
        .flash { animation: flashAnim 0.6s ease-out; }
        @keyframes flashAnim { 0% { opacity:0.3; transform:scale(1.02); } 100% { opacity:1; transform:scale(1); } }
        input, select { outline: none; }
        input::placeholder { color: #3d5068; }
        .btn { cursor:pointer; transition: all 0.15s; border:none; }
        .btn:hover:not(:disabled) { filter: brightness(1.15); transform: translateY(-1px); }
        .btn:active:not(:disabled) { transform: translateY(0); filter: brightness(0.95); }
        .btn:disabled { cursor: not-allowed; opacity: 0.4; }
        .record-row { transition: background 0.15s; }
        .record-row:hover { background: rgba(255,255,255,0.03) !important; }
        .record-row.selected { background: rgba(99,179,237,0.07) !important; }
        .tag-green { color: #4ade80; background: rgba(34,197,94,0.12); padding: 2px 7px; border-radius: 4px; font-size: 10px; white-space:nowrap; }
        .tag-orange { color: #fdba74; background: rgba(251,146,60,0.12); padding: 2px 7px; border-radius: 4px; font-size: 10px; white-space:nowrap; }
        .tag-red { color: #f87171; background: rgba(239,68,68,0.14); padding: 2px 7px; border-radius: 4px; font-size: 10px; white-space:nowrap; }
        .tag-idle { color: #8a9bb0; background: rgba(255,255,255,0.05); padding: 2px 7px; border-radius: 4px; font-size: 10px; }
        .chip-del { opacity: 0; transition: opacity 0.15s; margin-left:5px; cursor:pointer; color:#f87171; font-size:10px; line-height:1; }
        .chip:hover .chip-del { opacity: 1; }
        .checkbox { width:14px; height:14px; accent-color:#63b3ed; cursor:pointer; flex-shrink:0; }
        .slide-in { animation: slideIn 0.3s ease-out; }
        @keyframes slideIn { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
        .toast { animation: toastIn 0.3s ease-out; }
        @keyframes toastIn { from { opacity:0; transform:translateX(-50%) translateY(8px) scale(0.96); } to { opacity:1; transform:translateX(-50%) translateY(0) scale(1); } }
      `}</style>

      {/* Toast */}
      {exportStatus && (
        <div className="toast" style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          padding: "10px 20px", borderRadius: 10, zIndex: 999, fontSize: 12,
          background: exportStatus === "success" ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)",
          border: `1px solid ${exportStatus === "success" ? "#22c55e" : "#ef4444"}`,
          color: exportStatus === "success" ? "#4ade80" : "#f87171",
          whiteSpace: "nowrap", boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}>
          {exportStatus === "success"
            ? "✓ CSV downloaded · Google Sheets opened — use File → Import"
            : "✗ Export failed — please try again"}
        </div>
      )}

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.25em", color: "#3d5068", marginBottom: 6, textTransform: "uppercase" }}>
          Toastmasters // Speech Timer
        </div>
        <h1 style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: "clamp(26px, 6vw, 40px)",
          fontWeight: 800, margin: 0,
          background: "linear-gradient(135deg, #c8d6e8, #6b8fa8)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          letterSpacing: "-0.5px",
        }}>SPEECH TIMER</h1>
      </div>

      <div style={{ maxWidth: 540, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>

        {/* Setup Card */}
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 20 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.2em", color: "#3d5068", marginBottom: 14, textTransform: "uppercase" }}>Session Setup</div>

          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addSpeaker()}
              placeholder="Speaker name..."
              style={{
                flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8, padding: "9px 13px", color: "#c8d6e8", fontSize: 13,
              }}
            />
            <button className="btn" onClick={addSpeaker} style={{
              background: "rgba(99,179,237,0.15)", border: "1px solid rgba(99,179,237,0.3)",
              borderRadius: 8, padding: "9px 16px", color: "#7ec8e3", fontSize: 12, fontFamily: "'DM Mono', monospace",
            }}>+ ADD</button>
          </div>

          {speakers.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
              {speakers.map((s) => (
                <div key={s} className="chip" style={{ display: "inline-flex", alignItems: "center" }}>
                  <button
                    className="btn"
                    onClick={() => setActiveSpeaker(s)}
                    style={{
                      display: "inline-flex", alignItems: "center",
                      padding: "5px 12px", borderRadius: 20, fontSize: 12,
                      background: activeSpeaker === s ? "rgba(99,179,237,0.2)" : "rgba(255,255,255,0.05)",
                      border: activeSpeaker === s ? "1px solid #63b3ed" : "1px solid rgba(255,255,255,0.1)",
                      color: activeSpeaker === s ? "#90cdf4" : "#8a9bb0",
                    }}
                  >
                    {s}
                    <span className="chip-del" onClick={(e) => { e.stopPropagation(); removeSpeaker(s); }}>✕</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          <select
            value={selectedType}
            onChange={(e) => { setSelectedType(e.target.value); resetTimer(); }}
            style={{
              width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8, padding: "9px 13px", color: "#c8d6e8", fontSize: 13,
              fontFamily: "'DM Mono', monospace",
            }}
          >
            {Object.entries(SPEECH_TYPES).map(([k, v]) => (
              <option key={k} value={k} style={{ background: "#111827" }}>{k} ({v.label})</option>
            ))}
          </select>

          <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 11, flexWrap: "wrap" }}>
            <span style={{ color: "#4ade80" }}>● Green {formatTime(speechType.min)}</span>
            <span style={{ color: "#fdba74" }}>● Amber {formatTime(speechType.warning)}</span>
            <span style={{ color: "#f87171" }}>● Red {formatTime(speechType.max)}</span>
          </div>
        </div>

        {/* Timer Display */}
        <div className={flash ? "flash" : ""} style={{
          background: sc.bg, border: `1px solid ${sc.border}`, borderRadius: 20,
          padding: "28px 24px", textAlign: "center",
          transition: "background 0.5s, border 0.5s", position: "relative", overflow: "hidden",
        }}>
          {status !== "idle" && (
            <div style={{
              position: "absolute", inset: 0,
              background: `radial-gradient(ellipse at center, ${sc.border}18 0%, transparent 70%)`,
              pointerEvents: "none",
            }} />
          )}
          <div style={{ fontSize: 11, letterSpacing: "0.2em", color: "#3d5068", marginBottom: 8, textTransform: "uppercase" }}>
            {activeSpeaker ? `▶ ${activeSpeaker}` : "Select a speaker to begin"}
          </div>
          <div style={{
            fontFamily: "'Syne', sans-serif", fontSize: "clamp(56px, 15vw, 88px)",
            fontWeight: 700, color: sc.text, letterSpacing: "-2px", lineHeight: 1, transition: "color 0.4s",
          }}>
            {formatTime(elapsed)}
          </div>
          <div style={{
            marginTop: 10, fontSize: 11, letterSpacing: "0.2em",
            color: sc.text, fontWeight: 500, opacity: status === "idle" ? 0.4 : 1, transition: "color 0.4s",
          }}>
            {sc.label}
          </div>
          <div style={{ marginTop: 18, height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 99, position: "relative", overflow: "visible" }}>
            <div style={{ position: "absolute", left: `${minMark * 100}%`, top: -3, width: 2, height: 12, background: "#4ade80", borderRadius: 1, opacity: 0.7 }} />
            <div style={{ position: "absolute", left: `${warnMark * 100}%`, top: -3, width: 2, height: 12, background: "#fdba74", borderRadius: 1, opacity: 0.7 }} />
            <div style={{
              height: "100%", width: `${progress * 100}%`,
              background: status === "red" ? "#ef4444" : status === "orange" ? "#fb923c" : status === "green" ? "#22c55e" : "rgba(255,255,255,0.15)",
              borderRadius: 99, transition: "width 0.25s linear, background 0.4s",
              boxShadow: status !== "idle" ? `0 0 8px ${sc.border}` : "none",
            }} />
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button className="btn" onClick={startTimer} disabled={running || !activeSpeaker} style={{
            padding: "14px", borderRadius: 12,
            background: running || !activeSpeaker ? "rgba(255,255,255,0.04)" : "rgba(34,197,94,0.18)",
            border: running || !activeSpeaker ? "1px solid rgba(255,255,255,0.07)" : "1px solid #22c55e",
            color: running || !activeSpeaker ? "#3d5068" : "#4ade80",
            fontSize: 13, fontFamily: "'DM Mono', monospace", letterSpacing: "0.1em",
          }}>▶ START</button>
          <button className="btn" onClick={stopTimer} disabled={!running} style={{
            padding: "14px", borderRadius: 12,
            background: !running ? "rgba(255,255,255,0.04)" : "rgba(239,68,68,0.18)",
            border: !running ? "1px solid rgba(255,255,255,0.07)" : "1px solid #ef4444",
            color: !running ? "#3d5068" : "#f87171",
            fontSize: 13, fontFamily: "'DM Mono', monospace", letterSpacing: "0.1em",
          }}>■ STOP</button>
        </div>

        {/* Records */}
        {records.length > 0 && (
          <div className="slide-in" style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 16, overflow: "hidden",
          }}>
            {/* Records toolbar */}
            <div style={{
              padding: "11px 14px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
            }}>
              <input
                type="checkbox"
                className="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected; }}
                onChange={toggleAll}
              />
              <span style={{ fontSize: 10, letterSpacing: "0.15em", color: "#3d5068", textTransform: "uppercase", flex: 1 }}>
                Speech Records · {records.length}
              </span>

              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                {selectedRows.size > 0 && (
                  <button className="btn" onClick={deleteSelected} style={{
                    padding: "5px 10px", borderRadius: 7, fontSize: 11,
                    background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)",
                    color: "#f87171", fontFamily: "'DM Mono', monospace",
                  }}>
                    🗑 Delete ({selectedRows.size})
                  </button>
                )}

                {/* Export to Sheets */}
                <button className="btn" onClick={exportToGoogleSheets} style={{
                  padding: "5px 11px", borderRadius: 7, fontSize: 11,
                  background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.28)",
                  color: "#6ee7b7", fontFamily: "'DM Mono', monospace",
                  display: "inline-flex", alignItems: "center", gap: 5,
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <line x1="3" y1="9" x2="21" y2="9"/>
                    <line x1="3" y1="15" x2="21" y2="15"/>
                    <line x1="9" y1="9" x2="9" y2="21"/>
                  </svg>
                  Export → Sheets
                </button>

                {!confirmClear ? (
                  <button className="btn" onClick={() => setConfirmClear(true)} style={{
                    padding: "5px 10px", borderRadius: 7, fontSize: 11,
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)",
                    color: "#4a6070", fontFamily: "'DM Mono', monospace",
                  }}>Clear All</button>
                ) : (
                  <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    <span style={{ fontSize: 10, color: "#f87171" }}>Sure?</span>
                    <button className="btn" onClick={clearAll} style={{
                      padding: "4px 8px", borderRadius: 6, fontSize: 11,
                      background: "rgba(239,68,68,0.2)", border: "1px solid #ef4444",
                      color: "#f87171", fontFamily: "'DM Mono', monospace",
                    }}>Yes</button>
                    <button className="btn" onClick={() => setConfirmClear(false)} style={{
                      padding: "4px 8px", borderRadius: 6, fontSize: 11,
                      background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                      color: "#8a9bb0", fontFamily: "'DM Mono', monospace",
                    }}>No</button>
                  </div>
                )}
              </div>
            </div>

            {/* Column labels */}
            <div style={{
              display: "grid", gridTemplateColumns: "20px 1fr auto auto 28px",
              gap: "0 10px", padding: "6px 14px",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
              fontSize: 9, letterSpacing: "0.15em", color: "#2d3f52", textTransform: "uppercase",
            }}>
              <span/>
              <span>Speaker</span>
              <span style={{ textAlign: "right" }}>Time</span>
              <span>Result</span>
              <span/>
            </div>

            {/* Record rows */}
            {records.map((r, i) => {
              const isSelected = selectedRows.has(r.id);
              return (
                <div
                  key={r.id}
                  className={`record-row${isSelected ? " selected" : ""}`}
                  style={{
                    display: "grid", gridTemplateColumns: "20px 1fr auto auto 28px",
                    gap: "0 10px", alignItems: "center",
                    padding: "10px 14px",
                    borderBottom: i < records.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                  }}
                >
                  <input type="checkbox" className="checkbox" checked={isSelected} onChange={() => toggleRow(r.id)} />
                  <div>
                    <div style={{ color: "#c8d6e8", fontWeight: 500, fontSize: 13 }}>{r.speaker}</div>
                    <div style={{ color: "#3d5068", fontSize: 10, marginTop: 2 }}>
                      {r.type} · {formatDateTime(r.timestamp)}
                    </div>
                  </div>
                  <div style={{
                    fontFamily: "'Syne', sans-serif", fontWeight: 700,
                    fontSize: 15, color: "#8a9bb0", textAlign: "right", whiteSpace: "nowrap",
                  }}>
                    {formatTime(r.duration)}
                  </div>
                  <span className={`tag-${r.status}`}>{STATUS_LABELS[r.status]}</span>
                  <button
                    className="btn"
                    onClick={() => deleteRecord(r.id)}
                    title="Delete"
                    style={{
                      width: 24, height: 24, borderRadius: 6, padding: 0,
                      background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)",
                      color: "#f87171", fontSize: 11,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >✕</button>
                </div>
              );
            })}

            {/* Summary */}
            <div style={{
              padding: "10px 14px", background: "rgba(255,255,255,0.02)",
              borderTop: "1px solid rgba(255,255,255,0.06)",
              display: "flex", gap: 20, fontSize: 11, color: "#4a6070", flexWrap: "wrap",
            }}>
              <span>Total <span style={{ color: "#8a9bb0" }}>{formatTime(records.reduce((a, r) => a + r.duration, 0))}</span></span>
              <span>Avg <span style={{ color: "#8a9bb0" }}>{formatTime(Math.round(records.reduce((a, r) => a + r.duration, 0) / records.length))}</span></span>
              <span>Sessions <span style={{ color: "#8a9bb0" }}>{records.length}</span></span>
            </div>

            {/* Export hint */}
            <div style={{
              padding: "7px 14px", borderTop: "1px solid rgba(255,255,255,0.03)",
              fontSize: 10, color: "#253545", textAlign: "center",
            }}>
              Export downloads .csv · Google Sheets opens automatically → File → Import to load
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
