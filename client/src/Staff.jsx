import { useCallback, useEffect, useState } from 'react';
import { api, money } from './api.js';

const STATUSES = ['Pending', 'Preparing', 'Ready', 'Collected'];
const blank = { name: '', description: '', category: 'Coffee', price: '', available: true };

export default function Staff() {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState('orders');

  async function login(e) {
    e.preventDefault();
    try { setToken((await api('/api/auth/login', { method: 'POST', body: { password } })).token); setError(''); }
    catch (err) { setError(err.message); }
  }
  if (!token) return (
    <form className="panel login" onSubmit={login}>
      <h2>Staff sign in</h2>
      <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <button className="primary">Sign in</button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
  const onAuthError = (e) => { if (e.status === 401) setToken(''); setError(e.message); };
  return (
    <div>
      <div className="tabs">
        <button className={tab === 'orders' ? 'on' : ''} onClick={() => setTab('orders')}>Orders</button>
        <button className={tab === 'menu' ? 'on' : ''} onClick={() => setTab('menu')}>Menu</button>
        <button onClick={() => setToken('')}>Sign out</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {tab === 'orders' ? <Orders token={token} onError={onAuthError} /> : <MenuAdmin token={token} onError={onAuthError} />}
    </div>
  );
}

function Orders({ token, onError }) {
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState(null);
  const load = useCallback(() => {
    api('/api/orders', { token }).then(setOrders).catch(onError);
    api('/api/orders/summary', { token }).then(setSummary).catch(onError);
  }, [token]);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  const setStatus = (id, status) => api(`/api/orders/${id}/status`, { method: 'PATCH', body: { status }, token }).then(load).catch(onError);
  return (
    <>
      {summary && <div className="stats">
        <div><strong>{summary.orderCount}</strong> orders today</div>
        <div><strong>{money(summary.revenue)}</strong> taken</div>
        {STATUSES.map((s) => <div key={s}><strong>{summary.byStatus[s]}</strong> {s.toLowerCase()}</div>)}
      </div>}
      {!orders.length && <p className="muted">No orders yet.</p>}
      {orders.map((o) => (
        <article className="card order" key={o.id}>
          <div className="row"><h3>{o.number} · {o.customerName}</h3><strong>{money(o.total)}</strong></div>
          <p>{o.items.map((i) => `${i.quantity} × ${i.name}`).join(', ')}</p>
          {o.notes && <p className="muted">Note: {o.notes}</p>}
          <div className="row"><small>{new Date(o.createdAt).toLocaleString()}</small>
            <select aria-label={`Status for ${o.number}`} value={o.status} onChange={(e) => setStatus(o.id, e.target.value)}>
              {STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div>
        </article>
      ))}
    </>
  );
}

function MenuAdmin({ token, onError }) {
  const [menu, setMenu] = useState([]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const load = () => api('/api/menu').then(setMenu).catch(onError);
  useEffect(() => { load(); }, []);

  async function save(e) {
    e.preventDefault();
    const body = { ...form, price: Number(form.price) };
    try {
      await (editing ? api(`/api/menu/${editing}`, { method: 'PUT', body, token }) : api('/api/menu', { method: 'POST', body, token }));
      setForm(blank); setEditing(null); load();
    } catch (err) { onError(err); }
  }
  const remove = (m) => window.confirm(`Delete ${m.name}?`) && api(`/api/menu/${m.id}`, { method: 'DELETE', token }).then(load).catch(onError);
  const toggle = (m) => api(`/api/menu/${m.id}`, { method: 'PUT', body: { available: !m.available }, token }).then(load).catch(onError);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  return (
    <div className="shop">
      <section>
        {menu.map((m) => (
          <article className="card" key={m.id}>
            <div className="row"><h3>{m.name} <small>{m.category}</small></h3><strong>{money(m.price)}</strong></div>
            <div className="row">
              <button onClick={() => toggle(m)}>{m.available ? 'Mark sold out' : 'Mark available'}</button>
              <span><button onClick={() => { setEditing(m.id); setForm(m); }}>Edit</button> <button onClick={() => remove(m)}>Delete</button></span>
            </div>
          </article>
        ))}
      </section>
      <form className="panel" onSubmit={save}>
        <h2>{editing ? 'Edit item' : 'Add item'}</h2>
        <label>Name<input required value={form.name} onChange={set('name')} /></label>
        <label>Description<input value={form.description} onChange={set('description')} /></label>
        <label>Category<input value={form.category} onChange={set('category')} /></label>
        <label>Price (M)<input required type="number" min="0" step="0.5" value={form.price} onChange={set('price')} /></label>
        <label className="check"><input type="checkbox" checked={form.available} onChange={set('available')} /> Available</label>
        <button className="primary">{editing ? 'Save changes' : 'Add item'}</button>
        {editing && <button type="button" onClick={() => { setEditing(null); setForm(blank); }}>Cancel</button>}
      </form>
    </div>
  );
}
