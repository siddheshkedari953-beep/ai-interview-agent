import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';

export function ResumeInsights({ resume }) {
  const a = resume.analysis;
  const [jd, setJd] = useState('');
  const [m, setM] = useState(null);
  const [err, setErr] = useState('');
  const run = async () => {
    setErr('');
    try { setM(await api('/resume/match', { method: 'POST', body: { jobDescription: jd } })); } catch (x) { setErr(x.message); }
  };
  const Chips = ({ list, cls }) => list.map((s) => <span key={s} className={'chip ' + (cls || '')}>{s}</span>);
  return (
    <div className="card">
      <h3>📊 Resume analysis <span className="mut">(built-in NLP engine, no AI)</span></h3>
      <div className="row">
        <div className="stat"><div className="score">{a.ats.score}</div><span className="mut">ATS score / 100</span></div>
        <div style={{ flex: 3 }}>
          {Object.entries(a.ats.breakdown).map(([k, [g, max]]) => (
            <div key={k} className="mut">{k} ({g}/{max})<div className="bar"><i style={{ width: (g / max) * 100 + '%' }} /></div></div>
          ))}
        </div>
      </div>
      <h4>Detected skills</h4>
      {Object.entries(a.skills).map(([cat, list]) => <p key={cat}><b>{cat}:</b> <Chips list={list} /></p>)}
      {a.tips.length > 0 && <><h4>Improvement tips</h4><ul>{a.tips.map((t) => <li key={t}>{t}</li>)}</ul></>}
      <h4>Match against a job description</h4>
      <textarea style={{ minHeight: 90 }} placeholder="Paste a job description here…" value={jd} onChange={(e) => setJd(e.target.value)} />
      <button onClick={run} disabled={jd.trim().length < 20}>Analyse match</button>
      {err && <p className="err">{err}</p>}
      {m && (<div>
        <p>Match score: <b className="ok">{m.match}%</b> (text similarity {m.similarity}%)</p>
        {m.matchedSkills.length > 0 && <p>Matched: <Chips list={m.matchedSkills} /></p>}
        {m.missingSkills.length > 0 && <p>Missing skills: <Chips list={m.missingSkills} cls="bad" /></p>}
        {m.missingKeywords.length > 0 && <p>Missing keywords: <Chips list={m.missingKeywords} cls="bad" /></p>}
      </div>)}
    </div>
  );
}

export function AnswerBox({ value, onChange }) {
  const rec = useRef(null), base = useRef('');
  const [on, setOn] = useState(false);
  const [note, setNote] = useState('');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const toggle = () => {
    if (on) return rec.current?.stop();
    const r = new SR();
    r.lang = 'en-IN'; r.continuous = true; r.interimResults = true;
    base.current = value ? value.trim() + ' ' : '';
    r.onresult = (e) => { let t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; onChange(base.current + t); };
    r.onerror = (e) => { setNote('Voice error: ' + e.error + ' — use Chrome/Edge or type your answer.'); setOn(false); };
    r.onend = () => setOn(false);
    rec.current = r; r.start(); setOn(true); setNote('');
  };
  const words = value.trim() ? value.trim().split(/\s+/).length : 0;
  return (<>
    <textarea value={value} placeholder="Type your answer, or press the mic and speak…" onChange={(e) => onChange(e.target.value)} />
    <div className="row" style={{ alignItems: 'center', marginBottom: 12 }}>
      <span className="mut">{words} words</span>
      {SR ? <button type="button" className="ghost" onClick={toggle}>{on ? '⏹ Stop recording' : '🎤 Answer by voice'}</button>
          : <span className="mut">Voice input not supported in this browser</span>}
    </div>
    {note && <p className="err">{note}</p>}
  </>);
}

export function Stats() {
  const [s, setS] = useState(null);
  useEffect(() => { api('/stats/me').then(setS).catch(() => {}); }, []);
  if (!s || !s.total) return null;
  const W = 600, H = 170, P = 28, n = s.series.length;
  const pts = s.series.map((p, i) => [P + (n > 1 ? (i * (W - 2 * P)) / (n - 1) : (W - 2 * P) / 2), H - P - (p.score / 10) * (H - 2 * P)]);
  return (
    <div className="card">
      <h3>📈 Your progress</h3>
      <div className="row"><div className="stat"><b>{s.total}</b>Completed</div><div className="stat"><b>{s.avg}</b>Average</div><div className="stat"><b>{s.best}</b>Best</div></div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', marginTop: 10 }}>
        {[0, 5, 10].map((v) => { const y = H - P - (v / 10) * (H - 2 * P); return <g key={v}><line x1={P} x2={W - P} y1={y} y2={y} stroke="#334155" /><text x="2" y={y + 4} fill="#94a3b8" fontSize="11">{v}</text></g>; })}
        <polyline fill="none" stroke="#6366f1" strokeWidth="3" points={pts.map((p) => p.join(',')).join(' ')} />
        {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="5" fill="#6366f1"><title>{s.series[i].domain}: {s.series[i].score}</title></circle>)}
      </svg>
      <h4>Average by skill dimension</h4>
      {Object.entries(s.dims).map(([k, v]) => <div key={k} className="mut">{k} ({v}/10)<div className="bar"><i style={{ width: v * 10 + '%' }} /></div></div>)}
    </div>
  );
}
