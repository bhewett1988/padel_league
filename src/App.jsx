import { useState, useEffect, useCallback } from "react";

// ── SUPABASE ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://rlbekoiiigeogumhxxih.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsYmVrb2lpaWdlb2d1bWh4eGloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMzYxNjcsImV4cCI6MjA5NzcxMjE2N30.2AATxMvvMNCYlBL_Hp9ju_5y0mspiWz9oDrZKnjBtzI";

async function sbFetch(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  console.log("sbFetch:", options.method || "GET", url);
  const res = await fetch(url, {
    ...options,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=minimal",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error("sbFetch error:", res.status, errText);
    throw new Error(`${res.status}: ${errText}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function loadMatches() {
  const rows = await sbFetch("matches?select=*&order=id");
  return rows.map(r => ({
    id: r.id,
    t1: [r.t1_p1, r.t1_p2],
    t2: [r.t2_p1, r.t2_p2],
    t1sets: r.t1sets,
    t2sets: r.t2sets,
    isNext: r.is_next,
  }));
}

async function saveScore(id, t1sets, t2sets) {
  await sbFetch(`matches?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({ t1sets, t2sets }),
  });
}

async function setNextMatch(id) {
  // Clear all is_next flags then set the chosen one
  await sbFetch("matches?id=gt.0", {
    method: "PATCH",
    body: JSON.stringify({ is_next: false }),
  });
  await sbFetch(`matches?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({ is_next: true }),
  });
}

const PLAYERS = ["Ben", "Phil", "Mark", "Richard", "Nick", "Paul"];

function generateMatches() {
  const matches = [];
  let id = 1;
  for (let i = 0; i < PLAYERS.length; i++) {
    for (let j = i + 1; j < PLAYERS.length; j++) {
      for (let k = 0; k < PLAYERS.length; k++) {
        for (let l = k + 1; l < PLAYERS.length; l++) {
          const t1 = [PLAYERS[i], PLAYERS[j]];
          const t2 = [PLAYERS[k], PLAYERS[l]];
          if (!t1.some(p => t2.includes(p))) {
            if (!matches.find(m =>
              (m.t1.join() === t1.join() && m.t2.join() === t2.join()) ||
              (m.t1.join() === t2.join() && m.t2.join() === t1.join())
            )) {
              matches.push({ id: id++, t1, t2, t1sets: null, t2sets: null });
            }
          }
        }
      }
    }
  }
  return matches;
}

const ADMIN_PASSWORD = "padel2024";

function calcIndividualTable(matches) {
  const stats = {};
  PLAYERS.forEach(p => { stats[p] = { played: 0, setsWon: 0, setsLost: 0, bonus: 0 }; });
  matches.forEach(m => {
    if (m.t1sets === null || m.t2sets === null) return;
    const t1win = m.t1sets > m.t2sets;
    const t2win = m.t2sets > m.t1sets;
    [...m.t1, ...m.t2].forEach(p => {
      const onT1 = m.t1.includes(p);
      stats[p].played++;
      stats[p].setsWon  += onT1 ? m.t1sets : m.t2sets;
      stats[p].setsLost += onT1 ? m.t2sets : m.t1sets;
      if ((onT1 && t1win) || (!onT1 && t2win)) stats[p].bonus++;
    });
  });
  return PLAYERS.map(p => ({
    name: p, ...stats[p],
    diff: stats[p].setsWon - stats[p].setsLost,
    points: stats[p].setsWon + stats[p].bonus,
  })).sort((a, b) => b.points - a.points || b.diff - a.diff);
}

function calcTeamTable(matches) {
  const teams = {};
  matches.forEach(m => {
    [m.t1, m.t2].forEach(t => {
      const key = [...t].sort().join(" & ");
      if (!teams[key]) teams[key] = { name: key, played: 0, setsWon: 0, setsLost: 0, bonus: 0 };
    });
    if (m.t1sets === null || m.t2sets === null) return;
    const t1key = [...m.t1].sort().join(" & ");
    const t2key = [...m.t2].sort().join(" & ");
    teams[t1key].played++; teams[t1key].setsWon += m.t1sets; teams[t1key].setsLost += m.t2sets;
    if (m.t1sets > m.t2sets) teams[t1key].bonus++;
    teams[t2key].played++; teams[t2key].setsWon += m.t2sets; teams[t2key].setsLost += m.t1sets;
    if (m.t2sets > m.t1sets) teams[t2key].bonus++;
  });
  return Object.values(teams).map(t => ({
    ...t, diff: t.setsWon - t.setsLost, points: t.setsWon + t.bonus,
  })).sort((a, b) => b.points - a.points || b.diff - a.diff);
}

// ── SHARED STYLES ─────────────────────────────────────────────────────────────
const C = {
  gold: "#2979ff", dark: "#0d1b3e", mid: "#0a1628",
  text: "#f0f4ff", muted: "#6b7db3", dim: "#1e2d50",
};

function navBtnStyle(active) {
  return {
    padding: "8px 22px", border: "none", cursor: "pointer",
    fontFamily: "inherit", fontSize: 13, fontWeight: 700,
    letterSpacing: 2, textTransform: "uppercase", borderRadius: 2,
    background: active ? C.gold : "transparent",
    color: active ? C.dark : "#888", transition: "all 0.15s",
  };
}

function Card({ accent, children, style }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: `1px solid ${accent || "rgba(255,255,255,0.08)"}`,
      borderRadius: 4, overflow: "hidden", ...style,
    }}>
      {children}
    </div>
  );
}

function CardHeader({ bg, dark, title, sub }) {
  return (
    <div style={{
      background: bg || C.gold, padding: "10px 14px",
      display: "flex", alignItems: "center", gap: 8,
    }}>
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 2, textTransform: "uppercase", color: dark ? C.dark : C.gold, whiteSpace: "nowrap" }}>{title}</div>
      {sub && <div style={{ fontSize: 10, letterSpacing: 1, color: dark ? "rgba(0,0,0,0.45)" : "rgba(41,121,255,0.55)", whiteSpace: "nowrap", marginLeft: "auto" }}>{sub}</div>}
    </div>
  );
}

function PodiumRow({ rank, name, pts, sub }) {
  const medalBg = rank === 1 ? C.gold : rank === 2 ? "#4a6fa5" : "#0a2a6e";
  const medalFg = "#fff";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
      borderBottom: "1px solid rgba(255,255,255,0.05)",
      background: rank === 1 ? "rgba(41,121,255,0.06)" : "transparent",
    }}>
      <div style={{
        width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, fontWeight: 900, background: medalBg, color: medalFg,
      }}>{rank}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, lineHeight: 1.3, wordBreak: "break-word" }}>{name}</div>
        {sub && <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>{sub}</div>}
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: C.gold }}>{pts}</div>
        <div style={{ fontSize: 9, color: C.muted, letterSpacing: 2, textTransform: "uppercase" }}>pts</div>
      </div>
    </div>
  );
}

function BigBtn({ children, onClick, dim, full }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
        padding: "11px 16px",
        width: full ? "100%" : "auto",
        border: `2px solid ${dim ? "rgba(41,121,255,0.3)" : C.gold}`,
        background: hover ? (dim ? "rgba(41,121,255,0.15)" : C.gold) : "transparent",
        color: hover ? (dim ? "#fff" : C.dark) : (dim ? "rgba(41,121,255,0.6)" : C.gold),
        fontFamily: "inherit", fontSize: 12, fontWeight: 900,
        letterSpacing: 2, textTransform: "uppercase", cursor: "pointer",
        borderRadius: 2, transition: "all 0.15s",
      }}
    >{children}</button>
  );
}

// ── HOME PAGE ─────────────────────────────────────────────────────────────────
function HomePage({ matches, onNav, nextMatchId }) {
  const indiv = calcIndividualTable(matches);
  const teams = calcTeamTable(matches);
  const thisWeek = matches.find(m => m.id === nextMatchId) || matches.find(m => m.t1sets === null && m.t2sets === null) || null;
  const noResults = indiv.every(p => p.played === 0);

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "20px 16px 40px" }}>
      {/* Title */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: C.muted, letterSpacing: 4, textTransform: "uppercase", marginBottom: 4 }}>🎾 Season 2025</div>
        <div style={{ fontSize: 36, fontWeight: 900, lineHeight: 0.95, textTransform: "uppercase", letterSpacing: 2 }}>
          <span style={{ color: C.gold }}>Padel</span> League
        </div>
      </div>

      {/* Match card */}
      <div style={{
        background: "linear-gradient(135deg, rgba(41,121,255,0.1), rgba(41,121,255,0.02))",
        border: "1px solid rgba(41,121,255,0.35)", borderRadius: 4, padding: "14px 16px", marginBottom: 14,
      }}>
        <div style={{ fontSize: 10, letterSpacing: 3, color: C.gold, textTransform: "uppercase", fontWeight: 700, marginBottom: 10 }}>
          ⚡ {thisWeek ? `This Week · Match ${thisWeek.id}` : "This Week"}
        </div>
        {thisWeek ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 900, textTransform: "uppercase", lineHeight: 1.2 }}>{thisWeek.t1[0]}</div>
              <div style={{ fontSize: 9, color: C.muted }}>&</div>
              <div style={{ fontSize: 16, fontWeight: 900, textTransform: "uppercase", lineHeight: 1.2 }}>{thisWeek.t1[1]}</div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: C.gold }}>VS</div>
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 900, textTransform: "uppercase", lineHeight: 1.2 }}>{thisWeek.t2[0]}</div>
              <div style={{ fontSize: 9, color: C.muted }}>&</div>
              <div style={{ fontSize: 16, fontWeight: 900, textTransform: "uppercase", lineHeight: 1.2 }}>{thisWeek.t2[1]}</div>
            </div>
          </div>
        ) : (
          <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "8px 0" }}>All matches complete</div>
        )}
      </div>

      {/* Buttons: Leaderboard + Results side by side, Pick Match below */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <BigBtn onClick={() => onNav("leaderboard")} full>🏆 Leaderboard</BigBtn>
          <BigBtn onClick={() => onNav("results")} dim full>📋 Results</BigBtn>
        </div>
        <BigBtn onClick={() => onNav("pickmatch")} full>📅 Pick Match</BigBtn>
      </div>

      {/* Full individual table */}
      <Card accent="rgba(41,121,255,0.3)" style={{ marginBottom: 12 }}>
        <CardHeader bg={C.gold} dark title="🥇 Individual Standings" sub="" />
        {noResults
          ? <div style={{ padding: "12px", color: C.muted, fontSize: 12 }}>No results yet</div>
          : <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ padding: "6px 10px", fontSize: 10, fontWeight: 900, letterSpacing: 2, textTransform: "uppercase", color: C.muted, borderBottom: "1px solid rgba(255,255,255,0.08)", textAlign: "left" }}>#</th>
                  <th style={{ padding: "6px 10px", fontSize: 10, fontWeight: 900, letterSpacing: 2, textTransform: "uppercase", color: C.muted, borderBottom: "1px solid rgba(255,255,255,0.08)", textAlign: "left" }}>Player</th>
                  <th style={{ padding: "6px 10px", fontSize: 10, fontWeight: 900, letterSpacing: 2, textTransform: "uppercase", color: C.muted, borderBottom: "1px solid rgba(255,255,255,0.08)", textAlign: "right" }}>P</th>
                  <th style={{ padding: "6px 10px", fontSize: 10, fontWeight: 900, letterSpacing: 2, textTransform: "uppercase", color: C.muted, borderBottom: "1px solid rgba(255,255,255,0.08)", textAlign: "right" }}>PPG</th>
                  <th style={{ padding: "6px 10px", fontSize: 10, fontWeight: 900, letterSpacing: 2, textTransform: "uppercase", color: C.gold, borderBottom: "1px solid rgba(255,255,255,0.08)", textAlign: "right" }}>Pts</th>
                </tr>
              </thead>
              <tbody>
                {indiv.map((p, i) => {
                  const bg = i % 2 ? "rgba(255,255,255,0.02)" : "transparent";
                  const cell = { padding: "8px 10px", fontSize: 13, borderBottom: "1px solid rgba(255,255,255,0.04)", background: bg };
                  return (
                    <tr key={p.name}>
                      <td style={{ ...cell, color: i < 3 ? C.gold : C.muted, fontWeight: 900, width: 32 }}>{i + 1}</td>
                      <td style={{ ...cell, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>{p.name}</td>
                      <td style={{ ...cell, textAlign: "right", color: C.muted }}>{p.played}</td>
                      <td style={{ ...cell, textAlign: "right", color: "#aaa", fontSize: 12 }}>{p.played > 0 ? (p.points / p.played).toFixed(1) : "—"}</td>
                      <td style={{ ...cell, textAlign: "right", fontWeight: 900, color: C.gold }}>{p.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
        }
      </Card>

      {/* Top 3 Teams */}
      <Card accent="rgba(255,255,255,0.08)">
        <CardHeader bg="#060f2a" title="🤝 Top 3 Teams" sub="" />
        {noResults
          ? <div style={{ padding: "12px", color: C.muted, fontSize: 12 }}>No results yet</div>
          : teams.slice(0, 3).map((t, i) => (
              <PodiumRow key={t.name} rank={i + 1} name={t.name} pts={t.points} />
            ))
        }
      </Card>
    </div>
  );
}

// ── LEADERBOARD PAGE ──────────────────────────────────────────────────────────
function LeaderboardPage({ matches }) {
  const teams = calcTeamTable(matches);

  const thS = (right) => ({
    padding: "7px 10px", textAlign: right ? "right" : "left",
    fontSize: 10, fontWeight: 900, letterSpacing: 2, textTransform: "uppercase",
    color: C.muted, borderBottom: "1px solid rgba(255,255,255,0.08)",
  });
  const tdS = (alt, right) => ({
    padding: "8px 10px", fontSize: 12, fontWeight: 600,
    textAlign: right ? "right" : "left",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    background: alt ? "rgba(255,255,255,0.02)" : "transparent",
  });

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "20px 16px" }}>
      <div style={{ fontSize: 32, fontWeight: 900, textTransform: "uppercase", letterSpacing: 2, marginBottom: 4 }}>
        <span style={{ color: C.gold }}>Team</span> Leaderboard
      </div>
      <div style={{ fontSize: 11, color: C.muted, letterSpacing: 3, textTransform: "uppercase", marginBottom: 20 }}>
        Season 2025 · 1pt per set + 1 bonus for match win
      </div>
      <Card>
        <CardHeader bg={C.gold} dark title="All Partnerships" sub="15 TEAMS" />
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thS(false)}>#</th>
              <th style={thS(false)}>Partnership</th>
              <th style={thS(true)}>P</th>
              <th style={thS(true)}>Won</th>
              <th style={thS(true)}>Lost</th>
              <th style={thS(true)}>+/-</th>
              <th style={thS(true)}>Bonus</th>
              <th style={{ ...thS(true), color: C.gold }}>Pts</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t, i) => (
              <tr key={t.name}>
                <td style={{ ...tdS(i % 2), color: i < 3 ? C.gold : C.muted, fontWeight: 900, width: 28 }}>{i + 1}</td>
                <td style={{ ...tdS(i % 2), fontWeight: 700, fontSize: 11, textTransform: "uppercase" }}>{t.name}</td>
                <td style={tdS(i % 2, true)}>{t.played}</td>
                <td style={tdS(i % 2, true)}>{t.setsWon}</td>
                <td style={tdS(i % 2, true)}>{t.setsLost}</td>
                <td style={{ ...tdS(i % 2, true), color: t.diff >= 0 ? "#4caf50" : "#e53935" }}>{t.diff > 0 ? `+${t.diff}` : t.diff}</td>
                <td style={tdS(i % 2, true)}>{t.bonus}</td>
                <td style={{ ...tdS(i % 2, true), fontSize: 14, fontWeight: 900, color: C.gold }}>{t.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ── RESULTS PAGE ──────────────────────────────────────────────────────────────
function ResultsPage({ matches, updateScore, nextMatchId, setNextMatchId }) {
  const [authed, setAuthed] = useState(false);
  const [showPwModal, setShowPwModal] = useState(false);
  const [pw, setPw] = useState("");
  const [pwError, setPwError] = useState(false);
  const [saved, setSaved] = useState(false);

  function login() {
    if (pw === ADMIN_PASSWORD) {
      setAuthed(true); setPwError(false); setShowPwModal(false); setPw("");
    } else {
      setPwError(true); setPw("");
    }
  }

  // updateScore comes from props — writes to Supabase

  function saveAll() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const th = (center) => ({
    padding: "8px 10px", textAlign: center ? "center" : "left",
    fontSize: 10, fontWeight: 900, letterSpacing: 2, textTransform: "uppercase",
    color: C.muted, borderBottom: "1px solid rgba(255,255,255,0.08)",
    whiteSpace: "nowrap",
  });

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px" }}>
      {/* Password modal */}
      {showPwModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => { setShowPwModal(false); setPwError(false); setPw(""); }}>
          <div style={{
            background: "#0d1b3e", border: "1px solid rgba(41,121,255,0.2)", borderRadius: 4,
            padding: 32, width: 320, display: "flex", flexDirection: "column", gap: 14,
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: 3, textTransform: "uppercase", color: C.gold }}>Admin Login</div>
            <input
              autoFocus type="password" value={pw} placeholder="Password"
              onChange={e => { setPw(e.target.value); setPwError(false); }}
              onKeyDown={e => e.key === "Enter" && login()}
              style={{
                background: "rgba(255,255,255,0.06)",
                border: `1px solid ${pwError ? "#e53935" : "rgba(255,255,255,0.15)"}`,
                borderRadius: 2, color: C.text, fontFamily: "inherit",
                fontSize: 15, padding: "9px 14px", letterSpacing: 3, outline: "none",
              }}
            />
            {pwError && <div style={{ color: "#e53935", fontSize: 12, letterSpacing: 2 }}>Incorrect password</div>}
            <div style={{ display: "flex", gap: 10 }}>
              <BigBtn onClick={login}>Unlock →</BigBtn>
              <BigBtn onClick={() => { setShowPwModal(false); setPwError(false); setPw(""); }} dim>Cancel</BigBtn>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 36, fontWeight: 900, textTransform: "uppercase", letterSpacing: 2, lineHeight: 1 }}>
            <span style={{ color: C.gold }}>Match</span> Results
          </div>
          <div style={{ fontSize: 11, color: C.muted, letterSpacing: 3, textTransform: "uppercase", marginTop: 4 }}>
            {authed ? "🔓 Admin — editing enabled" : "View only · click Edit Scores to enter results"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {authed
            ? <BigBtn onClick={() => setAuthed(false)} dim>Lock</BigBtn>
            : <BigBtn onClick={() => setShowPwModal(true)}>🔒 Edit Scores</BigBtn>
          }
        </div>
      </div>

      {/* All 45 matches */}
      <Card>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "24px" }} />
            <col />
            <col style={{ width: "40px" }} />
            <col style={{ width: "24px" }} />
            <col style={{ width: "40px" }} />
            <col />
            <col style={{ width: "36px" }} />
          </colgroup>
          <thead>
            <tr>
              <th style={th(true)}>#</th>
              <th style={th(false)}>Team 1</th>
              <th style={th(true)}>S</th>
              <th style={th(true)}></th>
              <th style={th(true)}>S</th>
              <th style={th(false)}>Team 2</th>
              <th style={th(true)}>▶</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m, i) => {
              const has = m.t1sets !== null && m.t2sets !== null;
              const t1w = has && m.t1sets > m.t2sets;
              const t2w = has && m.t2sets > m.t1sets;
              const isNext = m.id === nextMatchId;
              const bg = isNext ? "rgba(41,121,255,0.08)" : i % 2 ? "rgba(255,255,255,0.02)" : "transparent";
              const cell = { padding: "7px 6px", background: bg, borderBottom: "1px solid rgba(255,255,255,0.04)", verticalAlign: "middle" };
              const scoreInput = (field, isWin) => (
                <input
                  value={m[field] ?? ""}
                  onChange={e => updateScore(m.id, field, e.target.value)}
                  placeholder="—"
                  style={{
                    background: "rgba(255,255,255,0.07)",
                    border: `1px solid ${isWin ? "rgba(41,121,255,0.5)" : "rgba(255,255,255,0.12)"}`,
                    borderRadius: 2, color: C.text, fontFamily: "inherit",
                    fontSize: 15, fontWeight: 900, textAlign: "center",
                    padding: "2px 0", width: 34, display: "block", margin: "0 auto",
                  }}
                />
              );
              const scoreView = (val, isWin) => (
                <span style={{ fontSize: 17, fontWeight: 900, color: isWin ? C.gold : has ? "#7a9cc7" : C.dim, display: "block", textAlign: "center" }}>
                  {has ? val : "—"}
                </span>
              );
              return (
                <tr key={m.id}>
                  <td style={{ ...cell, fontSize: 10, color: C.dim, fontWeight: 700, textAlign: "center" }}>{m.id}</td>
                  <td style={{ ...cell, fontSize: 11, fontWeight: t1w ? 800 : 500, color: t1w ? C.gold : C.text, textTransform: "uppercase", letterSpacing: 0.3, lineHeight: 1.3 }}>
                    {m.t1[0]}<br/><span style={{ color: C.dim, fontWeight: 400, fontSize: 9 }}>&</span><br/>{m.t1[1]}
                  </td>
                  <td style={cell}>{authed ? scoreInput("t1sets", t1w) : scoreView(m.t1sets, t1w)}</td>
                  <td style={{ ...cell, textAlign: "center", fontSize: 9, color: C.dim, fontWeight: 700 }}>VS</td>
                  <td style={cell}>{authed ? scoreInput("t2sets", t2w) : scoreView(m.t2sets, t2w)}</td>
                  <td style={{ ...cell, fontSize: 11, fontWeight: t2w ? 800 : 500, color: t2w ? C.gold : C.text, textTransform: "uppercase", letterSpacing: 0.3, lineHeight: 1.3 }}>
                    {m.t2[0]}<br/><span style={{ color: C.dim, fontWeight: 400, fontSize: 9 }}>&</span><br/>{m.t2[1]}
                  </td>
                  <td style={{ ...cell, textAlign: "center" }}>
                    <button
                      onClick={() => setNextMatchId(m.id)}
                      title="Set as next match"
                      style={{
                        width: 20, height: 20, borderRadius: "50%", cursor: "pointer",
                        border: `2px solid ${isNext ? C.gold : "rgba(255,255,255,0.2)"}`,
                        background: isNext ? C.gold : "transparent",
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        transition: "all 0.15s", padding: 0,
                      }}
                    >
                      {isNext && <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.dark, display: "block" }} />}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {authed && (
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 16 }}>
          <BigBtn onClick={saveAll}>💾 Save Results</BigBtn>
          {saved && <span style={{ fontSize: 12, color: "#4caf50", letterSpacing: 2, textTransform: "uppercase", fontWeight: 700 }}>✓ Saved</span>}
        </div>
      )}
    </div>
  );
}


// ── PICK MATCH PAGE ───────────────────────────────────────────────────────────
function PickMatchPage({ matches, setNextMatchId }) {
  const [selected, setSelected] = useState([]);
  const [suggestion, setSuggestion] = useState(null);
  const [confirmed, setConfirmed] = useState(false);

  function togglePlayer(p) {
    setSelected(prev => {
      if (prev.includes(p)) return prev.filter(x => x !== p);
      if (prev.length >= 4) return prev; // max 4
      return [...prev, p];
    });
    setSuggestion(null);
    setConfirmed(false);
  }

  function findMatch() {
    if (selected.length !== 4) return;
    const [a, b, c, d] = selected;
    // All possible pairings of 4 players into 2 teams
    const pairings = [
      { t1: [a, b], t2: [c, d] },
      { t1: [a, c], t2: [b, d] },
      { t1: [a, d], t2: [b, c] },
    ];
    // For each pairing, find the matching match in the list
    const candidates = [];
    pairings.forEach(({ t1, t2 }) => {
      const match = matches.find(m =>
        (m.t1.includes(t1[0]) && m.t1.includes(t1[1]) && m.t2.includes(t2[0]) && m.t2.includes(t2[1])) ||
        (m.t1.includes(t2[0]) && m.t1.includes(t2[1]) && m.t2.includes(t1[0]) && m.t2.includes(t1[1]))
      );
      if (match) candidates.push(match);
    });
    // Filter out already played
    const unplayed = candidates.filter(m => m.t1sets === null && m.t2sets === null);
    const played = candidates.filter(m => m.t1sets !== null && m.t2sets !== null);
    if (unplayed.length > 0) {
      setSuggestion({ match: unplayed[0], allPlayed: false, remaining: unplayed.length });
    } else if (played.length > 0) {
      setSuggestion({ match: played[0], allPlayed: true, remaining: 0 });
    } else {
      setSuggestion(null);
    }
    setConfirmed(false);
  }

  async function confirmMatch() {
    if (!suggestion) return;
    await setNextMatchId(suggestion.match.id);
    setConfirmed(true);
  }

  const th = { padding: "10px 14px", fontSize: 11, fontWeight: 900, letterSpacing: 3, textTransform: "uppercase", color: C.muted, borderBottom: "1px solid rgba(255,255,255,0.08)" };

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "36px 24px" }}>
      <div style={{ fontSize: 42, fontWeight: 900, textTransform: "uppercase", letterSpacing: 2, marginBottom: 4 }}>
        <span style={{ color: C.gold }}>Pick</span> Match
      </div>
      <div style={{ fontSize: 12, color: C.muted, letterSpacing: 3, textTransform: "uppercase", marginBottom: 28 }}>
        Select 4 players — we'll find the next unplayed match
      </div>

      {/* Player selector */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 24 }}>
        {PLAYERS.map(p => {
          const active = selected.includes(p);
          const disabled = !active && selected.length >= 4;
          return (
            <button key={p} onClick={() => !disabled && togglePlayer(p)} style={{
              padding: "14px 10px", border: `2px solid ${active ? C.gold : "rgba(255,255,255,0.1)"}`,
              background: active ? "rgba(41,121,255,0.2)" : "transparent",
              color: disabled ? "rgba(255,255,255,0.2)" : active ? C.gold : C.text,
              fontFamily: "inherit", fontSize: 16, fontWeight: 900,
              letterSpacing: 2, textTransform: "uppercase", cursor: disabled ? "default" : "pointer",
              borderRadius: 2, transition: "all 0.15s",
            }}>{p}</button>
          );
        })}
      </div>

      <div style={{ fontSize: 12, color: selected.length === 4 ? "#4caf50" : C.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>
        {selected.length}/4 players selected
      </div>

      {selected.length === 4 && (
        <BigBtn onClick={findMatch}>🔍 Find Match</BigBtn>
      )}

      {suggestion && (
        <div style={{ marginTop: 28 }}>
          <Card accent={suggestion.allPlayed ? "rgba(255,100,100,0.3)" : "rgba(41,121,255,0.3)"}>
            <CardHeader
              bg={suggestion.allPlayed ? "#3a1a1a" : C.gold}
              dark={!suggestion.allPlayed}
              title={suggestion.allPlayed ? "⚠️ All matches played!" : "✅ Suggested Match"}
              sub={suggestion.allPlayed ? "REPLAYING" : `${suggestion.remaining} UNPLAYED OPTIONS`}
            />
            <div style={{ padding: "20px 18px" }}>
              {suggestion.allPlayed && (
                <div style={{ fontSize: 12, color: "#e57373", letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>
                  These 4 players have played all their matches — suggesting a replay
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
                <div style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 900, textTransform: "uppercase", color: C.gold, lineHeight: 1.2 }}>
                    {suggestion.match.t1[0]}
                  </div>
                  <div style={{ fontSize: 10, color: C.muted }}>& </div>
                  <div style={{ fontSize: 22, fontWeight: 900, textTransform: "uppercase", color: C.gold, lineHeight: 1.2 }}>
                    {suggestion.match.t1[1]}
                  </div>
                </div>
                <div style={{ fontSize: 24, fontWeight: 900, color: C.gold }}>VS</div>
                <div style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 900, textTransform: "uppercase", color: C.gold, lineHeight: 1.2 }}>
                    {suggestion.match.t2[0]}
                  </div>
                  <div style={{ fontSize: 10, color: C.muted }}>&</div>
                  <div style={{ fontSize: 22, fontWeight: 900, textTransform: "uppercase", color: C.gold, lineHeight: 1.2 }}>
                    {suggestion.match.t2[1]}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: C.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>
                Match #{suggestion.match.id}
              </div>
              {confirmed ? (
                <div style={{ fontSize: 14, color: "#4caf50", fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>
                  ✓ Set as this week's match!
                </div>
              ) : (
                <BigBtn onClick={confirmMatch}>📌 Set as Next Match</BigBtn>
              )}
            </div>
          </Card>
        </div>
      )}

      {selected.length === 4 && !suggestion && (
        <div style={{ marginTop: 20, fontSize: 13, color: C.muted }}>
          Tap Find Match to see the suggestion
        </div>
      )}
    </div>
  );
}

// ── APP ROOT ──────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("home");
  const [matches, setMatches] = useState([]);
  const [nextMatchId, setNextMatchId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchMatches = useCallback(async () => {
    try {
      const data = await loadMatches();
      setMatches(data);
      const next = data.find(m => m.isNext);
      if (next) setNextMatchId(next.id);
      else {
        const first = data.find(m => m.t1sets === null && m.t2sets === null);
        if (first) setNextMatchId(first.id);
      }
    } catch (e) {
      console.error("Load error:", e);
      setError(e.message || "Could not connect to database.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMatches(); }, [fetchMatches]);

  async function handleSetNextMatch(id) {
    setNextMatchId(id);
    setMatches(prev => prev.map(m => ({ ...m, isNext: m.id === id })));
    try { await setNextMatch(id); } catch (e) { console.error(e); }
  }

  async function handleUpdateScore(id, field, val) {
    const num = val === "" ? null : parseInt(val);
    if (val !== "" && (isNaN(num) || num < 0 || num > 9)) return;
    setMatches(prev => prev.map(m => m.id === id ? { ...m, [field]: num } : m));
    const updated = matches.map(m => m.id === id ? { ...m, [field]: num } : m).find(m => m.id === id);
    const t1sets = field === "t1sets" ? num : updated.t1sets;
    const t2sets = field === "t2sets" ? num : updated.t2sets;
    try { await saveScore(id, t1sets, t2sets); } catch (e) { console.error(e); }
  }

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#060e24", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "#2979ff", fontSize: 18, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase" }}>Loading...</div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "100vh", background: "#060e24", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, padding: 40 }}>
      <div style={{ color: "#e53935", fontSize: 16, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>Connection Error</div>
      <div style={{ color: "#888", fontSize: 13, fontFamily: "monospace", maxWidth: 600, textAlign: "center" }}>{error}</div>
    </div>
  );

  return (
    <div style={{
      minHeight: "100vh", background: "#060e24", color: C.text,
      fontFamily: "'Barlow Condensed', 'Impact', sans-serif",
      position: "relative",
    }}>
      {/* Diagonal stripe bg */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        background: "repeating-linear-gradient(135deg, transparent, transparent 60px, rgba(41,121,255,0.04) 60px, rgba(41,121,255,0.04) 61px)",
      }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        {/* NAV — hidden on home, slim back-bar on other pages */}
        {page !== "home" && (
          <nav style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0 24px", height: 48,
            background: "rgba(6,14,36,0.97)",
            borderBottom: "1px solid rgba(41,121,255,0.3)",
            position: "sticky", top: 0, zIndex: 100,
          }}>
            <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: 3, color: C.gold, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>🎾</span>
              Padel<span style={{ color: "#fff", fontWeight: 400 }}> League</span>
            </div>
            <button onClick={() => setPage("home")} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 16px", border: `1px solid ${C.gold}`,
              background: "transparent", color: C.gold,
              fontFamily: "inherit", fontSize: 12, fontWeight: 700,
              letterSpacing: 2, textTransform: "uppercase", cursor: "pointer", borderRadius: 2,
            }}>← Home</button>
          </nav>
        )}

        {page === "home"        && <HomePage matches={matches} onNav={setPage} nextMatchId={nextMatchId} />}
        {page === "leaderboard" && <LeaderboardPage matches={matches} />}
        {page === "results"     && <ResultsPage matches={matches} updateScore={handleUpdateScore} nextMatchId={nextMatchId} setNextMatchId={handleSetNextMatch} />}
        {page === "pickmatch"   && <PickMatchPage matches={matches} setNextMatchId={handleSetNextMatch} />}
      </div>
    </div>
  );
}
