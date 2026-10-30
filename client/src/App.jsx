import { createContext, useContext, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { api } from './api.js';
import { ResumeInsights, AnswerBox, Stats } from './extras.jsx';

const Ctx = createContext();
const useAuth = () => useContext(Ctx);
const DOMAINS = ['MERN', 'Java', 'Python', 'Data Structures', 'SQL & Databases', 'Cloud Computing', 'HR / Behavioural'];
const date = (d) => new Date(d).toLocaleString();

function Provider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const refresh = async () => {
    try { setUser((await api('/auth/me')).user); } catch { setUser(null); }
    setReady(true);
  };
  useEffect(() => { refresh(); }, []);
  const logout = () => { localStorage.removeItem('token'); setUser(null); };
  return <Ctx.Provider value={{ user, refresh, logout }}>{ready ? children : <p className="c">Loading…</p>}</Ctx.Provider>;
}

function Guard({ children, admin }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  if (admin && user.role !== 'admin') return <Navigate to="/" />;
  return children;
}

function Nav() {
  const { user, logout } = useAuth();
  return (
    <nav>
      <Link to="/" className="brand">🤖 AI Interview Agent</Link>
      {user ? (<>
        <Link to="/">Dashboard</Link><Link to="/history">History</Link>
        {user.role === 'admin' && <Link to="/admin">Admin</Link>}
        <span className="mut">{user.name}{user.premium && ' ⭐'}</span>
        <button className="ghost" onClick={logout}>Logout</button>
      </>) : (<><Link to="/login">Login</Link><Link to="/register">Register</Link></>)}
    </nav>
  );
}

function AuthPage({ mode }) {
  const nav = useNavigate();
  const { refresh } = useAuth();
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    try {
      const d = await api('/auth/' + mode, { method: 'POST', body: f });
      localStorage.setItem('token', d.token); await refresh(); nav('/');
    } catch (x) { setErr(x.message); }
  };
  return (
    <form className="card auth" onSubmit={submit}>
      <h2>{mode === 'login' ? 'Login' : 'Create account'}</h2>
      {mode === 'register' && <input placeholder="Full name" value={f.name} onChange={set('name')} required />}
      <input type="email" placeholder="Email" value={f.email} onChange={set('email')} required />
      <input type="password" placeholder="Password (min 6 chars)" value={f.password} onChange={set('password')} required />
      {err && <p className="err">{err}</p>}
      <button style={{ width: '100%' }}>{mode === 'login' ? 'Login' : 'Register'}</button>
    </form>
  );
}

const loadRzp = () => new Promise((ok, fail) => {
  if (window.Razorpay) return ok();
  const s = document.createElement('script');
  s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.onload = ok; s.onerror = fail; document.body.appendChild(s);
});

function Dashboard() {
  const nav = useNavigate();
  const { user, refresh } = useAuth();
  const [resume, setResume] = useState(null);
  const [domain, setDomain] = useState(DOMAINS[0]);
  const [msg, setMsg] = useState({ t: '', ok: true });
  const [busy, setBusy] = useState(false);
  const say = (t, ok = false) => setMsg({ t, ok });
  useEffect(() => { api('/resume/latest').then(setResume).catch(() => {}); }, []);

  const upload = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const form = new FormData(); form.append('resume', file);
    setBusy(true); say('');
    try { setResume(await api('/resume', { method: 'POST', form })); say('Resume uploaded and analysed ✔', true); }
    catch (x) { say(x.message); }
    setBusy(false); e.target.value = '';
  };
  const start = async () => {
    setBusy(true); say('AI is preparing your personalised questions… (10-30s)', true);
    try { nav('/interview/' + (await api('/interviews/start', { method: 'POST', body: { domain } })).id); }
    catch (x) { say(x.message); setBusy(false); }
  };
  const upgrade = async () => {
    try {
      const o = await api('/payment/order', { method: 'POST' });
      if (o.mock) { await api('/payment/verify', { method: 'POST', body: { orderId: o.orderId } }); await refresh(); return say('Premium activated (mock payment) ✔', true); }
      await loadRzp();
      new window.Razorpay({
        key: o.keyId, amount: o.amount, currency: 'INR', order_id: o.orderId, name: 'AI Interview Agent', description: 'Premium access',
        handler: async (r) => {
          try {
            await api('/payment/verify', { method: 'POST', body: { orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature } });
            await refresh(); say('Payment verified. Premium activated ✔', true);
          } catch (x) { say(x.message); }
        },
      }).open();
    } catch (x) { say(x.message); }
  };

  return (
    <div className="wrap">
      <div className="card">
        <h3>1. Upload resume (PDF)</h3>
        <input type="file" accept="application/pdf" onChange={upload} disabled={busy} />
        {resume && <p className="mut">Latest resume: {resume.chars} characters extracted · {date(resume.createdAt)}<br />“{resume.preview}…”</p>}
      </div>
      {resume?.analysis && <ResumeInsights resume={resume} />}
      <div className="card">
        <h3>2. Choose domain &amp; start</h3>
        <select value={domain} onChange={(e) => setDomain(e.target.value)}>{DOMAINS.map((d) => <option key={d}>{d}</option>)}</select>
        <button onClick={start} disabled={busy || !resume}>Start AI Interview</button>
        {msg.t && <p className={msg.ok ? 'ok' : 'err'}>{msg.t}</p>}
      </div>
      <div className="card">
        <h3>Plan</h3>
        {user.premium ? <p className="ok">⭐ Premium: unlimited interviews, 8 questions each.</p> : (<>
          <p className="mut">Free: 3 interviews, 5 questions each. Premium (₹99): unlimited interviews, 8 questions each.</p>
          <button onClick={upgrade}>Upgrade to Premium</button>
        </>)}
      </div>
    </div>
  );
}

