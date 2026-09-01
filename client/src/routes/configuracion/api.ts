import { http } from '../../lib/http';
import type { EditarConfiguracionInput } from '@shared/schemas/configuracion.schema';
import type { ConfiguracionPanel } from './types';

// Wrapper delgado sobre el cliente HTTP del panel (credentials + CSRF ya
// resueltos ahí, frontend.md §4.0) — sólo forma las rutas de §15.8. Singleton:
// GET + PATCH, sin POST/DELETE (nace del seed).

export function obtenerConfiguracion(): Promise<ConfiguracionPanel> {
  return http.get<ConfiguracionPanel>('/api/admin/configuracion');
}

export function editarConfiguracion(input: EditarConfiguracionInput): Promise<ConfiguracionPanel> {
  return http.patch<ConfiguracionPanel>('/api/admin/configuracion', input);
}
