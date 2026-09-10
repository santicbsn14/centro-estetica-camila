// Footer de contacto (frontend.md §4.13). SOLO se monta en el catálogo (paso
// 1) — decisión Web: mantener el flujo transaccional (grilla/form/éxito) sin
// distracciones de marketing una vez que la clienta ya está reservando.
// Clonado de mockups/footer-camila.html.
//
// Los 4 datos (WhatsApp, Instagram, dirección, portfolio) son contenido
// ESTÁTICO, hardcodeado a propósito: no salen de `configuracion` porque esa
// colección es admin-only (§15.8) y la web pública no tiene sesión para
// pedirla. El link de WhatsApp lleva un mensaje precargado — copiado EXACTO
// de la especificación, no armar el query string a mano en otro lado.
export function Footer() {
  return (
    <footer className="site-footer">
      <div className="foot-links">
        <a
          className="foot-link"
          href="https://api.whatsapp.com/send?phone=543364328062&text=Hola!%20Necesito%20un%20turno%20y%2Fo%20lista%20de%20precios%20de%20los%20servicios%20%F0%9F%99%8C%F0%9F%8F%BB"
          target="_blank"
          rel="noopener"
        >
          <span className="ic" aria-hidden="true">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 5L2 22l5.2-1.3c1.5.8 3.1 1.3 4.8 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18c-1.5 0-3-.4-4.2-1.1l-.3-.2-3.1.8.8-3-.2-.3C4.4 15 4 13.5 4 12c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8z" />
            </svg>
          </span>
          <span className="tx">
            <span className="t1">WhatsApp</span>
            <span className="t2">Consultas y turnos</span>
          </span>
        </a>
        <a className="foot-link" href="https://instagram.com/camigonz.belleza" target="_blank" rel="noopener">
          <span className="ic" aria-hidden="true">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="3" width="18" height="18" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="17.5" cy="6.5" r="1" />
            </svg>
          </span>
          <span className="tx">
            <span className="t1">@camigonz.belleza</span>
            <span className="t2">Instagram</span>
          </span>
        </a>
        <a
          className="foot-link"
          href="https://www.google.com/maps/search/?api=1&query=Moreno+1856+Villa+Constituci%C3%B3n"
          target="_blank"
          rel="noopener"
        >
          <span className="ic" aria-hidden="true">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0118 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </span>
          <span className="tx">
            <span className="t1">Moreno 1856</span>
            <span className="t2">Villa Constitución</span>
          </span>
        </a>
      </div>
      <hr className="foot-divider" />
      <p className="foot-sign">
        Desarrollado por{' '}
        <a href="https://santiago-viale-web.vercel.app" target="_blank" rel="noopener">
          Santiago Viale
        </a>
      </p>
    </footer>
  );
}
