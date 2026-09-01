import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CrearUsuarioInput, EditarUsuarioInput } from '@shared/schemas/usuario.schema';
import { Button, useToast } from '../../components/ui';
import { HttpError } from '../../lib/http';
import { listarServicios } from '../servicios/api';
import type { ServicioPanel } from '../servicios/types';
import * as api from './api';
import { FilaUsuario } from './components/FilaUsuario';
import { UsuarioDrawer, type ResultadoGuardar, type ResultadoToggle } from './components/UsuarioDrawer';
import type { UsuarioPanel, UsuarioPanelConTurnosFuturos } from './types';
import './ProfesionalesPage.css';

// Mensaje mapeado por `codigo` (nunca por texto, frontend.md §2) — mismo
// criterio que TurnosPage/ServiciosPage.
function mensajeError(err: unknown): string {
  if (err instanceof HttpError) return err.message;
  return 'Ocurrió un error inesperado. Probá de nuevo en unos segundos.';
}

// CRUD de usuarios/profesionales (frontend.md §4.6, admin-only — el gate de
// rol ya vive en App.tsx). Lista + drawer de alta/edición; sin DELETE, sólo
// Desactivar/Activar. A diferencia de servicios, el PATCH de desactivar
// puede traer `turnosFuturosActivos` — se informa, no bloquea (ver
// toggleActivo).
export function ProfesionalesPage() {
  const { mostrarToast } = useToast();

  const [usuarios, setUsuarios] = useState<UsuarioPanel[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Catálogo para el multiselect de servicios del drawer — reusa
  // routes/servicios/api.ts (frontend.md §4.6, punto 2: "reusar, no
  // reimplementar"). Si falla, el multiselect queda vacío; no es motivo para
  // romper la pantalla de profesionales.
  const [servicios, setServicios] = useState<ServicioPanel[]>([]);

  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState<UsuarioPanelConTurnosFuturos | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [toggleOcupadoId, setToggleOcupadoId] = useState<string | null>(null);
  const [reseteando, setReseteando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setUsuarios(await api.listarUsuarios());
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    listarServicios()
      .then(setServicios)
      .catch(() => {
        // ver comentario arriba: sin servicios cargados, el multiselect
        // simplemente no ofrece chips.
      });
  }, []);

  function abrirNuevo() {
    setEditando(null);
    setAbierto(true);
  }

  function abrirEdicion(id: string) {
    const u = usuarios.find((x) => x.id === id);
    if (!u) return;
    setEditando(u);
    setAbierto(true);
  }

  function cerrar() {
    setAbierto(false);
    setEditando(null);
  }

  async function guardar(payload: CrearUsuarioInput | EditarUsuarioInput): Promise<ResultadoGuardar> {
    setGuardando(true);
    try {
      if (editando) {
        await api.editarUsuario(editando.id, payload as EditarUsuarioInput);
        mostrarToast('Cambios guardados.', 'exito');
      } else {
        await api.crearUsuario(payload as CrearUsuarioInput);
        mostrarToast('Profesional creada.', 'exito');
      }
      setAbierto(false);
      setEditando(null);
      await cargar();
      return { ok: true };
    } catch (err) {
      // 409 EMAIL_DUPLICADO real del server (frontend.md §4.6, punto 4): el
      // chequeo local es sólo optimista, el server manda — se muestra inline
      // bajo el campo email, ver UsuarioDrawer.
      if (err instanceof HttpError && err.codigo === 'EMAIL_DUPLICADO') {
        return { ok: false, errorEmail: err.message };
      }
      mostrarToast(mensajeError(err), 'error');
      return { ok: false };
    } finally {
      setGuardando(false);
    }
  }

  // Desactivar/Activar: el PATCH SIEMPRE se aplica de una — no hay endpoint
  // de "preview" que devuelva turnosFuturosActivos antes de tocar nada
  // (§15.9: el conteo viaja en la MISMA respuesta del PATCH que ya
  // desactivó). Por eso acá no hay gate de confirmación previo a la
  // request, a diferencia del mockup (que sí puede "previsualizar" porque
  // trabaja con una fixture local): se desactiva primero y, si tenía turnos
  // futuros, se informa con la opción de deshacer ("Volver" vuelve a llamar
  // a esta misma función, que al ver activo:false en el usuario ya
  // actualizado, reactiva). Cumple igual "informar, no bloquear" — ver
  // bitácora.
  async function toggleActivo(): Promise<ResultadoToggle> {
    if (!editando) return { ok: false };
    setToggleOcupadoId(editando.id);
    try {
      const actualizado = await api.editarUsuario(editando.id, { activo: !editando.activo });
      setEditando(actualizado);
      await cargar();
      const conTurnosFuturos = actualizado.activo === false && (actualizado.turnosFuturosActivos ?? 0) > 0;
      if (!conTurnosFuturos) {
        mostrarToast(actualizado.activo ? 'Profesional activada.' : 'Profesional desactivada.', 'exito');
      }
      return { ok: true, turnosFuturosActivos: conTurnosFuturos ? actualizado.turnosFuturosActivos : undefined };
    } catch (err) {
      mostrarToast(mensajeError(err), 'error');
      return { ok: false };
    } finally {
      setToggleOcupadoId(null);
    }
  }

  async function resetPassword(nueva: string): Promise<boolean> {
    if (!editando) return false;
    setReseteando(true);
    try {
      await api.resetearPassword(editando.id, nueva);
      mostrarToast('Contraseña actualizada · comunicásela a la profesional.', 'exito');
      return true;
    } catch (err) {
      mostrarToast(mensajeError(err), 'error');
      return false;
    } finally {
      setReseteando(false);
    }
  }

  const ordenados = useMemo(() => [...usuarios].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), [usuarios]);
  const activos = usuarios.filter((u) => u.activo).length;

  return (
    <div className="profesionales-page">
      <div className="profesionales-page__head">
        <h1 className="profesionales-page__titulo">Profesionales</h1>
        <Button variant="primary" onClick={abrirNuevo}>
          + Nueva profesional
        </Button>
      </div>
      <p className="profesionales-page__sub">
        {usuarios.length} {usuarios.length === 1 ? 'usuario' : 'usuarios'} · {activos} activos
      </p>

      {error ? (
        <div className="profesionales-page__aviso profesionales-page__aviso--error">{error}</div>
      ) : cargando ? (
        <div className="profesionales-page__vacio">Cargando profesionales…</div>
      ) : ordenados.length === 0 ? (
        <div className="profesionales-page__vacio">Todavía no hay usuarios cargados.</div>
      ) : (
        <div className="fila-usuario-grupo">
          <div className="fila-usuario fila-usuario--header">
            <div>Profesional</div>
            <div>Rol</div>
            <div className="fila-usuario__atiende">Toma turnos</div>
            <div className="fila-usuario__servicios">Servicios</div>
            <div>Estado</div>
          </div>
          {ordenados.map((u) => (
            <FilaUsuario key={u.id} usuario={u} onAbrir={abrirEdicion} />
          ))}
        </div>
      )}

      {abierto ? (
        <UsuarioDrawer
          usuario={editando}
          usuariosExistentes={usuarios}
          servicios={servicios}
          guardando={guardando}
          toggleOcupado={toggleOcupadoId === editando?.id}
          reseteando={reseteando}
          onGuardar={guardar}
          onToggleActivo={toggleActivo}
          onResetPassword={resetPassword}
          onCerrar={cerrar}
        />
      ) : null}
    </div>
  );
}
