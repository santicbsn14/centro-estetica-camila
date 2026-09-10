// Footer de contacto (frontend.md §4.13, con la corrección de estilo fechada
// 2026-09-10). SOLO se monta en el catálogo (paso 1) — decisión Web: mantener
// el flujo transaccional (grilla/form/éxito) sin distracciones de marketing
// una vez que la clienta ya está reservando. Clonado de
// mockups/footer-camila-v4.html (reemplaza a la v1: íconos en color de marca
// real + bloque centrado con las filas alineadas en columna entre sí).
//
// Los 4 datos (WhatsApp, Instagram, dirección, portfolio) son contenido
// ESTÁTICO, hardcodeado a propósito: no salen de `configuracion` porque esa
// colección es admin-only (§15.8) y la web pública no tiene sesión para
// pedirla. El link de WhatsApp lleva un mensaje precargado — copiado EXACTO
// de la especificación, no armar el query string a mano en otro lado.
export function Footer() {
  return (
    <footer className="site-footer">
      {/* Wrapper centrado (justify-content:center) + inner en inline-flex
          column align-items:flex-start: las 3 filas comparten el mismo borde
          izquierdo y el bloque entero queda centrado en el footer. */}
      <div className="foot-links">
        <div className="foot-links-inner">
          <a
            className="foot-link"
            href="https://api.whatsapp.com/send?phone=543364328062&text=Hola!%20Necesito%20un%20turno%20y%2Fo%20lista%20de%20precios%20de%20los%20servicios%20%F0%9F%99%8C%F0%9F%8F%BB"
            target="_blank"
            rel="noopener"
          >
            <span className="ic wa" aria-hidden="true">
              <svg width="19" height="19" viewBox="0 0 448 512" fill="#fff">
                <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3s19.9 53.7 22.6 57.4c2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
              </svg>
            </span>
            <span className="tx">
              <span className="t1">WhatsApp</span>
              <span className="t2">Atención personalizada</span>
            </span>
          </a>
          <a className="foot-link" href="https://instagram.com/camigonz.belleza" target="_blank" rel="noopener">
            <span className="ic ig" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.5" cy="6.5" r="1" fill="#fff" />
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
            <span className="ic loc" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2a7 7 0 00-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 00-7-7zm0 9.5A2.5 2.5 0 1112 6.5a2.5 2.5 0 010 5z" />
              </svg>
            </span>
            <span className="tx">
              <span className="t1">Moreno 1856</span>
              <span className="t2">Villa Constitución</span>
            </span>
          </a>
        </div>
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
