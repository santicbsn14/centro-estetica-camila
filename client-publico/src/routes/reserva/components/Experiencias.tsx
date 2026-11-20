import { useState } from 'react';
import { centavosAPesos } from '../../../lib/format/plata';
import { linkWhatsApp } from '../constants';
import type { ExperienciaPublica } from '../types';

// Combos y experiencias (frontend.md §4.11, DECISIÓN 2026-11-19). Sólo paso 1,
// debajo del catálogo y arriba del footer. NO se agendan: los botones abren
// WhatsApp con un mensaje precargado y el día/pago se coordinan con Camila.
// No es desplegable — las tarjetas se ven abiertas.

export const ID_SECCION_COMBOS = 'combos';

// Mensajes EXACTOS de la decisión — no editar el wording.
function mensajeParaMi(nombre: string): string {
  return `Hola! Me interesa el combo *${nombre}* para mí. ¿Me pasás info para coordinar? 🙌🏻`;
}

function mensajeRegalo(nombre: string): string {
  return `Hola! Quiero regalar el combo *${nombre}* 🎁 ¿Cómo hacemos?`;
}

export function IconoRegalo({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13M19 12v7a2 2 0 01-2 2H7a2 2 0 01-2-2v-7M7.5 8a2.5 2.5 0 010-5C9 3 12 8 12 8s3-5 4.5-5a2.5 2.5 0 010 5" />
    </svg>
  );
}

interface Props {
  experiencias: ExperienciaPublica[];
}

export function Experiencias({ experiencias }: Props) {
  // Quien la monta ya garantiza ≥1; defensivo igual.
  if (experiencias.length === 0) return null;

  return (
    <section className="combos" id={ID_SECCION_COMBOS} aria-labelledby="combos-titulo">
      <p className="combos-eyebrow">Combos y experiencias</p>
      <h2 className="combos-titulo" id="combos-titulo">
        Para vos o para regalar
      </h2>
      <p className="combos-sub">Elegís el combo y coordinamos el día por WhatsApp.</p>

      <div className="combos-lista">
        {experiencias.map((e) => (
          <TarjetaCombo key={e._id} experiencia={e} />
        ))}
      </div>
    </section>
  );
}

function TarjetaCombo({ experiencia }: { experiencia: ExperienciaPublica }) {
  // Link roto ⇒ se oculta el contenedor entero (igual que ServicioCard).
  const [imagenRota, setImagenRota] = useState(false);
  const mostrarImagen = Boolean(experiencia.imagenUrl) && !imagenRota;

  return (
    <article className="combo">
      {mostrarImagen && (
        <div className="combo-img">
          <img src={experiencia.imagenUrl} alt="" loading="lazy" onError={() => setImagenRota(true)} />
        </div>
      )}
      <div className="combo-body">
        <h3 className="combo-nombre">{experiencia.nombre}</h3>
        {experiencia.descripcion && <p className="combo-desc">{experiencia.descripcion}</p>}

        <p className="combo-eyebrow">Incluye</p>
        <ul className="combo-incluye">
          {experiencia.incluye.map((item, i) => (
            <li key={i}>
              <svg
                className="combo-check"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        {/* Sin precio (mostrarPrecio:false) ⇒ no se muestra nada en su lugar. */}
        {experiencia.precio !== undefined && <p className="combo-precio num">{centavosAPesos(experiencia.precio)}</p>}

        <div className="combo-acciones">
          <a
            className="combo-btn combo-btn--solido"
            href={linkWhatsApp(mensajeParaMi(experiencia.nombre))}
            target="_blank"
            rel="noopener"
          >
            Lo quiero
          </a>
          <a
            className="combo-btn combo-btn--outline"
            href={linkWhatsApp(mensajeRegalo(experiencia.nombre))}
            target="_blank"
            rel="noopener"
          >
            <IconoRegalo />
            Quiero regalarlo
          </a>
        </div>
      </div>
    </article>
  );
}
