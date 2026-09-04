import { useEffect, useMemo, useState } from 'react';
import { crearTurnoSchema, type CrearTurnoInput } from '@shared/schemas/turno.schema';
import { Button, Drawer, Input, Switch } from '../../../components/ui';
import { HttpError } from '../../../lib/http';
import { useAuth } from '../../../lib/auth';
import { normalizarTelefonoAR } from '../../../lib/format/telefono';
import { centavosAPesos } from '../../../lib/format/plata';
import { aLocal, claveDiaLocal, etiquetaDia, fechaHoraLocalUtc, formatHora, hoyLocalISODate } from '../../../lib/format/fecha';
import { listarUsuarios } from '../../profesionales/api';
import type { UsuarioPanel } from '../../profesionales/types';
import * as api from '../api';
import type { ResultadoCrearTurno, ServicioOpcion, SlotDisponible } from '../types';
import { GrillaHorario } from './GrillaHorario';

export interface NuevoTurnoDrawerProps {
  guardando: boolean;
  onCrear: (input: CrearTurnoInput) => Promise<ResultadoCrearTurno>;
  onCerrar: () => void;
}

interface Touched {
  nombre: boolean;
  telefono: boolean;
  servicio: boolean;
  profesional: boolean;
  horario: boolean;
}

const VENTANA_INICIAL_DIAS = 14;
const VENTANA_INCREMENTO_DIAS = 14;

// Mismo criterio que TurnosPage/ServiciosPage (frontend.md §2): mapear por
// `codigo`, nunca por texto. Acá casi todo cae en el mensaje genérico del
// server (403 SIN_PERMISO, 400 SERVICIO_NO_PRESTADO, 404
// PROFESIONAL_NO_DISPONIBLE, etc.) — el único código con manejo especial es
// 409 SLOT_OCUPADO, resuelto en el padre (TurnosPage.crearTurnoManual).
function mensajeError(err: unknown): string {
  if (err instanceof HttpError) return err.message;
  return 'Ocurrió un error inesperado. Probá de nuevo en unos segundos.';
}

