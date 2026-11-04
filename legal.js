// Policy pages: the consent form's print button (inline handlers are blocked by the site's security policy).
document.querySelector('[data-print]')?.addEventListener('click', () => window.print());
