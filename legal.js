// Policy pages: the consent form's print button (inline handlers are blocked by the site's security policy).
document.querySelector('[data-print]')?.addEventListener('click', () => window.print());

// How to Pay page: show the GCash QR codes set in /admin → Payment QR. A link with ?branch=<location id> (from the booking
// email or confirmation) shows that location's codes; otherwise the default QR. Without either, the placeholder stays.
const qrSection = document.getElementById('qr');
if (qrSection) {
  fetch('/api/config').then(r => r.ok ? r.json() : null).then(cfg => {
    const qrs = cfg?.paymentQrs || [], branch = new URLSearchParams(location.search).get('branch');
    let list = branch === 'online' ? qrs.filter(q => q.online)
      : branch ? ((cfg.branches || []).find(b => b.id === branch)?.paymentQrs || []).map(id => qrs.find(q => q.id === id)).filter(Boolean) : [];
    if (!list.length) list = qrs.filter(q => q.default);
    if (!list.length) return;
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    const boxes = list.map(q => {
      const box = el('div', 'pay-qr'), figure = el('div', 'pay-qr-figure'), img = el('img', 'pay-qr-img'), save = el('a', 'pay-qr-save', 'Save QR image'), dl = el('dl', 'pay-account');
      img.src = '/' + q.image; img.alt = `GCash QR code for ${q.name}`; img.width = 220; img.height = 220;
      save.href = '/' + q.image; save.download = `kiean-gcash-${q.id}`;
      for (const [dt, dd] of [['Account name', q.name], ['GCash number', q.number]]) { const row = el('div'); row.append(el('dt', '', dt), el('dd', '', dd)); dl.append(row); }
      figure.append(img, save); box.append(figure, dl); return box;
    });
    qrSection.querySelector('.pay-qr').replaceWith(...boxes);
    qrSection.querySelector('h2').textContent = list.length > 1 ? '1. Scan one of our GCash QR codes' : '1. Scan our GCash QR code';
    qrSection.querySelector('p').textContent = `Before you confirm a payment, check that GCash shows the account name above${list.length > 1 ? ' for the QR you scanned' : ''}. On the same phone? Save the QR image, then use Upload QR in GCash.`;
  }).catch(() => {});
}

// About page: the live version, its last update and its reference (from /api/version).
const versionList = document.getElementById('site-version');
if (versionList) {
  const field = key => versionList.querySelector(`[data-version="${key}"]`);
  fetch('/api/version').then(r => r.ok ? r.json() : Promise.reject()).then(v => {
    field('version').textContent = `v${v.version}`;
    field('updated').textContent = v.updated ? new Date(v.updated).toLocaleString('en-PH', {timeZone: 'Asia/Manila', dateStyle: 'long', timeStyle: 'short'}) + ' (Philippine Time)' : 'Not recorded for this copy';
    if (v.commit && v.source) {
      const link = document.createElement('a');
      link.href = `${v.source}/commit/${v.commit}`; link.target = '_blank'; link.rel = 'noopener'; link.textContent = v.commit;
      field('commit').replaceChildren(link);
    } else field('commit').textContent = 'Not recorded for this copy';
  }).catch(() => { for (const key of ['version', 'updated', 'commit']) field(key).textContent = 'Unavailable right now'; });
}
