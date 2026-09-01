import session, { SessionOptions as ExpressSessionOptions } from 'express-session';
import MongoStore from 'connect-mongo';

// Sesiones server-side con cookie httpOnly, sin JWT. El store reusa la misma
// URI de Atlas que mongoose (una conexión propia de connect-mongo, no
// comparte el cliente — evita acoplar el orden de arranque a que mongoose ya
// esté conectado).

export interface SessionMiddlewareOptions {
  mongoUrl?: string;
  secret?: string | string[];
}

const SECRET_DEV_INSEGURO = 'dev-secret-INSEGURO-nunca-usar-en-produccion';
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // ~14 días

// Solo 'development' entra por la rama dev de la cookie (ver más abajo). Test
// (NODE_ENV='test', lo setea Vitest) NO cae acá a propósito — sigue por la
// rama de prod para no reabrir el contrato que ya cubre auth.routes.test.ts.
function esDev(): boolean {
  return process.env.NODE_ENV === 'development';
}

export function crearMiddlewareSesion(options: SessionMiddlewareOptions = {}): ReturnType<typeof session> {
  const config: ExpressSessionOptions = {
    name: 'sid',
    secret: options.secret ?? resolverSecretoDesdeEnv(),
    store: resolverStore(options.mongoUrl ?? process.env.MONGODB_URI),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      // Prod (NODE_ENV==='production'): 'auto', SIN CAMBIOS. Con SameSite=None,
      // Secure es requisito del browser en producción real — pero `secure:true`
      // literal hace que express-session DESCARTE el Set-Cookie entero cuando
      // la conexión no es https (ver issecure() en express-session/index.js:
      // "only send secure cookies via https"). En Render, detrás del proxy TLS,
      // `trust proxy` (abajo en app.ts) hace que `req.secure` lea
      // X-Forwarded-Proto y resuelva `true` ⇒ cookie sale con Secure, que es
      // lo que exige SameSite=None.
      // Test (NODE_ENV='test') pasa por esta misma rama a propósito, no por
      // la de dev: sobre http plano sin X-Forwarded-Proto, 'auto' resuelve
      // `false` ⇒ la cookie sale igual (sin Secure) en vez de no salir —
      // necesario para que el resto de la suite siga funcionando sobre http.
      // Ver auth.routes.test.ts para el caso con X-Forwarded-Proto que
      // reproduce el Set-Cookie real de Render (SameSite=None + Secure).
      // Dev (NODE_ENV==='development', `npm run dev`): `false` fijo. Front
      // (Vite, :5173) y API (:4000) son same-site en local (mismo
      // `localhost`, solo cambia el puerto) sobre http plano, sin mkcert —
      // no hay TLS real ni proxy que haga resolver `req.secure` a `true`.
      secure: esDev() ? false : 'auto',
      // None en prod/test: front y API quedan en dominios registrables
      // distintos (dominio pago propio vs *.onrender.com) — Lax no manda la
      // cookie en absoluto en ese caso y el login deja de funcionar. La
      // protección CSRF que daba Lax gratis se repone con el middleware de
      // header custom (ver middleware/auth.ts).
      // Lax en dev: local es same-site de verdad (mismo `localhost`), no
      // hace falta None — y Lax es lo que necesita el browser para aceptar
      // una cookie sin Secure sobre http plano.
      sameSite: esDev() ? 'lax' : 'none',
      maxAge: MAX_AGE_MS,
    },
  };

  return session(config);
}

// Soporta rotación: SESSION_SECRET puede ser una lista separada por comas. El
// primero firma sesiones nuevas; todos se prueban al verificar cookies
// existentes (agregar uno nuevo adelante, retirar el viejo más tarde).
function resolverSecretoDesdeEnv(): string | string[] {
  const raw = process.env.SESSION_SECRET;
  if (!raw) {
    console.warn(
      'SESSION_SECRET no está definida — usando un secreto de desarrollo inseguro. No usar en producción.'
    );
    return SECRET_DEV_INSEGURO;
  }
  const secretos = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return secretos.length > 1 ? secretos : secretos[0];
}

// Nombre de la colección de sesiones — exportado porque resetPasswordUsuario
// (§13/§15.9) necesita consultarla directo (vía mongoose.connection, no vía
// el store) para invalidar sesiones vivas al resetear una password.
export const SESIONES_COLLECTION = 'sesiones';

function resolverStore(mongoUrl: string | undefined) {
  if (!mongoUrl) {
    console.warn('MONGODB_URI no está definida — las sesiones NO persisten (MemoryStore, sólo dev sin DB).');
    return undefined;
  }
  return MongoStore.create({
    mongoUrl,
    collectionName: SESIONES_COLLECTION,
    // stringify:false (default de connect-mongo es true, JSON.stringify del
    // documento entero) — con el default, `usuarioId` queda enterrado dentro
    // de un string y no es filtrable por Mongo. En false, connect-mongo
    // guarda la sesión como subdocumento real: `session.usuarioId` queda
    // consultable con un query normal (lo usa resetPasswordUsuario).
    stringify: false,
  });
}
