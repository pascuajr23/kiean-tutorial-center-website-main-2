function toggleMobileMenu() {
  const open = document.getElementById('mobileNav').classList.toggle('active');
  document.querySelector('.mobile-menu-btn').setAttribute('aria-expanded', String(open));
}
function closeMobileMenu() {
  document.getElementById('mobileNav').classList.remove('active');
  document.querySelector('.mobile-menu-btn').setAttribute('aria-expanded', 'false');
}
document.querySelectorAll('.mobile-nav a').forEach(link => link.addEventListener('click', closeMobileMenu));
document.querySelector('.mobile-menu-btn')?.addEventListener('click', toggleMobileMenu);
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMobileMenu(); });

// Image skeletons: mark each image once it has loaded (or failed) so its shimmer placeholder stops.
const markLoaded = img => img.classList.add('img-loaded');
for (const type of ['load', 'error']) document.addEventListener(type, event => { if (event.target.tagName === 'IMG') markLoaded(event.target); }, true);
document.querySelectorAll('img').forEach(img => { if (img.complete && img.naturalWidth) markLoaded(img); });

// One shared <dialog> shows program details and photo galleries without leaving the page.
const popup = document.getElementById('popup');
const popupTitle = popup.querySelector('#popup-title');
const popupBody = popup.querySelector('.popup-body');
const popupNav = popup.querySelector('.popup-nav');
let gallery = [], galleryIndex = 0;
function openPopup(title, nodes, isGallery = false) {
  popupTitle.textContent = title;
  popupBody.replaceChildren(...nodes);
  popupNav.hidden = !isGallery || gallery.length < 2;
  popup.classList.toggle('popup-gallery', isGallery);
  if (!popup.open) popup.showModal();
}
function showPhoto(index) {
  galleryIndex = (index + gallery.length) % gallery.length;
  const {src, alt, caption} = gallery[galleryIndex];
  const img = document.createElement('img');
  img.src = src; img.alt = alt;
  // The frame carries the © mark over the photo.
  const frame = document.createElement('span'); frame.className = 'photo-frame'; frame.append(img);
  const nodes = [frame];
  if (caption) { const p = document.createElement('p'); p.className = 'popup-caption'; p.textContent = caption; nodes.push(p); }
  popup.querySelector('.popup-count').textContent = `${galleryIndex + 1} / ${gallery.length}`;
  openPopup(gallery.title, nodes, true);
}
function openGallery(title, items, index = 0) { gallery = items; gallery.title = title; showPhoto(index); }
// Delegated, so program cards drawn later from /api/config open too.
document.addEventListener('click', event => {
  const card = event.target.closest('.program-open')?.closest('.program-card');
  if (card) openPopup(card.querySelector('h3').textContent.trim(), [...card.querySelectorAll(':scope > p, .program-more')].map(node => node.cloneNode(true)));
});
// One listener for every "View photos" button, including branch cards drawn later from /api/config.
document.addEventListener('click', event => {
  const button = event.target.closest('.branch-photos');
  if (!button) return;
  const title = button.dataset.title;
  openGallery(title, button.dataset.photos.split(' ').map((src, i, all) => ({src, alt: `${title} branch, photo ${i + 1} of ${all.length}`})));
});
// Branch cards come from the locations managed in /admin; the cards in the HTML stay if the server cannot be reached.
fetch('/api/config').then(r => r.ok ? r.json() : null).then(data => {
  if (data?.programs) renderPrograms(data.programs);
  if (data?.galleries) renderGalleries(data.galleries);
  const branches = data?.branches?.filter(b => b.available !== false);
  if (!branches?.length) return;
  const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
  document.getElementById('branch-grid').replaceChildren(...branches.map((b, i) => {
    const card = el('article', 'branch-card');
    card.append(el('span', '', String(i + 1).padStart(2, '0')), el('h3', '', b.name), el('p', '', b.address));
    if (b.photos.length) {
      const photos = el('button', 'branch-photos', 'View photos →'); photos.type = 'button';
      photos.dataset.title = b.name; photos.dataset.photos = b.photos.join(' ');
      card.append(photos);
    }
    return card;
  }));
  document.getElementById('branch-count').textContent = `${branches.length} Branch${branches.length === 1 ? '' : 'es'}`;
}).catch(() => {});
// Delegated, so galleries redrawn from /api/config open too.
document.addEventListener('click', event => {
  const link = event.target.closest('.gallery-grid .gallery-item');
  if (!link) return;
  event.preventDefault();
  const grid = link.closest('.gallery-grid'), links = [...grid.querySelectorAll('.gallery-item')];
  const items = links.map(l => ({src: l.href, alt: l.querySelector('img').alt, caption: l.closest('figure')?.querySelector('figcaption')?.textContent}));
  openGallery(grid.dataset.title, items, links.indexOf(link));
});
popup.querySelector('.popup-close').addEventListener('click', () => popup.close());
popup.querySelector('.popup-prev').addEventListener('click', () => showPhoto(galleryIndex - 1));
popup.querySelector('.popup-next').addEventListener('click', () => showPhoto(galleryIndex + 1));
popup.addEventListener('click', event => { if (event.target === popup) popup.close(); });
popup.addEventListener('keydown', event => {
  if (!popup.classList.contains('popup-gallery') || gallery.length < 2) return;
  if (event.key === 'ArrowLeft') showPhoto(galleryIndex - 1);
  if (event.key === 'ArrowRight') showPhoto(galleryIndex + 1);
});

