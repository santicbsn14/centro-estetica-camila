import { useEffect, useRef, useState } from 'react';
import type { CrearTurnoInput } from '@shared/schemas/turno.schema';
import { HttpError } from '../../lib/http';
import { mensajeDeError } from '../../lib/errores';
import {
  DIAS_CALENDARIO,
  claveDiaLocal,
  diasConSlots,
  rangoDisponibilidadUtc,
} from '../../lib/format/fecha';
import { listarServicios, listarProfesionales, listarDisponibilidad, crearTurno } from './api';
import { Catalogo } from './components/Catalogo';
import { Grilla } from './components/Grilla';
import { Calendario } from './components/Calendario';
import { HojaDatos } from './components/HojaDatos';
import { Exito } from './components/Exito';
import { Footer } from './components/Footer';
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
  // Categorías desplegadas (frontend.md 2026-09-21): todas cerradas al entrar,
  // independientes entre sí. Vive acá, no en Catalogo, para que "Cambiar"
  // desde el paso 2 vuelva con categoría y servicio elegidos todavía abiertos.
  const [categoriasAbiertas, setCategoriasAbiertas] = useState<ReadonlySet<string>>(() => new Set());
  const [profesionalesPorServicio, setProfesionalesPorServicio] = useState<
    Record<string, Carga<ProfesionalPublico[]>>
  >({});

  // Selección servicio+profesional — persiste entre paso 1 ↔ 2 ("Cambiar"
  // vuelve al paso 1 sin perderla del todo hasta que se elija otra).
  const [servicioElegido, setServicioElegido] = useState<ServicioPublico | null>(null);
  const [profesionalElegido, setProfesionalElegido] = useState<ProfesionalPublico | null>(null);

  // Paso 2 — TODOS los slots de hoy…hoy+DIAS_CALENDARIO en un único GET
  // (frontend.md 2026-09-21). Es el cache en memoria de UN solo par
  // servicioId:profesionalId (`claveDisponibilidad`): cambiar servicio o
  // profesional lo descarta. Sin TTL — un slot ocupado mientras la clienta
  // mira lo cubre el 409 del POST.
  const [slots, setSlots] = useState<Carga<Slot[]>>({ tipo: 'cargando' });
  const claveDisponibilidad = useRef<string | null>(null);
  // Día elegido en el calendario (yyyy-MM-dd local); null = vista default.
  const [diaElegido, setDiaElegido] = useState<string | null>(null);
  const [calendarioAbierto, setCalendarioAbierto] = useState(false);
  const disparadorCalendario = useRef<Element | null>(null);

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

  // Scroll-lock del fondo mientras algún sheet (datos o calendario) está
  // abierto (mockup v2: body.locked). El cleanup lo saca al cerrar o al
  // desmontar.
  useEffect(() => {
    if (!sheetAbierto && !calendarioAbierto) return;
    document.body.classList.add('sheet-abierta');
    return () => document.body.classList.remove('sheet-abierta');
  }, [sheetAbierto, calendarioAbierto]);

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
  function toggleCategoria(categoria: string) {
    setCategoriasAbiertas((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(categoria)) siguiente.delete(categoria);
      else siguiente.add(categoria);
      return siguiente;
    });
  }

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

    // Mismo par ya cargado (ej. "Cambiar" y volver a elegir lo mismo): se
    // reusa el cache, sin otro GET y conservando el día elegido. Cualquier
    // otro par lo invalida y resetea la fecha.
    if (claveDisponibilidad.current === `${servicio._id}:${profesional._id}` && slots.tipo === 'ok') return;
    setDiaElegido(null);
    cargarDisponibilidad(servicio._id, profesional._id);
  }

  // --- Paso 2: grilla ---
  function cargarDisponibilidad(servicioId: string, profesionalId: string) {
    const clave = `${servicioId}:${profesionalId}`;
    claveDisponibilidad.current = clave;
    setSlots({ tipo: 'cargando' });
    // Un único GET con hasta = hoy+DIAS_CALENDARIO; la vista de 7 días, el
    // calendario y "un solo día" leen del mismo array.
    const { desde, hasta } = rangoDisponibilidadUtc(DIAS_CALENDARIO);
    // Si mientras tanto se eligió otro par, la respuesta vieja se descarta.
    listarDisponibilidad({ servicioId, profesionalId, desde, hasta })
      .then((res) => {
        if (claveDisponibilidad.current === clave) setSlots({ tipo: 'ok', datos: res.slots });
      })
      .catch((err) => {
        if (claveDisponibilidad.current === clave) setSlots({ tipo: 'error', mensaje: mensajeDeError(err) });
      });
  }

  function abrirCalendario() {
    disparadorCalendario.current = document.activeElement;
    setCalendarioAbierto(true);
  }

  function cerrarCalendario() {
    setCalendarioAbierto(false);
    if (disparadorCalendario.current instanceof HTMLElement) disparadorCalendario.current.focus();
  }

  function elegirDia(clave: string) {
    setDiaElegido(clave);
    cerrarCalendario();
  }

  function cerrarSheetsAbiertos() {
    if (calendarioAbierto) cerrarCalendario();
    if (sheetAbierto) cerrarSheet();
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
  // sólo los slots de ese día local del cache de 30 días, el resto conserva
  // lo ya cargado. Si el día queda vacío se deshabilita solo en el calendario
  // (los días habilitados se derivan de los slots); y si era el día elegido,
  // se vuelve a la vista default — no hay estado vacío por día elegido.
  // servicio/profesional elegidos NO se pierden (siguen en estado).
  function manejarSlotOcupado(err: HttpError) {
    const detalle = err.detalle as { slots?: Slot[] } | undefined;
    const slotsDelDia = detalle?.slots ?? [];

    if (slotElegido) {
      const diaOcupado = claveDiaLocal(slotElegido.inicio);
      setSlots((prev) => {
        if (prev.tipo !== 'ok') return prev;
        const otrosDias = prev.datos.filter((s) => claveDiaLocal(s.inicio) !== diaOcupado);
        return { tipo: 'ok', datos: [...otrosDias, ...slotsDelDia] };
      });
      if (slotsDelDia.length === 0) {
        setDiaElegido((actual) => (actual === diaOcupado ? null : actual));
      }
    }

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
              categoriasAbiertas={categoriasAbiertas}
              servicioAbiertoId={servicioAbiertoId}
              profesionalesPorServicio={profesionalesPorServicio}
              onToggleCategoria={toggleCategoria}
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
            diaElegido={diaElegido}
            onCambiar={volverAlCatalogo}
            onElegirSlot={elegirSlot}
            onReintentar={reintentarDisponibilidad}
            onAbrirCalendario={abrirCalendario}
            onVerProximos={() => setDiaElegido(null)}
          />
        )}

        {paso === 3 && resultado && profesionalElegido && (
          <Exito resultado={resultado} profesionalNombre={profesionalElegido.nombre} />
        )}
      </main>

      {/* Footer de contacto: SOLO en el catálogo (paso 1), nunca sobre
          grilla/form/éxito — frontend.md §4.13. */}
      {paso === 1 && <Footer />}

      <div
        className={`scrim${sheetAbierto || calendarioAbierto ? ' scrim--open' : ''}`}
        onClick={cerrarSheetsAbiertos}
      />
      <aside
        className={`sheet${calendarioAbierto ? ' sheet--open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Elegir fecha"
        aria-hidden={!calendarioAbierto}
      >
        {calendarioAbierto && slots.tipo === 'ok' && (
          <Calendario
            diasConSlots={diasConSlots(slots.datos)}
            diaElegido={diaElegido}
            onElegir={elegirDia}
            onCerrar={cerrarCalendario}
          />
        )}
      </aside>
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
