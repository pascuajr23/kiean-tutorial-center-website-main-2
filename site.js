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
  const nodes = [img];
  if (caption) { const p = document.createElement('p'); p.className = 'popup-caption'; p.textContent = caption; nodes.push(p); }
  popup.querySelector('.popup-count').textContent = `${galleryIndex + 1} / ${gallery.length}`;
  openPopup(gallery.title, nodes, true);
}
function openGallery(title, items, index = 0) { gallery = items; gallery.title = title; showPhoto(index); }
document.querySelectorAll('.program-open').forEach(button => button.addEventListener('click', () => {
  const card = button.closest('.program-card');
  openPopup(card.querySelector('h3').textContent.trim(), [...card.querySelectorAll(':scope > p, .program-more')].map(node => node.cloneNode(true)));
}));
document.querySelectorAll('.branch-photos').forEach(button => button.addEventListener('click', () => {
  const title = button.dataset.title;
  openGallery(title, button.dataset.photos.split(' ').map((src, i, all) => ({src, alt: `${title} branch, photo ${i + 1} of ${all.length}`})));
}));
document.querySelectorAll('.gallery-grid').forEach(grid => {
  const links = [...grid.querySelectorAll('.gallery-item')];
  const items = links.map(link => ({src: link.href, alt: link.querySelector('img').alt, caption: link.closest('figure')?.querySelector('figcaption')?.textContent}));
  links.forEach((link, i) => link.addEventListener('click', event => { event.preventDefault(); openGallery(grid.dataset.title, items, i); }));
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