// Program cards come from the programs managed in /admin, in the same order; the cards in the HTML stay if the server cannot be reached.
const FACEBOOK = 'https://www.facebook.com/profile.php?id=61593257580081';
function renderPrograms(programs) {
  const shown = programs.filter(p => p.homepage !== false && p.available !== false);
  if (!shown.length) return;
  const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
  const peso = n => '₱' + n.toLocaleString('en-PH');
  const list = lines => { const ul = el('ul', 'program-details'); ul.append(...lines.map(line => el('li', '', line))); return ul; };
  const accents = ['blue', 'pink', 'yellow', 'green', 'orange'];
  document.querySelector('.program-grid').replaceChildren(...shown.map((p, i) => {
    const card = el('article', `program-card accent-${accents[i % accents.length]}`);
    if (p.icon) card.append(el('div', 'program-icon', p.icon));
    card.append(el('h3', '', p.name));
    if (p.tagline) card.append(el('p', 'program-tagline', p.tagline));
    if (p.description) card.append(el('p', '', p.description));
    const open = el('button', 'program-open', 'View details & rates →'); open.type = 'button'; card.append(open);
    const more = el('div', 'program-more');
    if (p.details?.length) more.append(list(p.details));
    if (p.care) more.append(...careRates(p, el, peso, list));
    if (p.price) more.append(el('strong', 'program-rate', p.price));
    if (p.priceNote) more.append(el('p', 'program-note', p.priceNote));
    // Bookable (and accepting) programs open the booking page; everything else is an inquiry on Facebook.
    const target = p.mode ? p : programs.find(x => x.id === p.link && x.mode);
    const link = el('a', 'program-link', p.linkText || (target ? 'Book now →' : 'Inquire about this program →'));
    link.target = '_blank';
    if (target && target.available !== false) { link.href = `/booking?mode=${target.mode}&program=${encodeURIComponent(target.id)}`; link.rel = 'noopener'; }
    else { link.href = FACEBOOK; link.rel = 'noopener noreferrer'; if (target) link.textContent = 'Inquire about this program →'; }
    more.append(link); card.append(more);
    return card;
  }));
}
// Kiddie Care rate tables (regular and special needs) plus walk-in, tutorial add-on and notes, from the admin rate table.
function careRates(p, el, peso, list) {
  const r = p.careRates || {}, out = [];
  for (const [needs, caption] of [['regular', 'Regular care'], ['special', 'Special needs care']]) {
    const rows = [['Day stay, per day', r.day?.rates], ['Day monthly (20 school days, Mon–Fri)', r.day?.monthly], ['Night stay, per night', r.night?.rates], ['Night monthly (20 nights, Mon–Fri)', r.night?.monthly]].map(([label, by]) => [label, by?.[needs] || {}]).filter(([, prices]) => Object.keys(prices).length);
    if (!rows.length) continue;
    const hours = [...new Set(rows.flatMap(([, prices]) => Object.keys(prices).map(Number)))].sort((a, b) => a - b);
    const table = el('table', 'care-rates'), head = el('tr');
    table.append(el('caption', '', caption));
    head.append(el('th'), ...hours.map(h => { const th = el('th', '', `${h} hrs`); th.scope = 'col'; return th; }));
    const thead = el('thead'), tbody = el('tbody'); thead.append(head);
    for (const [label, prices] of rows) { const tr = el('tr'), th = el('th', '', label); th.scope = 'row'; tr.append(th, ...hours.map(h => el('td', '', prices[h] ? peso(prices[h]) : '—'))); tbody.append(tr); }
    table.append(thead, tbody); out.push(table);
  }
  const lines = [];
  const walk = needs => [['day', 'walk-in-day'], ['night', 'walk-in-night']].map(([when, id]) => r[id]?.perHour?.[needs] && `${peso(r[id].perHour[needs])}/hour ${when}`).filter(Boolean).join(', ');
  if (walk('regular') || walk('special')) lines.push('Walk-in: ' + [walk('regular'), walk('special') && 'Special needs ' + walk('special')].filter(Boolean).join(' · '));
  const t = r.day?.tutorial, tut = needs => [t?.day?.[needs] && `${peso(t.day[needs])}/day`, t?.month?.[needs] && `${peso(t.month[needs])}/month`].filter(Boolean).join(' or ');
  if (tut('regular') || tut('special')) lines.push('Tutorial add-on: ' + [tut('regular'), tut('special') && 'Special needs ' + tut('special')].filter(Boolean).join(' · '));
  lines.push(...(p.notes || []));
  if (lines.length) out.push(list(lines));
  return out;
}

