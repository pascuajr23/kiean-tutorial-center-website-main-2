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
