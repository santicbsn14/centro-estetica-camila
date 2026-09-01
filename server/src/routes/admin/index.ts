import { Router } from 'express';
import { requireAuth, requireRol } from '../../middleware/auth';
import { serviciosAdminRouter } from './servicios.routes';
import { configuracionAdminRouter } from './configuracion.routes';
import { usuariosAdminRouter } from './usuarios.routes';
import { excepcionesAdminRouter } from './excepciones.routes';

// Namespace /api/admin — todo el CRUD administrativo (servicios, usuarios,
// excepciones, configuracion — modelo-datos-turnos.md §15.7). requireRol('admin')
// montado UNA vez acá, no repetido por cada ruta. Fija el patrón para los
// namespaces que siguen: cada recurso agrega su sub-router con
// `adminRouter.use('/recurso', recursoAdminRouter)`.
//
// Excepción a tener presente: "editar horarios propios" (§16) NO es
// admin-only — esa ruta puntual va aparte, con requireAuth + ownership, no
// bajo este namespace.
export const adminRouter = Router();

adminRouter.use(requireAuth, requireRol('admin'));
adminRouter.use('/servicios', serviciosAdminRouter);
adminRouter.use('/configuracion', configuracionAdminRouter);
adminRouter.use('/usuarios', usuariosAdminRouter);
adminRouter.use('/excepciones', excepcionesAdminRouter);