// Permits and Feedback photos come from /admin; an empty list keeps the photos built into the page.
function renderGalleries(galleries) {
  const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
  const photo = item => {
    const link = el('a', 'gallery-item'), img = el('img');
    link.href = '/' + item.src; img.src = '/' + (item.thumb || item.src); img.alt = item.alt || item.caption || fallbackAlt; img.loading = 'lazy'; img.decoding = 'async';
    link.append(img); return link;
  };
  let fallbackAlt = '';
  const testimonials = document.querySelector('#testimonials .gallery-grid'), permits = document.querySelector('#permits .gallery-grid');
  fallbackAlt = 'Parent feedback for KieAn Tutorial Center';
  if (testimonials && galleries.testimonials?.length) testimonials.replaceChildren(...galleries.testimonials.map(photo));
  fallbackAlt = 'KieAn Tutorial Center permit';
  if (permits && galleries.permits?.length) permits.replaceChildren(...galleries.permits.map(item => { const fig = el('figure'); fig.append(photo(item)); if (item.caption) fig.append(el('figcaption', '', item.caption)); return fig; }));
}

// Phone pager for the swipeable galleries (CSS hides it on wider screens). Counts children live, so redrawn galleries work too.
document.querySelectorAll('.gallery-grid').forEach(grid => {
  const pager = document.createElement('div'), prev = document.createElement('button'), next = document.createElement('button'), count = document.createElement('span');
  pager.className = 'gallery-pager';
  prev.type = next.type = 'button'; prev.textContent = '‹'; next.textContent = '›';
  prev.setAttribute('aria-label', `Previous ${grid.dataset.title} photo`); next.setAttribute('aria-label', `Next ${grid.dataset.title} photo`);
  count.setAttribute('aria-live', 'polite');
  pager.append(prev, count, next); grid.after(pager);
  const index = () => Math.round(grid.scrollLeft / Math.max(1, grid.clientWidth));
  const update = () => { const n = grid.children.length, i = Math.min(index(), n - 1); count.textContent = `${i + 1} / ${n}`; prev.disabled = i <= 0; next.disabled = i >= n - 1; };
  prev.addEventListener('click', () => grid.scrollBy({left: -grid.clientWidth}));
  next.addEventListener('click', () => grid.scrollBy({left: grid.clientWidth}));
  grid.addEventListener('scroll', () => requestAnimationFrame(update), {passive: true});
  new MutationObserver(() => { grid.scrollLeft = 0; update(); }).observe(grid, {childList: true});
  addEventListener('resize', update); update();
});
