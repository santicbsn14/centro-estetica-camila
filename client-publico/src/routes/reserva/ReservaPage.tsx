import { useEffect, useRef, useState } from 'react';
import type { CrearTurnoInput } from '@shared/schemas/turno.schema';
import { HttpError } from '../../lib/http';
import { mensajeDeError } from '../../lib/errores';
import { rangoSemanaUtc, claveDiaLocal } from '../../lib/format/fecha';
import { listarServicios, listarProfesionales, listarDisponibilidad, crearTurno } from './api';
import { Catalogo } from './components/Catalogo';
import { Grilla } from './components/Grilla';
import { HojaDatos } from './components/HojaDatos';
import { Exito } from './components/Exito';
import { Toast, type ToastState } from './components/Toast';
import type { Carga, DatosClienta, ProfesionalPublico, ServicioPublico, Slot, TurnoCreado } from './types';
import './ReservaPage.css';

// Único flujo de la web pública v1 (frontend.md §4.11). Un paso = una
// "pantalla" del indicador de progreso (3 segmentos, igual que el mockup
// mockups/reserva-camila.html: catálogo / grilla / éxito). El paso de datos
// NO tiene segmento propio: es un bottom sheet SOBRE la grilla, no una
// navegación — mismo criterio que el mockup, cuyo `.steps` sólo tiene 3 <i>
// aunque el flujo textual describa 4 etapas.
type Paso = 1 | 2 | 3;

const DATOS_INICIALES: DatosClienta = { nombre: '', telefonoResto: '', email: '' };