// Alta manual — "Nuevo turno" (frontend.md §4.4, cierra el hueco de §4.1).
// Consume el MISMO POST /api/turnos público (§15.1 backend); el server deriva
// origen:'admin' de la sesión, no hay nada especial que armar acá aparte del
// body de crearTurnoSchema. Un solo submit, un solo request — nace CONFIRMADO
// directo, sin encadenar aprobar.
//
// Sólo se monta mientras está abierto (mismo criterio que ServicioDrawer/
// UsuarioDrawer) — arranca siempre desde cero.
export function NuevoTurnoDrawer({ guardando, onCrear, onCerrar }: NuevoTurnoDrawerProps) {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'admin';

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [servicioId, setServicioId] = useState('');
  // profesional: admin arranca sin elegir; profesional arranca fija en la
  // suya, no editable (frontend.md §4.4, CERRADO 2026-09-04 — el server
  // valida ownership real con 403 SIN_PERMISO, esto es sólo UX).
  const [profesionalId] = useState(esAdmin ? '' : (usuario?.id ?? ''));
  const [fueraDeHorario, setFueraDeHorario] = useState(false);
  const [touched, setTouched] = useState<Touched>({
    nombre: false,
    telefono: false,
    servicio: false,
    profesional: false,
    horario: false,
  });

  // Catálogo de servicios — GET público (§15.1), sirve para ambos roles.
  const [servicios, setServicios] = useState<ServicioOpcion[]>([]);
  const [cargandoServicios, setCargandoServicios] = useState(true);
  const [errorServicios, setErrorServicios] = useState<string | null>(null);

  // Profesionales activas — sólo admin, reusa listarUsuarios (frontend.md
  // §4.4: "reusar listarUsuarios ya existente"). Filtro cliente: activo +
  // atiende (§15.9 no expone un query param para esto).
  const [profesionales, setProfesionales] = useState<UsuarioPanel[]>([]);
  const [cargandoProfesionales, setCargandoProfesionales] = useState(esAdmin);
  const [errorProfesionales, setErrorProfesionales] = useState<string | null>(null);
  const [profesionalIdAdmin, setProfesionalIdAdmin] = useState('');

  const profesionalIdEfectivo = esAdmin ? profesionalIdAdmin : profesionalId;

  // Grilla (respetarGrilla true, el caso por defecto) — GET /api/disponibilidad,
  // mismo dato que consume client-publico.
  const [slots, setSlots] = useState<SlotDisponible[]>([]);
  const [cargandoSlots, setCargandoSlots] = useState(false);
  const [errorSlots, setErrorSlots] = useState<string | null>(null);
  const [diasVentana, setDiasVentana] = useState(VENTANA_INICIAL_DIAS);
  const [reintentarNonce, setReintentarNonce] = useState(0);
  const [slotElegido, setSlotElegido] = useState<SlotDisponible | null>(null);

  // Horario manual (toggle activado) — sólo entra en juego cuando
  // fueraDeHorario===true; el server sólo valida solape en ese caso, así que
  // la grilla (que sólo ofrece horarios YA válidos) no tiene sentido acá.
  const [fechaManual, setFechaManual] = useState(() => hoyLocalISODate());
  const [horaManual, setHoraManual] = useState('');

  // --- Carga del catálogo (una sola vez) ---
  useEffect(() => {
    const controller = new AbortController();
    api
      .listarServiciosActivos(controller.signal)
      .then(setServicios)
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setErrorServicios(mensajeError(err));
      })
      .finally(() => setCargandoServicios(false));
    return () => controller.abort();
  }, []);

  // --- Profesionales activas (sólo admin, una sola vez) ---
  useEffect(() => {
    if (!esAdmin) return;
    let vivo = true;
    listarUsuarios()
      .then((usuarios) => {
        if (!vivo) return;
        setProfesionales(
          usuarios
            .filter((u) => u.rol === 'profesional' && u.activo && u.atiende)
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
        );
      })
      .catch((err) => {
        if (!vivo) return;
        setErrorProfesionales(mensajeError(err));
      })
      .finally(() => {
        if (vivo) setCargandoProfesionales(false);
      });
    return () => {
      vivo = false;
    };
  }, [esAdmin]);

  // --- Grilla de disponibilidad: servicio+profesional elegidos, modo grilla ---
  useEffect(() => {
    setSlotElegido(null);
    if (fueraDeHorario || !servicioId || !profesionalIdEfectivo) {
      setSlots([]);
      setErrorSlots(null);
      setCargandoSlots(false);
      return;
    }
    const controller = new AbortController();
    let vivo = true;
    setCargandoSlots(true);
    setErrorSlots(null);
    const ahora = new Date();
    const desde = ahora.toISOString();
    const hasta = new Date(ahora.getTime() + diasVentana * 24 * 3600_000).toISOString();
    api
      .listarDisponibilidad({ servicioId, profesionalId: profesionalIdEfectivo, desde, hasta }, controller.signal)
      .then((res) => {
        if (!vivo) return;
        setSlots(res.slots);
      })
      .catch((err) => {
        if (!vivo) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setErrorSlots(mensajeError(err));
      })
      .finally(() => {
        if (vivo) setCargandoSlots(false);
      });
    return () => {
      vivo = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servicioId, profesionalIdEfectivo, fueraDeHorario, diasVentana, reintentarNonce]);

  const telefonoE164 = useMemo(
    () => (telefono.trim() ? normalizarTelefonoAR(telefono.trim()) : null),
    [telefono]
  );

  const inicioElegido = useMemo(() => {
    if (fueraDeHorario) {
      if (!fechaManual || !horaManual) return null;
      return fechaHoraLocalUtc(fechaManual, horaManual);
    }
    return slotElegido?.inicio ?? null;
  }, [fueraDeHorario, fechaManual, horaManual, slotElegido]);

  const candidato = useMemo(() => {
    if (!inicioElegido) return null;
    return {
      servicioId,
      profesionalId: profesionalIdEfectivo,
      inicio: inicioElegido,
      nombre: nombre.trim(),
      telefono: telefonoE164 ?? telefono.trim(),
      ...(fueraDeHorario ? { respetarGrilla: false as const } : {}),
    };
  }, [servicioId, profesionalIdEfectivo, inicioElegido, nombre, telefonoE164, telefono, fueraDeHorario]);

  const erroresSchema = useMemo(() => {
    if (!candidato) return {};
    const parsed = crearTurnoSchema.safeParse(candidato);
    return parsed.success ? {} : parsed.error.flatten().fieldErrors;
  }, [candidato]);

  const nombreInvalido = Boolean(erroresSchema.nombre);
  const telefonoInvalido = telefonoE164 === null || Boolean(erroresSchema.telefono);
  const servicioInvalido = !servicioId;
  const profesionalInvalido = !profesionalIdEfectivo;
  const horarioInvalido = !inicioElegido;
  const formValido = !nombreInvalido && !telefonoInvalido && !servicioInvalido && !profesionalInvalido && !horarioInvalido;

  function marcarTodoTocado() {
    setTouched({ nombre: true, telefono: true, servicio: true, profesional: true, horario: true });
  }

  // 409 SLOT_OCUPADO (frontend.md §4.4, "reusar el criterio" de client-publico
  // §4.11): el padre ya avisó por toast; acá sólo se refresca la grilla con
  // los slots frescos que trajo la respuesta y se limpia la selección vieja.
  // En modo manual (fueraDeHorario) no hay grilla montada — slotElegido ya es
  // null, así que el merge no toca nada, sólo queda que el operador retipee.
  function refrescarTrasSlotOcupado(slotsNuevos: SlotDisponible[]) {
    setSlots((actual) => {
      if (!slotElegido) return actual;
      const diaOcupado = claveDiaLocal(slotElegido.inicio);
      const otrosDias = actual.filter((s) => claveDiaLocal(s.inicio) !== diaOcupado);
      return [...otrosDias, ...slotsNuevos];
    });
    setSlotElegido(null);
  }

  async function confirmar() {
    marcarTodoTocado();
    if (!formValido || !candidato || guardando) return;

    const input: CrearTurnoInput = { ...candidato, telefono: telefonoE164! };
    const resultado = await onCrear(input);
    if (!resultado.ok && resultado.slotsOcupado) {
      refrescarTrasSlotOcupado(resultado.slotsOcupado);
    }
  }

  return (
    <Drawer
      abierto
      onCerrar={onCerrar}
      titulo="Nuevo turno"
      footer={
        <>
          <Button variant="secondary" disabled={guardando} onClick={onCerrar}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={guardando} onClick={confirmar}>
            {guardando ? 'Creando…' : 'Crear turno'}
          </Button>
        </>
      }
    >
      <div className="nuevo-turno__grid2">
        <Input
          label="Nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, nombre: true }))}
          placeholder="Nombre y apellido"
          error={touched.nombre && nombreInvalido ? 'Ingresá un nombre (mínimo 2 caracteres).' : undefined}
        />
        <Input
          label="Teléfono"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, telefono: true }))}
          placeholder="341 555-0000"
          error={touched.telefono && telefonoInvalido ? 'Teléfono inválido. Probá con código de área, ej: 341 555-2847.' : undefined}
          hint={touched.telefono && telefonoInvalido ? undefined : 'Le llega la confirmación por WhatsApp a este número.'}
        />
      </div>

      <div className="nuevo-turno__campo">
        <span className="input-field__label">Servicio</span>
        {cargandoServicios ? (
          <p className="nuevo-turno__ayuda">Cargando servicios…</p>
        ) : errorServicios ? (
          <p className="nuevo-turno__ayuda nuevo-turno__ayuda--error">{errorServicios}</p>
        ) : (
          <select
            value={servicioId}
            onChange={(e) => setServicioId(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, servicio: true }))}
          >
            <option value="">Elegí un servicio</option>
            {servicios.map((s) => (
              <option key={s._id} value={s._id}>
                {s.nombre} · {s.duracionMin} min{s.precio !== undefined ? ` · ${centavosAPesos(s.precio)}` : ''}
              </option>
            ))}
          </select>
        )}
        {touched.servicio && servicioInvalido ? <p className="nuevo-turno__error">Elegí un servicio.</p> : null}
      </div>

      <div className="nuevo-turno__campo">
        <span className="input-field__label">Profesional</span>
        {esAdmin ? (
          cargandoProfesionales ? (
            <p className="nuevo-turno__ayuda">Cargando profesionales…</p>
          ) : errorProfesionales ? (
            <p className="nuevo-turno__ayuda nuevo-turno__ayuda--error">{errorProfesionales}</p>
          ) : (
            <select
              value={profesionalIdAdmin}
              onChange={(e) => setProfesionalIdAdmin(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, profesional: true }))}
            >
              <option value="">Elegí quién atiende</option>
              {profesionales.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          )
        ) : (
          <p className="nuevo-turno__fija">Vos, {usuario?.nombre}</p>
        )}
        {touched.profesional && profesionalInvalido ? <p className="nuevo-turno__error">Elegí quién atiende.</p> : null}
      </div>

      <div className="nuevo-turno__campo">
        <Switch
          checked={fueraDeHorario}
          onChange={setFueraDeHorario}
          label="Cargar fuera del horario habitual"
          descripcion="Permite elegir cualquier horario, sin respetar la grilla — sólo valida que no se pise con otro turno."
        />
      </div>

      <div className="nuevo-turno__campo">
        <span className="input-field__label">Horario</span>

        {fueraDeHorario ? (
          <div className="nuevo-turno__manual">
            <div className="nuevo-turno__grid2">
              <label className="nuevo-turno__campo-manual">
                <span>Fecha</span>
                <input
                  type="date"
                  value={fechaManual}
                  onChange={(e) => setFechaManual(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, horario: true }))}
                />
              </label>
              <label className="nuevo-turno__campo-manual">
                <span>Hora</span>
                <input
                  type="time"
                  value={horaManual}
                  onChange={(e) => setHoraManual(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, horario: true }))}
                />
              </label>
            </div>
            <p className="callout callout--warn">
              Este turno queda marcado "fuera de horario" — no pasa por la grilla habitual de la profesional.
            </p>
          </div>
        ) : !servicioId || !profesionalIdEfectivo ? (
          <p className="nuevo-turno__ayuda">Elegí servicio y profesional para ver los horarios disponibles.</p>
        ) : (
          <GrillaHorario
            slots={slots}
            cargando={cargandoSlots}
            error={errorSlots}
            slotElegido={slotElegido}
            onElegir={setSlotElegido}
            onReintentar={() => setReintentarNonce((n) => n + 1)}
            onVerMasFechas={() => setDiasVentana((d) => d + VENTANA_INCREMENTO_DIAS)}
          />
        )}

        {touched.horario && horarioInvalido ? <p className="nuevo-turno__error">Elegí un horario.</p> : null}

        {!fueraDeHorario && slotElegido ? (
          <p className="nuevo-turno__resumen">
            Elegiste {etiquetaDia(aLocal(slotElegido.inicio))} · {formatHora(slotElegido.inicio)}–
            {formatHora(slotElegido.fin)}
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}
