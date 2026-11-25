import { useEffect, useState } from 'react';
import { api, money } from './api.js';
import Staff from './Staff.jsx';

export default function App() {
  const [view, setView] = useState('shop');
  return (
    <>
      <header className="top">
        <h1>Corner Cup</h1>
        <nav>
          <button className={view === 'shop' ? 'on' : ''} onClick={() => setView('shop')}>Order</button>
          <button className={view === 'staff' ? 'on' : ''} onClick={() => setView('staff')}>Staff</button>
        </nav>
      </header>
      <main>{view === 'shop' ? <Shop /> : <Staff />}</main>
    </>
  );
}

function Shop() {
  const [menu, setMenu] = useState(null);
  const [cart, setCart] = useState({});
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [placed, setPlaced] = useState(null);

  useEffect(() => { api('/api/menu').then(setMenu).catch((e) => setError(e.message)); }, []);

  const change = (id, d) => setCart((c) => {
    const q = Math.max(0, (c[id] || 0) + d);
    const next = { ...c, [id]: q };
    if (!q) delete next[id];
    return next;
  });
  const lines = (menu || []).filter((m) => cart[m.id]).map((m) => ({ ...m, quantity: cart[m.id] }));
  const total = lines.reduce((s, l) => s + l.price * l.quantity, 0);

  async function place() {
    setError('');
    try {
      const order = await api('/api/orders', { method: 'POST', body: { customerName: name, notes, items: lines.map((l) => ({ id: l.id, quantity: l.quantity })) } });
      setPlaced(order); setCart({}); setName(''); setNotes('');
    } catch (e) { setError(e.message); }
  }

  if (placed) return (
    <section className="panel confirm">
      <h2>Thanks, {placed.customerName}. Your order is in.</h2>
      <p className="big">{placed.number}</p>
      <p>Show this number at the counter. Total {money(placed.total)}.</p>
      <ul>{placed.items.map((i) => <li key={i.id}>{i.quantity} × {i.name}</li>)}</ul>
      <button onClick={() => setPlaced(null)}>Order something else</button>
    </section>
  );

  const groups = [...new Set((menu || []).map((m) => m.category))];
  return (
    <div className="shop">
      <section>
        {!menu && !error && <p>Loading the menu…</p>}
        {groups.map((g) => (
          <div key={g}>
            <h2>{g}</h2>
            <div className="grid">
              {menu.filter((m) => m.category === g).map((m) => (
                <article key={m.id} className={`card ${m.available ? '' : 'off'}`}>
                  <h3>{m.name}</h3><p>{m.description}</p>
                  <div className="row"><strong>{money(m.price)}</strong>
                    {m.available ? <button onClick={() => change(m.id, 1)}>Add</button> : <span className="tag">Sold out</span>}</div>
                </article>
              ))}
            </div>
          </div>
        ))}
      </section>
      <aside className="panel">
        <h2>Your order</h2>
        {!lines.length && <p className="muted">Nothing yet. Add something from the menu.</p>}
        {lines.map((l) => (
          <div className="row" key={l.id}>
            <span>{l.name}</span>
            <span className="qty"><button aria-label={`Remove one ${l.name}`} onClick={() => change(l.id, -1)}>−</button>{l.quantity}
              <button aria-label={`Add one ${l.name}`} onClick={() => change(l.id, 1)}>+</button></span>
          </div>
        ))}
        {!!lines.length && <>
          <p className="row"><strong>Total</strong><strong>{money(total)}</strong></p>
          <label>Your name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label>Notes (optional)<textarea rows="2" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          <button className="primary" onClick={place}>Place order</button>
        </>}
        {error && <p className="error" role="alert">{error}</p>}
      </aside>
    </div>
  );
}
