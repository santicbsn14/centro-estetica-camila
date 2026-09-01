import type { HorarioDia } from '@shared/schemas/common.schema';

// Espejo a mano de ConfiguracionPanel (server/src/services/configuracion.service.ts)
// — sin schema Zod de respuesta del lado server (sólo los inputs lo tienen,
// mismo criterio que turnos/servicios/usuarios, frontend.md §4.4-4.6).

export interface ContactoCentro {
  telefonoE164: string;
  email: string;
  direccion: string;
}

export interface ConfiguracionPanel {
  id: string;
  nombre: string;
  timezone: string;
  horarios: HorarioDia[]; // techo duro del centro — nullable:false (§15.8)
  pasoGrillaMin: number;
  antelacionMinimaHoras: number;
  ventanaMaximaDias: number;
  cancelacionMinimaHoras: number;
  vencimientoPendienteHoras: number;
  contacto: ContactoCentro;
  creadoEn: string;
  actualizadoEn: string;
}