function Interview() {
  const { id } = useParams();
  const nav = useNavigate();
  const [iv, setIv] = useState(null);
  const [i, setI] = useState(0);
  const [ans, setAns] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    api('/interviews/' + id).then((d) => {
      if (d.status === 'completed') return nav('/result/' + id, { replace: true });
      setIv(d); setAns(d.questions.map(() => ''));
    }).catch((e) => setErr(e.message));
  }, [id]);
  if (err && !iv) return <p className="c err">{err}</p>;
  if (!iv) return <p className="c">Loading…</p>;
  const last = i === iv.questions.length - 1;
  const finish = async () => {
    setBusy(true); setErr('');
    try { await api(`/interviews/${id}/submit`, { method: 'POST', body: { answers: ans } }); nav('/result/' + id); }
    catch (x) { setErr(x.message); setBusy(false); }
  };
  return (
    <div className="wrap"><div className="card">
      <p className="mut">{iv.domain} · Question {i + 1} of {iv.questions.length}</p>
      <h3>{iv.questions[i]}</h3>
      <AnswerBox value={ans[i]} onChange={(v) => setAns(ans.map((a, k) => (k === i ? v : a)))} />
      {err && <p className="err">{err}</p>}
      <div className="row">
        <button className="ghost" disabled={i === 0 || busy} onClick={() => setI(i - 1)}>← Previous</button>
        {last ? <button disabled={busy} onClick={finish}>{busy ? 'AI is evaluating…' : 'Submit & Get Feedback'}</button>
              : <button onClick={() => setI(i + 1)}>Next →</button>}
      </div>
    </div></div>
  );
}

function Result() {
  const { id } = useParams();
  const [iv, setIv] = useState(null);
  useEffect(() => { api('/interviews/' + id).then(setIv).catch(() => {}); }, [id]);
  if (!iv) return <p className="c">Loading…</p>;
  const List = ({ title, items }) => <div className="card"><h3>{title}</h3><ul>{items.map((x, k) => <li key={k}>{x}</li>)}</ul></div>;
  return (
    <div className="wrap">
      <div className="card stat"><span className="badge">{iv.domain}</span><div className="score">{iv.overall} / 10</div><p className="mut">Overall score · {date(iv.createdAt)}</p><p className="mut">Evaluated by: {iv.engine || 'AI'}</p><button className="ghost" onClick={() => window.print()}>🖨 Print / Save as PDF</button></div>
      {iv.questions.map((q, k) => { const e = iv.evaluations[k] || {}; return (
        <div className="card" key={k}>
          <b>Q{k + 1}. {q}</b>
          <p className="mut">Your answer: {iv.answers[k] || '(none)'}</p>
          <p>Score <b>{e.score}</b>/10 — Relevance {e.relevance} · Accuracy {e.accuracy} · Clarity {e.clarity} · Depth {e.depth}</p>
          <p className="ok">{e.comment}</p>
          {e.wordCount != null && <p className="mut">{e.wordCount} words · {e.fillerCount} filler words · {e.technicalTerms} technical terms</p>}
        </div>); })}
      <List title="💪 Strengths" items={iv.strengths} />
      <List title="⚠️ Weaknesses" items={iv.weaknesses} />
      <List title="🎯 Suggestions" items={iv.suggestions} />
      <Link to="/">← Back to dashboard</Link>
    </div>
  );
}