export function ReservaPage() {
  const [paso, setPaso] = useState<Paso>(1);

  // Paso 1 — catálogo. Cacheado en este mismo estado: volver del paso 2 no
  // vuelve a pedir GET /api/servicios ni los profesionales ya cargados.
  const [servicios, setServicios] = useState<Carga<ServicioPublico[]>>({ tipo: 'cargando' });
  const [servicioAbiertoId, setServicioAbiertoId] = useState<string | null>(null);
  const [profesionalesPorServicio, setProfesionalesPorServicio] = useState<
    Record<string, Carga<ProfesionalPublico[]>>
  >({});

  // Selección servicio+profesional — persiste entre paso 1 ↔ 2 ("Cambiar"
  // vuelve al paso 1 sin perderla del todo hasta que se elija otra).
  const [servicioElegido, setServicioElegido] = useState<ServicioPublico | null>(null);
  const [profesionalElegido, setProfesionalElegido] = useState<ProfesionalPublico | null>(null);

  // Paso 2 — grilla de la semana visible.
  const [slots, setSlots] = useState<Carga<Slot[]>>({ tipo: 'cargando' });

  // Sheet de datos (overlay del paso 2).
  const [sheetAbierto, setSheetAbierto] = useState(false);
  const [slotElegido, setSlotElegido] = useState<Slot | null>(null);
  const [datos, setDatos] = useState<DatosClienta>(DATOS_INICIALES);
  const [enviando, setEnviando] = useState(false);
  const [errorSheet, setErrorSheet] = useState<string | null>(null);

  // Paso 3 — éxito.
  const [resultado, setResultado] = useState<TurnoCreado | null>(null);

  // Toast (409 SLOT_OCUPADO en el submit). El contenido queda en el DOM
  // aunque `visible` pase a false, para que el fade-out CSS tenga algo que
  // animar (ver Toast.tsx).
  const [toast, setToast] = useState<ToastState | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  function mostrarToast(mensaje: string, tipo: 'info' | 'warn' = 'info') {
    setToast({ mensaje, tipo });
    setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2600);
  }

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Scroll-lock del fondo mientras el sheet está abierto (mockup v2:
  // body.locked). El cleanup lo saca al cerrar o al desmontar.
  useEffect(() => {
    if (!sheetAbierto) return;
    document.body.classList.add('sheet-abierta');
    return () => document.body.classList.remove('sheet-abierta');
  }, [sheetAbierto]);

  // --- Carga inicial del catálogo (una sola vez) ---
  useEffect(() => {
    const controller = new AbortController();
    listarServicios(controller.signal)
      .then((datos) => setServicios({ tipo: 'ok', datos }))
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setServicios({ tipo: 'error', mensaje: mensajeDeError(err) });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cargarServicios() {
    setServicios({ tipo: 'cargando' });
    listarServicios()
      .then((datos) => setServicios({ tipo: 'ok', datos }))
      .catch((err) => setServicios({ tipo: 'error', mensaje: mensajeDeError(err) }));
  }

  // --- Paso 1: acordeón ---
  function toggleServicio(servicio: ServicioPublico) {
    const abrir = servicioAbiertoId !== servicio._id;
    setServicioAbiertoId(abrir ? servicio._id : null);
    if (abrir && !profesionalesPorServicio[servicio._id]) {
      cargarProfesionales(servicio._id);
    }
  }

  function cargarProfesionales(servicioId: string) {
    setProfesionalesPorServicio((prev) => ({ ...prev, [servicioId]: { tipo: 'cargando' } }));
    listarProfesionales(servicioId)
      .then((datos) => setProfesionalesPorServicio((prev) => ({ ...prev, [servicioId]: { tipo: 'ok', datos } })))
      .catch((err) =>
        setProfesionalesPorServicio((prev) => ({
          ...prev,
          [servicioId]: { tipo: 'error', mensaje: mensajeDeError(err) },
        }))
      );
  }

  function elegirProfesional(servicio: ServicioPublico, profesional: ProfesionalPublico) {
    setServicioElegido(servicio);
    setProfesionalElegido(profesional);
    setPaso(2);
    cargarDisponibilidad(servicio._id, profesional._id);
  }

  // --- Paso 2: grilla ---
  function cargarDisponibilidad(servicioId: string, profesionalId: string) {
    setSlots({ tipo: 'cargando' });
    const { desde, hasta } = rangoSemanaUtc();
    listarDisponibilidad({ servicioId, profesionalId, desde, hasta })
      .then((res) => setSlots({ tipo: 'ok', datos: res.slots }))
      .catch((err) => setSlots({ tipo: 'error', mensaje: mensajeDeError(err) }));
  }

  function reintentarDisponibilidad() {
    if (servicioElegido && profesionalElegido) {
      cargarDisponibilidad(servicioElegido._id, profesionalElegido._id);
    }
  }

  function volverAlCatalogo() {
    setPaso(1);
  }

  function elegirSlot(slot: Slot) {
    setSlotElegido(slot);
    setErrorSheet(null);
    setSheetAbierto(true);
  }

  function cerrarSheet() {
    setSheetAbierto(false);
    setErrorSheet(null);
  }

  // --- Confirmar turno ---
  async function confirmarTurno(input: CrearTurnoInput) {
    setEnviando(true);
    setErrorSheet(null);
    try {
      const creado = await crearTurno(input);
      setResultado(creado);
      setSheetAbierto(false);
      setPaso(3);
    } catch (err) {
      if (err instanceof HttpError && err.codigo === 'SLOT_OCUPADO') {
        manejarSlotOcupado(err);
      } else {
        setErrorSheet(mensajeDeError(err));
      }
    } finally {
      setEnviando(false);
    }
  }

  // 409 SLOT_OCUPADO (frontend.md §4.11, corrección sobre el mockup: pasa en
  // el submit del paso 3, no al tocar el slot). Cierra el sheet, avisa, y
  // vuelve al paso 2 re-renderizado desde detalle.slots — SIN otro GET. El
  // 409 sólo trae la grilla actualizada del DÍA que se ocupó; se reemplazan
  // sólo los slots de ese día local, el resto de los días conserva lo ya
  // cargado. servicio/profesional elegidos NO se pierden (siguen en estado).
  function manejarSlotOcupado(err: HttpError) {
    const detalle = err.detalle as { slots?: Slot[] } | undefined;
    const slotsDelDia = detalle?.slots ?? [];

    setSlots((prev) => {
      if (prev.tipo !== 'ok' || !slotElegido) return { tipo: 'ok', datos: slotsDelDia };
      const diaOcupado = claveDiaLocal(slotElegido.inicio);
      const otrosDias = prev.datos.filter((s) => claveDiaLocal(s.inicio) !== diaOcupado);
      return { tipo: 'ok', datos: [...otrosDias, ...slotsDelDia] };
    });

    setSheetAbierto(false);
    setSlotElegido(null);
    mostrarToast('Ese horario se acaba de ocupar. Elegí otro.', 'warn');
  }

  const mostrarVolver = paso === 2;

  return (
    <div className="app">
      <header className="top">
        <div className="toprow">
          <button className={`back${mostrarVolver ? ' back--show' : ''}`} onClick={volverAlCatalogo} aria-label="Volver">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div className="lockup">
            <img src="/logo_sm.png" alt="Camila González · Salón de belleza" />
          </div>
          <div className="toprow-spacer" aria-hidden="true" />
        </div>
        <div className="steps">
          <i className={paso >= 1 ? 'on' : ''} />
          <i className={paso >= 2 ? 'on' : ''} />
          <i className={paso >= 3 ? 'on' : ''} />
        </div>
      </header>

      <main>
        {paso === 1 && (
          <>
            <div className="hero">
              <img src="/logo_lg.png" alt="Camila González · Salón de belleza" />
              <h1>Reservá tu turno</h1>
              <p>Elegí un servicio, después con quién y a qué hora. Sin registrarte.</p>
            </div>
            <Catalogo
              servicios={servicios}
              servicioAbiertoId={servicioAbiertoId}
              profesionalesPorServicio={profesionalesPorServicio}
              onToggleServicio={toggleServicio}
              onElegirProfesional={elegirProfesional}
              onReintentar={cargarServicios}
            />
          </>
        )}

        {paso === 2 && servicioElegido && profesionalElegido && (
          <Grilla
            servicio={servicioElegido}
            profesional={profesionalElegido}
            slots={slots}
            onCambiar={volverAlCatalogo}
            onElegirSlot={elegirSlot}
            onReintentar={reintentarDisponibilidad}
          />
        )}

        {paso === 3 && resultado && profesionalElegido && (
          <Exito resultado={resultado} profesionalNombre={profesionalElegido.nombre} />
        )}
      </main>

      <div className={`scrim${sheetAbierto ? ' scrim--open' : ''}`} onClick={cerrarSheet} />
      <aside className={`sheet${sheetAbierto ? ' sheet--open' : ''}`}>
        {sheetAbierto && slotElegido && servicioElegido && profesionalElegido && (
          <HojaDatos
            servicioId={servicioElegido._id}
            profesionalId={profesionalElegido._id}
            servicioNombre={servicioElegido.nombre}
            profesionalNombre={profesionalElegido.nombre}
            slot={slotElegido}
            duracionMin={servicioElegido.duracionMin}
            precio={servicioElegido.precio}
            datos={datos}
            enviando={enviando}
            errorGeneral={errorSheet}
            onDatosChange={setDatos}
            onCerrar={cerrarSheet}
            onConfirmar={confirmarTurno}
          />
        )}
      </aside>

      <Toast toast={toast} visible={toastVisible} />
    </div>
  );
}