function History() {
  const [list, setList] = useState([]);
  useEffect(() => { api('/interviews').then(setList).catch(() => {}); }, []);
  return (
    <div className="wrap"><Stats /><div className="card"><h3>Interview history</h3>
      <table><thead><tr><th>Date</th><th>Domain</th><th>Status</th><th>Score</th><th></th></tr></thead><tbody>
        {list.map((x) => <tr key={x._id}><td>{date(x.createdAt)}</td><td>{x.domain}</td><td>{x.status}</td><td>{x.overall ?? '-'}</td>
          <td><Link to={x.status === 'completed' ? '/result/' + x._id : '/interview/' + x._id}>{x.status === 'completed' ? 'View' : 'Resume'}</Link></td></tr>)}
      </tbody></table>
      {!list.length && <p className="mut">No interviews yet.</p>}
    </div></div>
  );
}

function Admin() {
  const [s, setS] = useState(null), [users, setUsers] = useState([]), [pays, setPays] = useState([]), [ivs, setIvs] = useState([]);
  const load = () => {
    api('/admin/stats').then(setS); api('/admin/users').then(setUsers);
    api('/admin/payments').then(setPays); api('/admin/interviews').then(setIvs);
  };
  useEffect(load, []);
  const toggle = async (id) => { await api(`/admin/users/${id}/toggle`, { method: 'PATCH' }); load(); };
  if (!s) return <p className="c">Loading…</p>;
  return (
    <div className="wrap">
      <div className="row">
        <div className="card stat"><b>{s.users}</b>Candidates</div>
        <div className="card stat"><b>{s.interviews}</b>Interviews</div>
        <div className="card stat"><b>₹{s.revenue}</b>Revenue</div>
      </div>
      <div className="card"><h3>Average score by domain</h3>
        {s.byDomain.length ? s.byDomain.map((d) => <p key={d._id}>{d._id}: <b>{d.avg.toFixed(1)}</b>/10 ({d.count} interviews)</p>) : <p className="mut">No data yet.</p>}
      </div>
      <div className="card"><h3>Users</h3><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Premium</th><th>Active</th><th></th></tr></thead><tbody>
        {users.map((u) => <tr key={u._id}><td>{u.name}</td><td>{u.email}</td><td>{u.role}</td><td>{u.premium ? 'Yes' : 'No'}</td><td>{u.active ? 'Yes' : 'No'}</td>
          <td>{u.role !== 'admin' && <button className="ghost" onClick={() => toggle(u._id)}>{u.active ? 'Disable' : 'Enable'}</button>}</td></tr>)}
      </tbody></table></div>
      <div className="card"><h3>Recent interviews</h3><table><thead><tr><th>User</th><th>Domain</th><th>Status</th><th>Score</th><th>Date</th></tr></thead><tbody>
        {ivs.map((x) => <tr key={x._id}><td>{x.user?.email}</td><td>{x.domain}</td><td>{x.status}</td><td>{x.overall ?? '-'}</td><td>{date(x.createdAt)}</td></tr>)}
      </tbody></table></div>
      <div className="card"><h3>Payments</h3><table><thead><tr><th>User</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead><tbody>
        {pays.map((p) => <tr key={p._id}><td>{p.user?.email}</td><td>₹{p.amount}</td><td>{p.status}</td><td>{date(p.createdAt)}</td></tr>)}
      </tbody></table></div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter><Provider><Nav />
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/" element={<Guard><Dashboard /></Guard>} />
        <Route path="/interview/:id" element={<Guard><Interview /></Guard>} />
        <Route path="/result/:id" element={<Guard><Result /></Guard>} />
        <Route path="/history" element={<Guard><History /></Guard>} />
        <Route path="/admin" element={<Guard admin><Admin /></Guard>} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Provider></BrowserRouter>
  );
}
