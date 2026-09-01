# Frontend — Sistema de Turnos · Camila González Belleza

**Estado:** etapa de diseño. Backend cerrado (ver `modelo-datos-turnos.md`); el
frontend consume, no reabre. Fase actual: mockups en el chat antes de scaffolding.
**Fuentes de autoridad, en orden:**
1. `propuesta_camiGonzalez_Belleza.docx` — contrato aprobado, define el alcance.
2. `modelo-datos-turnos.md` — backend y modelo de datos, CERRADO. Endpoints,
   shapes de respuesta, auth, forma de error. De acá se consume.
3. `CLAUDE.md` — orientación de repo para Claude Code.

---

## §1 Contexto

Frontend del sistema de gestión de turnos de un salón de estética (Rosario). Dos
superficies: el **panel** (Camila + profesionales, detrás de login) y la **web
pública** de reserva (clientas, sin registro). El backend ya está completo y
testeado; esta etapa construye las dos superficies que lo consumen.

**Stack:** React + TypeScript + Vite. API client con `credentials:'include'` en
todos los requests (cookie de sesión, §2/§4-hosting), errores mapeados por
`codigo`. Los schemas de Zod del backend (`shared/`) se reusan en el front para
validar formularios sin redefinir contratos (`crearTurnoSchema`, `horariosSchema`,
etc. — §10 backend).

### Cómo trabajamos

Mismo workflow que el backend. En el **chat**: decisiones de diseño y producto,
trade-offs, mockups visuales para iterar barato. En **Claude Code**:
implementación, archivos, comandos. El canal entre ambas superficies es este
`.md` (secciones cerradas + registro de implementación al final); no se pegan
resúmenes de código en el chat, se sincroniza el `.md`.

Al cerrar una decisión: (1) bloque para este archivo, (2) mensaje concreto para
Claude Code. Sin el paso 1 la decisión se pierde — las dos superficies no
comparten contexto.

Disciplina de tokens: Sonnet para implementación, `/clear` entre etapas cerradas
e independientes.

### Workflow — prueba de UX por entregable

Dos superficies de revisión, distintas:
- **Mockups en el chat:** Santiago reacciona al look y a la IA. No son
  ejecutables; sirven para iterar barato antes de construir.
- **Entregables de Claude Code:** cada tarea de implementación cierra con un
  "guión de prueba manual" en su bitácora (§5) — cómo levantar (comando), qué
  flujos clickear, y qué mirar (estados, errores, foco, responsive). Santiago
  prueba la UX real corriendo local, no leyendo resúmenes.

Cada mockup cerrado en el chat produce (1) bloque para §3/§4, y (2) — cuando
toque construir — mensaje para Claude Code + guión de prueba.

---

## §2 Contratos heredados del backend (cerrados, no se renegocian)

- **Fechas:** ISO UTC con sufijo Z siempre (`.toUTC().toISO()` con Luxon), nunca
  offset local — el server rechaza el formato con offset (§10 backend). Se
  reciben en UTC y se agrupan/muestran en hora local (`America/Argentina/
  Buenos_Aires`) con Luxon.
- **Teléfono:** normalizar con `libphonenumber-js` (`'AR'`, prefijo `+54 9`)
  ANTES de enviar. El server NO reconstruye área faltante ⇒ si el input no la
  trae, responde `TELEFONO_INVALIDO`. El form público debe garantizar un E164
  válido antes de habilitar el submit (§10 backend).
- **Plata:** enteros en centavos desde el server; ÷100 sólo para mostrar (formato
  ARS). Ningún decimal en el front.
- **Auth:** cookie httpOnly, sin token en el front. `GET /api/auth/me` al montar
  (saber si hay sesión y qué rol). 401 en cualquier request ⇒ redirigir a login.
- **Errores:** forma fija `{ codigo, mensaje, detalle? }`. Mapear SIEMPRE por
  `codigo`, nunca por el texto de `mensaje`.

---

## §3 Sistema de diseño — tokens base (CERRADO salvo fuente display)

Marca: monocromo de alto contraste, sin color de acento (hoja de marca). La UI
deriva una paleta funcional desaturada por encima de los 2 colores.

```
Marca:    tinta #151515 · papel #f8f7fb · blanco #ffffff
Neutros:  tinta-72 #4a4a4c · tinta-48 #7c7c7e · linea #e6e5eb · linea-fuerte #d4d3db
Estados de turno (texto / fondo de badge):
  pendiente  #7a5b12 / #f3ead0     confirmado #245c3b / #e0ecdf
  rechazado  #8f322c / #f4e3e1     cancelado  #57545e / #ececef
  completado #3a3a3d / #eceaf0     ausente    #7a4a2a / #f0e4da
Error de formulario: #8f322c / #f5e6e4 · linea #e8ccc8
```

Tipografía: display = Fraunces (serif, Google Fonts) · UI = Montserrat (400/500/600). DECISIÓN CERRADA 2026-08-25: la marca original usa "Marat Bold" (hoja de marca), pero se descartó gestionar la licencia webfont — costo/gestión innecesarios para el sitio. Fraunces queda como tipografía display DEFINITIVA, no stand-in. Nada que revisar en el futuro sobre esto.

Mayúsculas SÓLO en el lockup de marca (CAMILA GONZÁLEZ / SALÓN DE BELLEZA) y
micro-eyebrows tracked. Toda la UI funcional (labels, botones, errores) en
sentence case.

**Radios:** 10px controles · 12px cards · pill para badges · borders hairline .5px.

**Assets:** monograma "cg" extraído de la hoja de marca a PNG transparente (ink
#151515), reusable en login/header. Logo principal como lockup tipográfico
(monograma + wordmark serif + tagline tracked).

---

## §4 Decisiones y pantallas

### 4.0 Scaffolding y fundaciones del panel — DECISIÓN CERRADA

Se construye sobre `client/` (Vite+React+TS+@shared ya scaffoldeado por backend).

Router: React Router. `/login` fuera del guard; todo el resto detrás de un guard
de sesión. Bootstrap: `GET /api/auth/me` al montar la app → estado
{ usuarioId, rol } + loading. 401 en cualquier request (interceptor) → limpiar
sesión y redirigir a /login. Guard de rol: profesional NO accede a
/servicios /profesionales /configuracion /excepciones (redirect a /turnos). El
nav se arma según rol (§4.4).

Cliente HTTP del panel (un wrapper, no axios pesado salvo que se prefiera):
- `credentials:'include'` SIEMPRE.
- `X-Requested-With: XMLHttpRequest` en POST/PATCH/DELETE (CSRF, §2/§4.2).
- Base URL = `import.meta.env.VITE_API_URL`.
- Parse de error a `{ codigo, mensaje, detalle? }`; se mapea SIEMPRE por `codigo`.
- 401 → redirect login (global). El cliente PÚBLICO es otro, sin esto (fase pública).

[REEMPLAZAR en §4.0 el párrafo "Dev local por HTTPS (mkcert...)"]

Dev local — cookie y TLS (CORRIGE la versión previa): localhost:5173 (panel) ↔
localhost:4000 (API) es SAME-SITE (el puerto no cuenta para SameSite; mismo
esquema http↔http). Local NO reproduce el cross-site de prod (panel.camigonzalez.com
vs *.onrender.com = eTLD+1 distintos) ⇒ NO necesita https, ni SameSite=None, ni
mkcert. Cookie env-driven: dev = SameSite=Lax, Secure=false (viaja sobre http
same-site); prod = SameSite=None; Secure (contrato §16, intacto). Mantener AMBOS
lados en http en local (mezclar esquemas rompe schemeful-same-site; panel https +
server http rompe por mixed content). El almacenamiento de cookie cross-site
(SameSite=None) NO se ejercita en local — se valida contra un preview https de
Render. Sí se ejercita en local: CORS+credentials, header CSRF en mutantes, mapeo
por codigo, guards. mkcert/https-en-dev = camino opcional de alta fidelidad, fuera
del crítico.

Design system: tokens de §3 como CSS vars en `:root` + Montserrat/Fraunces
(stand-in de Marat). Primitivas extraídas de los mockups, reusadas en todo el
panel: Button, Input, Switch, Badge(estado), Drawer, Toast, y el **editor de
horarios** compartido (nullable configurable, §4.5).

Formularios: reusar los schemas de Zod de `@shared` (crearServicioSchema,
horariosSchema, etc.) para validar en el front antes de enviar (§2, §10 backend).

Estructura sugerida en `client/src`: `lib/` (http, auth, format fecha/plata/tel),
`components/` (primitivas), `routes/` (una carpeta por pantalla), `App.tsx`
(router + guards).

Referencia visual/estructural: los 4 mockups HTML (login/turnos/servicios/
profesionales) — clonar tokens, layout y componentes de ahí.

Interceptor 401: el redirect global a /login dispara SÓLO con codigo
NO_AUTENTICADO (sesión ausente/perdida). El 401 CREDENCIALES_INVALIDAS de
POST /api/auth/login es login fallido, se muestra inline (§4.3) — no redirige.
Mapear por codigo, no por status. (Ratifica la bitácora 2026-08-13.)

Logout: el panel cierra sesión desde el ícono del bloque de usuario en la sidebar.
AuthContext expone cerrarSesion() → POST /api/auth/logout (mutación) → limpia estado
+ redirige a /login; falla de red igual limpia local y redirige. (Omitido en la
tarea 2, completado como tarea propia.)


### 4.1 Orden de construcción — DECISIÓN CERRADA

Panel primero, después web pública. Secuencia interna del panel:
auth → turnos (listado/detalle/transiciones) → CRUD (servicios, usuarios,
configuración, excepciones).

**Por qué panel antes que pública:**
- De-risk temprano del contrato de sesión (cookie httpOnly cross-subdominio +
  CORS credentials, §4.2). Es el mayor desconocido de frontend y sólo se
  ejercita construyendo auth. La pública no usa auth ⇒ diferiría el riesgo más
  caro.
- El panel es autosuficiente para el loop de mensajería crítica: crea turnos
  (`origen:'admin'`, §15.1 backend) y dispara confirmacion / recordatorio_24h /
  cancelacion / rechazo. La pública dispara SÓLO `solicitud`. La mensajería es
  la prioridad #1 (propuesta) ⇒ se construye antes la superficie que la ejercita
  más.
- Orden natural de datos: la pública lee servicios/profesionales/horarios que
  carga el CRUD admin. Panel primero ⇒ la pública lee datos reales, sin seed
  manual del catálogo.

**Turnos antes que el CRUD de catálogo:** `TurnoPanelLista` trae
`profesional.nombre`/`servicio.nombre` del snapshot (§15.6 backend) ⇒ el listado
renderiza contra turnos sembrados sin que existan las pantallas de
servicios/usuarios. Slice messaging-crítico sin dependencia de UI hacia arriba.

**Trade-off aceptado:** la web pública (titular de la propuesta) y los contratos
novedosos (teléfono, grilla de slots, 409) se construyen después. Mitigado: están
especificados en el `.md`, bajo riesgo de diferir, y se montan sobre design
system + API client ya asentados.

### 4.2 Hosting y cookie de sesión — DECISIÓN CERRADA (revisada)

**Corrección sobre la versión anterior de esta sección:** la versión previa
asumía `api.camigonzalez.com` como subdominio propio. Se confirmó que la API
queda en el dominio gratuito por defecto de Render (`*.onrender.com`); sólo el
front tiene dominio pago. Son dominios registrables DISTINTOS — el escenario
"trampa" que esta misma sección advertía, del lado de la API. Esto invalida
la conclusión de Lax-sin-CSRF. Cerrado del lado del backend en
`modelo-datos-turnos.md` §16 ("Dominios separados — DECISIÓN CERRADA"),
implementado y testeado (127 tests server + 10 shared, ver §17 backend).
Esta sección sólo hereda esa decisión correctamente.

**Consecuencia para el front:**

- Cookie: `SameSite=None; Secure`, no `Lax`. Cross-site de verdad, no
  cross-subdominio same-site.
- **CSRF por header, no por token dedicado** (decisión del backend, no se
  reabre acá): todo request mutante (POST/PATCH/DELETE) contra una ruta
  autenticada necesita el header `X-Requested-With: XMLHttpRequest`. Sin él,
  403 `CSRF_HEADER_FALTANTE`. No aplica a GET ni a rutas públicas (ej.
  creación de turno desde la web pública).
- **`credentials: 'include'` (fetch) o `withCredentials: true` (axios) en
  TODOS los requests del panel**, mutantes o no — sin esto la cookie de sesión
  no viaja cross-site.
- Dev local NO necesita https (corrige nota previa): localhost:panel ↔
  localhost:api es same-site, la cookie env-driven va Lax/insecure sobre http.
  El cross-site (None+Secure) es de prod, se valida en un preview de Render. Ver
  §4.0.
- CORS: `origin` explícito = el dominio pago real del front (env var
  `PANEL_ORIGIN` del lado del server, hoy con default de dev
  `localhost:5173`). Cuando el dominio pago esté decidido, sólo hay que
  setear esa env var en Render — no tocar código.

**Lo que NO cambia de la versión anterior:** el host del SPA sigue siendo
indiferente a esta decisión — Render Static Site (free) sigue siendo la
elección, por los mismos motivos (CDN, no duerme, una sola cuenta). Cambiar
de proveedor de hosting del front no afecta nada de lo de arriba, porque el
problema nunca fue DÓNDE vive el front, sino que API y front son dominios
registrables distintos sin remedio (la API no tiene dominio propio).

**Pendiente no bloqueante, sin cambios:** uno vs. dos deploys de SPA — se
sigue cerrando en scaffolding.

### 4.2.1 Topología de apps — DECISIÓN CERRADA (cierra pendiente de §4.2)

Dos SPA separadas, no una con routing:
- `client/` (ya existe en el monorepo, Vite+React+TS, alias @shared) = **panel**.
- Web pública = app aparte, se agrega cuando lleguemos a ella (fase pública).

Motivo: distinto origen de deploy (panel.camigonzalez.com vs camigonzalez.com,
§4.2), distinto cliente HTTP (panel con credentials+CSRF; pública plana), distinta
superficie de auth (panel detrás de login; pública sin sesión). Bundles y
concerns separados. Comparten `shared/` (Zod) y, si conviene, una capa mínima de
tokens/primitivas. Ahora se scaffoldea SÓLO el panel.


### 4.3 Pantalla: Login (panel) — mockup cerrado

Puerta única del panel. La usan **admin y profesional** — misma pantalla; la
diferenciación por rol ocurre DESPUÉS de entrar (`GET /api/auth/me` devuelve el
rol y el panel se adapta). El eyebrow es genérico ("Panel de gestión"), no dice
"admin". La web pública NO pasa por acá en ningún punto.

Layout: lockup de marca (monograma + wordmark serif + tagline tracked) sobre una
card blanca con el formulario. Campos: email + contraseña con toggle de
visibilidad. Validación inline (campo vacío ⇒ hint bajo el campo).

Contrato de error aplicado:
- 401 `CREDENCIALES_INVALIDAS` ⇒ banner "Email o contraseña incorrectos", mapeado
  por `codigo`. Error genérico, no revela si falló usuario o contraseña (= §16
  backend).
- 429 `DEMASIADOS_INTENTOS` (rate limit login 10/15min, §16 backend) ⇒ mensaje
  claro "demasiados intentos, esperá unos minutos". PENDIENTE de implementación
  (no visible en el mockup).

Copy de reset: **sin self-service en v1** (§16/§15.9 backend). "¿Olvidaste tu
contraseña? Pedísela a Camila." — la admin resetea. No hay flujo de reset por
mail (fase 2).

Redirección: `GET /api/auth/me` al montar la app; 401 en cualquier request de
cualquier pantalla ⇒ volver acá.

"Cliente HTTP con credentials:'include' desde el primer request (GET /api/auth/me); dev local requiere https para que la cookie de sesión efectivamente pegue en el navegador (ver §4.2) — sin esto, 'login exitoso' en la respuesta de red puede convivir con usuario deslogueado en el siguiente request."

### 4.4 Pantalla: Listado de turnos + detalle (panel) — cerrado

Daily-driver del panel. Consume `TurnoPanelLista` (listado) y `TurnoPanel`
(detalle), §15.6. Sin redefinir shapes (hoy espejados a mano en
`routes/turnos/types.ts`; pendiente: mover esos shapes a `@shared` para evitar
drift).

Layout: sidebar role-aware (§16) + main con filtros + filas agrupadas por día.
Detalle en drawer lateral (no ruta aparte) — el operador triage sin perder la
lista.

Role-aware desde el vamos:
- profesional ⇒ nav reducido (sólo Turnos + Mi perfil), sin filtro de profesional,
  lista forzada a sus turnos (ownership por filtro, §15.6). NO 403 en el listado.
- admin ⇒ nav completo, filtro de profesional, columna profesional visible, ve
  todo.

Filas: hora(inicio/fin·dur) · cliente(nombre + telefonoE164 clickable `tel:`) ·
servicio(nombre + precio) · profesional(sólo admin) · estado/acciones.
- Badges de los 6 estados con la paleta funcional (tokens §3).
- Cola de acción: pendientes muestran chip de urgencia (vence en Xh, derivado de
  `expiraEn`) + Aprobar/Rechazar inline. Umbral "hot" = <3h (decisión UI, no
  backend).
- `fueraDeHorario` ⇒ marca visible en la fila y aviso en el detalle.
- Acciones inline SÓLO en pendientes; confirmados/terminales por el drawer.

Detalle (drawer): cliente, servicio/duración/precio, profesional, horario, origen,
e historial como timeline. Acciones por estado: pendiente→aprobar/rechazar/cancelar;
confirmado→cancelar/ausente; terminal→ninguna. Cancelar abre campo motivo
opcional (→ historial). NUNCA `tokenHash` ni `clientes.notas` (§15.6).

Historial / porTipo: el shape expone `porTipo: 'cliente' | 'usuario' | 'sistema'`
(enum real, turno.model.ts). `'usuario'` NO distingue admin vs profesional — ambos
escriben `'usuario'`; sólo queda `porId`, sin nombre resuelto. El front muestra:
`'cliente'` → "la clienta", `'usuario'` → "el equipo del salón", `'sistema'` → "el
sistema". No inventar distinción profesional-vs-admin. Mostrar el nombre real de
quién actuó ⇒ requiere que el backend resuelva `porId→nombre` DENTRO del historial
(el front no puede: una profesional no accede a `/api/admin/usuarios`). Mejora de
FASE 2.

Contratos aplicados: precio centavos ÷100 → ARS sólo para mostrar; `telefonoE164`
en crudo para `tel:`; fechas desde ISO UTC agrupadas por día local (Luxon).

PENDIENTE de implementación:
- `409 ESTADO_INVALIDO` en toda transición: releer y avisar "el turno ya cambió de
  estado", no asumir éxito (§15.4/15.5).
- Date-picker debe permitir rango en el pasado (listado sin clamp inferior, §15.6).
### Pendientes abiertos

- **Marat Bold — licencia webfont.** Verificar si Camila tiene kit web (woff2).
  Si no, cerrar fallback serif (candidato Fraunces). Bloquea congelar §3.
- **Manejo de `409 ESTADO_INVALIDO`** en transiciones del panel (impl, 4.4).
- **429 en login** (`DEMASIADOS_INTENTOS`) (impl, 4.3).
- **Date-picker con rango en pasado** para históricos (impl, 4.4).
**Cancelación pública por token (`tokenGestion`) — DECISIÓN CERRADA: fase 2.**
Verificado contra `propuesta_camiGonzalez_Belleza.docx`: el contrato firmado
promete que la clienta recibe notificación por WhatsApp/mail si el turno se
cancela, pero en ningún punto promete que la clienta pueda cancelar por sí misma
desde un link — eso fue una previsión del modelo de datos (`tokenGestion`), no un
compromiso de alcance. Hoy Camila cancela desde el panel (construido); la clienta
que quiere cancelar la contacta directamente, como ya haría sin el sistema.
Agregarla ahora implicaría (a) reabrir `modelo-datos-turnos.md` para un endpoint
público nuevo que valide el token/expiración/ventana de `cancelacionMinimaHoras`,
y (b) una pantalla nueva en `client-publico/` — dos superficies de trabajo por
una funcionalidad fuera del alcance firmado. Queda explícitamente diferida; si se
retoma, la decisión del endpoint se abre en el chat de backend (toca el modelo
cerrado), no acá.
- **Uno vs dos deploys de SPA** (4.2): se cierra en scaffolding.


---

### 4.5 Pantalla: CRUD de servicios (panel, admin) — mockup cerrado

Bajo /api/admin/servicios (§15.7), admin-only. Consume ServicioPanel. Lista
(todos, incl. inactivos) + drawer de alta/edición. Sin DELETE: sólo
Desactivar/Activar (borrado lógico, PATCH activo). El botón dice "Desactivar",
nunca "Eliminar".

Lista: nombre(+desc) · duración · limpieza(buffer) · precio(+ "oculto en la web"
si !mostrarPrecio) · horario(Hereda/Propio) · estado(activo/inactivo). Inactivos
atenuados. Ordenada por `orden`.

Form (drawer): nombre, descripción?, duración, limpieza(bufferPostMin, "ocupa
agenda, no se cobra"), precio (input en PESOS → se guarda en centavos, ÷100 sólo
display), mostrarPrecio (switch), horario (editor, ver abajo), orden.
- Nombre duplicado ⇒ NOMBRE_DUPLICADO inline (case-insensitive). Validación
  optimista en el front; la verdad la tiene el índice con collation del server —
  mostrar el 409 real, no confiar sólo en el chequeo local.
- Desactivar NO muestra conteo de turnos futuros (el server de servicios no lo
  devuelve, a dif. de usuarios §15.9). Sólo avisa que deja de ofrecerse.


### 4.6 Pantalla: CRUD de usuarios / profesionales (panel, admin) — mockup cerrado

Bajo /api/admin/usuarios (§15.9), admin-only. Consume UsuarioPanel (nunca
passwordHash). Lista (todos, incl. inactivos) + drawer de alta/edición.

Lista: nombre(+email) · rol(Admin/Profesional) · toma turnos(atiende Sí/No) ·
servicios(count) · estado. Inactivos atenuados.

Form (drawer): nombre, teléfono(aviso de turno nuevo, normalizado §2), email
(= credencial de login; al editar avisa "cambia con qué se loguea"), rol
(segmented), atiende (switch, "aparece en la web / no toma turnos nuevos sin dar
de baja"), servicios que presta (multi-select de chips; los ObjectId no se
validan contra existencia, §15.9), horario (editor nullable=false, sin toggle
Hereda), y contraseña — ver abajo.

Password NUNCA en el canal de datos (§15.9):
- Alta ⇒ campo "Contraseña inicial" (min 8). Se comunica por fuera (sin mail de
  reset en v1).
- Edición ⇒ NO hay campo password. Acción dedicada "Resetear contraseña" (admin
  pone una nueva, sin la vieja). Avisa que se cierran las sesiones abiertas de la
  profesional (§13, invalidación al resetear).
- (El cambio con la contraseña actual es self-service, va en /api/mi/*, §4.7.)

Reglas propias aplicadas:
- Email duplicado ⇒ EMAIL_DUPLICADO inline (case-insensitive, índice de login).
[CORRECCIÓN §4.6 — desactivar profesional con turnos futuros]
No hay preview: editarUsuarioPanel calcula turnosFuturosActivos DESPUÉS de aplicar
activo:false (§15.9). No se agrega endpoint de conteo previo (fuera de alcance;
"informar, no bloquear" nunca fue "confirmar antes"). Por lo tanto el flujo es
post-hoc, y el COPY debe reflejar que la desactivación YA ocurrió, no fingir un
pre-confirm:
- Click "Desactivar" → PATCH inmediato. Si turnosFuturosActivos > 0, el drawer
  queda abierto con un aviso: "{Nombre} quedó desactivada. Tiene N turnos futuros
  ya reservados — no se cancelaron. Reasignalos o cancelalos por WhatsApp."
- Acciones del aviso: "Entendido" (cierra) y "Reactivar" (segundo PATCH que revierte
  — etiquetado como reactivar, NO como "volver/cancelar", porque es lo que hace).
- El PATCH de reactivar debe manejar su propio error visible (toast): si falla,
  la profesional QUEDA desactivada y Camila tiene que saberlo — no dejar
  inconsistencia silenciosa entre lo que cree y lo que persistió.
- turnosFuturosActivos === 0 ⇒ toast normal + cierra, igual que servicios.

### 4.7 Pantalla: Configuración del centro (panel, admin) — sin mockup

Singleton, NO CRUD. Consume /api/admin/configuracion (§15.8): GET (lee el doc
completo) + PATCH parcial (.strict()). No hay POST/DELETE (nace del seed).
Admin-only. Shape ConfiguracionPanel = el doc completo (sin recorte, todo admin).
Sin mockup: reusar el shell del panel (sidebar + título serif) y las primitivas ya
cotejadas; misma cara visual que servicios/profesionales.

Es una página de ajustes: cargar → editar → guardar. Sin drawer. Guardado global
de campos "sucios" (ver abajo).

Tres secciones:
1. Datos del centro:
   - nombre (Input, min 2).
   - contacto { telefonoE164, email, direccion }. telefonoE164 = el teléfono del
     link de cancelación vencido; normalizar a E164 con libphonenumber ANTES de
     enviar (§2). Al editar, precargar el E164 crudo (mismo criterio que
     profesionales, no reconstruir formato local).
   - timezone: READONLY. Mostrar "Buenos Aires (no editable)". NO enviarlo nunca
     (el server lo rechaza por .strict()).
2. Horario del centro (techo duro):
   - <EditorHorarios nullable={false}/> — el mismo componente, sin segmentado
     Hereda. Help: "El horario en que el centro está abierto. Es el tope: los
     horarios de profesionales y servicios se recortan dentro de éste, nunca lo
     amplían."
3. Reglas de reserva (enteros, cada uno con sufijo de unidad + help):
   - pasoGrillaMin (≥5, "min") — "Cada cuántos minutos se ofrece un turno."
   - antelacionMinimaHoras (≥0, "hs") — "Mínimo de horas antes para reservar;
     también asegura tiempo de confirmar antes del vencimiento."
   - ventanaMaximaDias (≥1, "días") — "Con cuánta anticipación máxima se puede
     reservar."
   - cancelacionMinimaHoras (≥0, "hs") — "Hasta cuántas horas antes la clienta
     puede cancelar desde el link."
   - vencimientoPendienteHoras (≥1, "hs") — "Cuánto dura una solicitud sin
     confirmar antes de vencer sola."

Guardado: PATCH SÓLO de los campos que el usuario tocó (dirty-tracking). Clave para
horarios y contacto: son "si viene, reemplaza entero" — NO enviarlos si no se
editaron, para no pisar con una reconstrucción. Validar con editarConfiguracionSchema
/ horariosConfigSchema de @shared (los mismos del server). Errores por codigo.

Copy tranquilizador cerca de Guardar: "Los cambios aplican a nuevas reservas. Los
turnos ya tomados no se tocan (§15.8: pendientes ya congelaron su vencimiento,
confirmados su precio; achicar el horario no cancela turnos existentes)."

Sin 409/duplicados (singleton). Last-write-wins entre admins (aceptable a 2-6).
No cross-validar antelación vs vencimiento en el front (el server no lo hace);
como mucho, help text. Shape espejado a mano si no está en @shared (criterio turnos).


### Componente reusable: editor de horarios (sub-esquema §10 backend)

Se reusa en servicios / usuarios / configuración. Parametrizado por `nullable`:
- nullable=true (servicios): segmented "Hereda de la profesional | Horario propio".
  Hereda ⇒ horarios=null. Propio ⇒ editor semanal.
- nullable=false (usuarios, configuración): sin opción hereda, editor semanal directo.

Editor semanal: días Lun–Dom (display AR) mapeados a la convención backend
dia:0=domingo. Cada día: switch on/off; encendido ⇒ ≥1 bloque desde–hasta;
"Agregar bloque" para el corte del mediodía (array de bloques, no campo extra).
Reglas del horariosSchema aplicadas en el front (§10): día encendido sin bloques
imposible por construcción (togglear on crea un bloque; quitar el último apaga el
día) ⇒ nunca día-vacío ni array-vacío; sin días duplicados (un row por día);
hasta>desde; sin solape entre bloques; sin cruce de medianoche (type=time same-day).
Propio sin ningún día ⇒ error que empuja a "Hereda". PATCH manda el array COMPLETO
(reemplazo entero, §15.7), no diffs.

PENDIENTE de implementación: mostrar el 409 NOMBRE_DUPLICADO del server (no sólo el
chequeo local). Orden: input numérico en v1 (drag-and-drop → pulido posterior).

### 4.8 Pantalla: Excepciones (feriados / vacaciones / bloqueos) (panel, admin) — sin mockup

Cierra el CRUD del panel. Consume /api/admin/excepciones (§15.10): POST/GET/PATCH/
DELETE. Admin-only. En v1 la dueña carga las de todos (auto-gestión por profesional
= fase 2). ExcepcionPanel: id, profesionalId, desde, hasta, tipo, motivo?, creadoPor,
creadoEn. Espejar en types.ts si no está en @shared. Sin mockup: reusar shell +
primitivas + los patrones de fila/drawer de servicios/profesionales.

DELETE FÍSICO (único del sistema): el botón dice "Eliminar", NO "Desactivar", y
borra de verdad ⇒ confirmación irreversible ("Eliminar esta excepción? No se puede
deshacer."). Es la única pantalla con acción destructiva real — el resto son toggles.

Modelo de una excepción: profesionalId (null = todo el centro | id = una profesional),
desde/hasta (Date UTC), tipo ('feriado' | 'vacaciones' | 'bloqueo'), motivo?.
creadoPor lo pone el server (no el body). Las excepciones SÓLO restan disponibilidad
(nunca abren) — no hace falta que el front lo explique, pero informa el tono de la UI.

Lista: filtrada por ventana (default: de hoy en adelante / este mes — el listado
soporta desde/hasta) + filtro por profesional (trae las de ella + las del centro,
$in:[null,id], §5.1). Fila: tipo (tag), rango (fechas local), alcance ("Todo el
centro" | nombre de profesional), motivo. Acciones: editar, eliminar (con confirm).
Tag de tipo: tres tonos diferenciables tomados del set de §3 (NO hues nuevos);
documentar el mapping elegido.

Drawer de alta/edición:
- tipo (segmented: Feriado / Vacaciones / Bloqueo).
- alcance: "Todo el centro" | "Una profesional" → si profesional, select (poblar con
  listarUsuarios, reusar). Mapea a profesionalId null | id.
- fecha: desde/hasta (date pickers; hasta default = desde para día único). + toggle
  "Todo el día" (default ON): ON ⇒ el front arma desde = inicio del día local,
  hasta = fin del día local (00:00–23:59, §15.10), multi-día para vacaciones. OFF ⇒
  día único con time desde/hasta (para un bloqueo parcial, ej. "martes 14–16").
- motivo (opcional).

CONTRATO DE FECHAS (crítico, tercer punto del sistema con esto): el front arma los
dos instantes en local (Luxon, America/Argentina/Buenos_Aires) y envía
.toUTC().toISO() — ISO UTC con Z, NUNCA offset (el server rechaza offset). Mismo
contrato que inicio de turnos y el rango del listado. Escribirlo una vez en el
helper de fechas del front.

Validación: reusar crearExcepcionSchema/editarExcepcionSchema de @shared. Sólo
hasta > desde. NO validar solape entre excepciones (el backend a propósito no lo
hace — sólo restan, solapar es inocuo; contrasta con horarios, donde solape SÍ es
error). No inventar esa validación acá. Errores por codigo.

Nota de entrega (fuera de esta pantalla): precargar los ~15 feriados del año es un
buen detalle — es seed de datos (backend), no de esta UI.

### 4.9 Pantalla: Mi perfil (/api/mi/*) (panel, cualquier usuario) — sin mockup

Cierra el panel. Superficie de auto-gestión: /api/mi/* con requireAuth (NO admin),
recurso = sesión, SIN :id (§15.9). La usan profesional Y admin (para su propia
cuenta). Página de ajustes, no CRUD. Sin mockup: reusar shell + primitivas +
EditorHorarios; misma cara que configuración.

NAV: agregar "Mi perfil" al nav de TODOS los roles (hoy sólo lo tiene el nav de
profesional; la admin también lo necesita para cambiar SU contraseña con la actual,
que sólo existe en /api/mi/password). Ver §4.0.

Endpoints (recurso = sesión):
- GET   /api/mi/perfil    — mis datos (shape tipo UsuarioPanel, sin passwordHash)
- PATCH /api/mi/perfil    — editable ACOTADO (ver perfilMiSchema @shared)
- PATCH /api/mi/horarios  — mis horarios
- POST  /api/mi/password  — cambiar la mía, REQUIERE la actual

Tres secciones, cada una con su propio guardar (son 3 endpoints distintos):
1. Mis datos:
   - nombre: editable (PATCH /api/mi/perfil).
   - telefonoE164: editable SÓLO si perfilMiSchema lo acepta (normalizar §2 antes de
     enviar). Verificar contra el schema real; si no está, readonly.
   - email: readonly (credencial; la cambia el admin).
   - Bloque readonly de contexto: rol, "toma turnos" (atiende), servicios que presta.
     rol/atiende/servicios son admin-only aunque sean "míos" — si se mandan dan
     400 BODY_INVALIDO (§15.9). El front NO los envía; los muestra como info.
     Copy: "Tu rol, servicios y disponibilidad los administra Camila."
2. Mis horarios: <EditorHorarios nullable={false}/> → PATCH /api/mi/horarios.
3. Cambiar mi contraseña: contraseña actual + nueva (min 8) + repetir →
   POST /api/mi/password. Client-side: nueva===repetir, min 8 (reusar schema).
   Server verifica la actual (argon2) → si es incorrecta, error por codigo
   (401/403). Éxito → toast. NO asumir que cambiar la propia contraseña cierra la
   sesión (a dif. del reset del admin, §13 — verificar en la prueba).

Envío: sólo el subset editable de cada sección a su endpoint. Errores por codigo.
Nunca passwordHash. Shape espejado en types.ts si no está en @shared.


### 4.10 Scaffolding de la web pública — DECISIÓN CERRADA

Segunda SPA del monorepo (cierra §4.2.1): Vite+React+TS, alias @shared, hermana de
client/ (ej. client-publico/ o public/ — Claude Code decide el nombre según
convención del repo). Deploy en camigonzalez.com (§4.2), sin login.

Diferencias del panel, explícitas para que no se copien por inercia:
- SIN AuthProvider, SIN guards de sesión/rol, SIN router de login. Es anónima.
- Cliente HTTP PROPIO y más simple: SIN credentials:'include', SIN header CSRF
  (las rutas públicas — POST /api/turnos, GET /disponibilidad, GET /servicios* —
  no llevan sesión ni pasan por el gate CSRF del panel, §2/§4.2). Sólo depende de
  que el origen esté en la allowlist de CORS del server.
- Base URL apunta a la MISMA API (api.*.onrender.com / la que corresponda), vía su
  propio VITE_API_URL.
- Mobile-first (viewport ~420px como base, escala hacia arriba) — a diferencia del
  panel, que es desktop-first (uso en el mostrador).
- Design tokens de §3 compartidos (mismo look de marca), pero SIN sidebar/nav de
  panel: header simple con lockup + progreso de pasos.
- Sin roles ni RBAC de ningún tipo — toda la superficie es la misma para cualquier
  visitante.

Reusa de @shared: los schemas de Zod (crearTurnoSchema, etc.) para validar antes
de enviar, mismo criterio que el panel.


### 4.11 Pantalla: Reserva pública (catálogo → profesional → horario → datos) — mockup cerrado

Único flujo de la web pública v1. Referencia visual: mockups/reserva-camila.html
(en client/mockups/, movido/copiado a la carpeta de la app pública en su
scaffolding). Consume (§15.1/15.2/15.3, todos públicos, sin auth):
- GET /api/servicios — catálogo (activo:true, ordenado). Sólo nombre, descripcion,
  duracionMin, precio (SI mostrarPrecio), _id. NUNCA horarios/buffer.
- GET /api/servicios/:id/profesionales — SÓLO _id + nombre. NUNCA email/telefono.
- GET /api/disponibilidad?servicioId&profesionalId&desde&hasta — {slots: Slot[]}
  (Slot={inicio,fin} ISO UTC), lista plana. El front agrupa por día LOCAL (Luxon).
  Pedir sólo el tramo visible (semana), no los 60 días de ventana completa.
- POST /api/turnos — crea el turno pendiente. Body: servicioId, profesionalId,
  inicio (ISO UTC), nombre, telefono (crudo, el front normaliza a E164 antes de
  enviar), email?. NUNCA mandar precio/duracion/fin — el server los deriva (§3
  backend); mandarlos no tiene efecto pero no hay que construirlos ni mostrarlos
  como si el front los calculara.

4 pasos con indicador de progreso, SIN "cualquier profesional" (fuera de alcance,
§15.2 lo marca fase 2):
1. Catálogo (acordeón): lista de servicios activos; tap expande profesionales
   inline (avatar iniciales + nombre, nada más — el endpoint no trae más). Tap
   profesional → paso 2.
2. Grilla de horarios: resumen fijo arriba (servicio+profesional+"Cambiar" vuelve
   al paso 1 sin perder nada). Slots agrupados por día local, chips en grid. Si
   la ventana pedida da 0 slots, empty-state ("no quedan horarios, probá más
   adelante") — no es error (§15.2, config mal cargada también da array vacío sin
   error).
3. Datos (bottom sheet sobre la grilla, NO navegación de página): resumen del
   turno + nombre + teléfono (prefijo fijo "+54 9" + resto del número; el front
   arma el E164 completo con libphonenumber-js región 'AR' antes de enviar,
   cubre características de 2-4 dígitos) + email opcional. Validación inline
   antes de habilitar Confirmar.
4. Éxito: resumen + aviso de que la confirmación y el link de cancelación llegan
   por WhatsApp. Sin mostrar tokenGestion ni ningún dato interno (nunca viaja en
   la respuesta 201, §15.1).

MANEJO DE 409 SLOT_OCUPADO (corrección sobre el mockup — el mockup lo dispara al
tocar el slot para simplificar la demo; el real ocurre en el submit del PASO 3):
la clienta pudo llenar el form completo mientras el slot se ocupaba. El POST
/api/turnos devuelve 409 con {detalle:{slots: Slot[]}} — la grilla actualizada de
ESA profesional para ESE día, gratis (§15.1, mismo shape que el GET). En el 409:
cerrar el sheet, mostrar un toast/aviso ("ese horario se acaba de ocupar, elegí
otro"), volver al paso 2 con la grilla RE-RENDERIZADA desde detalle.slots (sin
otro GET), sin perder servicio/profesional elegidos. Los datos tipeados (nombre/
tel/email) se pueden conservar en memoria para no hacerla retipear si vuelve a
elegir otro horario — no es contrato, es cortesía de UX, a discreción de impl.

Fechas: igual contrato que turnos/excepciones del panel — instantes armados en
local (Luxon, America/Argentina/Buenos_Aires) y enviados .toUTC().toISO(), NUNCA
offset (§2).

Rate limits a tener en cuenta (no bloquean UI, pero si el server devuelve 429 hay
que mostrarlo, no fallar en silencio): POST /api/turnos 20/10min por IP;
GET /disponibilidad 60/min; GET /servicios* 60/min (§14 backend).


## §5 Registro de implementación

Bitácora de código, append-only — no especificación. La mantiene Claude Code.
Cada entrada: qué se implementó al cerrar una tarea, con qué archivos y con qué
resultado de test + el guión de prueba manual (§1, workflow). La especificación
(el qué y el porqué) vive en §1–§4; acá sólo el registro de que se hizo.

Contradicciones encontradas durante la implementación se marcan con
`⚠ REVISAR EN WEB:`, nunca se resuelven en silencio (mismo criterio que §17
backend).

### 2026-08-13 — Fundaciones del panel (scaffolding, §4.0)

Sin pantallas todavía (login es tarea 2, per encargo). Alcance: router + guards,
cliente HTTP, contexto de auth, dev https, tokens de diseño, primitivas vacías.

**Archivos nuevos, `client/src/`:**
- `App.tsx` (reescrito) — rutas: `/login` público; el resto detrás de
  `RequireSesion`, dentro de `PanelLayout`; `/servicios` `/profesionales`
  `/configuracion` `/excepciones` además detrás de `RequireRol(['admin'])`.
- `main.tsx` (reescrito) — `BrowserRouter > AuthProvider > ToastProvider > App`.
- `lib/http/client.ts`, `httpError.ts`, `index.ts` — wrapper sobre `fetch`,
  `credentials:'include'` siempre, header `X-Requested-With: XMLHttpRequest`
  en POST/PATCH/DELETE, base `VITE_API_URL`. Parsea el body de error con
  `errorApiSchema` (`@shared/schemas/common.schema`, reuso de Zod pedido en la
  tarea) y cae a un error genérico si el body no matchea el shape (5xx sin
  JSON, HTML de un proxy, etc.). Dispara `panel:no-autenticado` en `window`
  SÓLO cuando el 401 trae `codigo:'NO_AUTENTICADO'` — el 401
  `CREDENCIALES_INVALIDAS` de `POST /api/auth/login` NO dispara el interceptor
  global (ver nota debajo).
- `lib/auth/AuthContext.tsx`, `types.ts`, `index.ts` — `AuthProvider` pega
  `GET /api/auth/me` al montar, expone `{ usuario, loading, establecerSesion,
  refrescar }`; escucha `panel:no-autenticado` y redirige a `/login` con
  `useNavigate` (por eso vive dentro de `BrowserRouter`, no al revés).
- `routes/guards/RequireSesion.tsx`, `RequireRol.tsx`.
- `layout/PanelLayout.tsx`, `Sidebar.tsx` (+ `.css`), `nav.ts` — nav filtrado
  por rol, un solo array (`NAV_ITEMS`) como fuente de verdad.
- `routes/PantallaPendiente.tsx` — stub compartido por los placeholders de
  pantalla (`turnos/`, `mi/`, `servicios/`, `profesionales/`, `configuracion/`,
  `excepciones/`). `routes/login/LoginPage.tsx` (+ `.css`) — stub con
  lockup/tokens, sin formulario (tarea 2).
- `styles/tokens.css` — variables de §3 (marca, neutros, 6 estados de turno,
  error de formulario, radios, fuentes). `styles/global.css` — reset +
  `@import` de Montserrat/Fraunces desde Google Fonts (stand-in de Marat, ver
  §3 PENDIENTE).
- `components/ui/{Button,Input,Switch,Badge,Drawer,Toast}/` (+ `.css` cada
  una) y `ToastProvider.tsx` — primitivas tipadas, sin lógica de pantalla.
  `Badge` tipa `estado` como `EstadoTurno` de `@shared/schemas/common.schema`
  (reuso de Zod). Sin mockups HTML adjuntos en el prompt de esta tarea —
  estilos derivados directo de los tokens y de las descripciones de §3/§4.4-
  4.6, no clonados pixel a pixel de un mockup real; falta un pase de cotejo
  visual contra los mockups cuando estén disponibles en el chat.

**Archivos modificados:**
- `client/package.json` — sumado `react-router-dom@7.18.2`,
  `vite-plugin-mkcert@1.17.12` (devDep), script `dev:https`.
- `client/vite.config.ts` — plugin `mkcert()` (sólo actúa si Vite corre con
  `--https`, ver guión abajo).
- `client/vite-env.d.ts` — tipado de `ImportMetaEnv.VITE_API_URL`.
- `client/.env.example` (nuevo) — `VITE_API_URL`, con nota sobre el gap de
  https local (ver ⚠ abajo).

**Tests/typecheck:** `npm run typecheck` (shared+server+client) limpio.
`npx vitest run` sin cambios de conteo — sigue **127 server + 10 shared**
(no se tocó server/shared en esta tarea, no hay tests de client todavía:
fundaciones sin lógica de negocio que testear unitariamente). `npm run build
--workspace=client` OK (Vite build limpio, tsc --noEmit incluido).

**Decisión de implementación no pedida explícitamente, documentada acá por si
hace falta revisarla:** el interceptor 401 global sólo dispara con
`codigo:'NO_AUTENTICADO'`, no con cualquier 401. Motivo: `POST
/api/auth/login` también devuelve 401 (`CREDENCIALES_INVALIDAS`) y ese es un
login fallido que se muestra inline en la pantalla de login (§4.3), no "perdí
la sesión" — un interceptor ciego por status code rompería esa UX (redirigiría
a /login estando ya en /login, o pisaría el banner de error). Es consistente
con §4.3, no una contradicción; lo dejo anotado porque el texto de §4.0/§2 dice
"401 en cualquier request" sin la salvedad explícita.

**⚠ REVISAR EN WEB: https local no alcanza sólo con el client.**
RESUELTO EN WEB 2026-08-17: §4.0 corregido, dev en http same-site, no se necesita https local.
`server/src/middleware/session.ts` usa `cookie.secure:'auto'`, que resuelve
por `req.secure` — la conexión ENTRE EL BROWSER Y EL SERVER (o
`X-Forwarded-Proto` si hay proxy TLS delante, caso Render). No depende de qué
scheme tenga la pestaña del panel. Hoy `server/src/index.ts` levanta con
`app.listen(PORT)` en http plano, sin TLS ni proxy local. Consecuencia con la
tarea tal como está escrita ("Dev HTTPS: Vite server.https con mkcert"):
1. Si el panel corre en https (`npm run dev:https`) y el server sigue en http
   plano, el browser bloquea TODOS los fetches por *mixed content* — no sólo
   la cookie, la llamada entera a `/api/auth/me` o `/api/auth/login` ni sale.
2. Aunque no hubiera mixed content (ej. pegándole a un server ya https en
   Render desde el panel local), la cookie sale sin `Secure` cuando quien la
   emite es un server en http plano — y `SameSite=None` sin `Secure` es
   rechazada por browsers reales (exactamente el síntoma que describe §4.2:
   "login responde 200 pero la cookie no queda").

O sea: para reproducir el flujo de cookie cross-site de verdad en local hace
falta que el SERVER también termine TLS (o esté detrás de un proxy TLS local),
no sólo el client. Eso es cambio de servidor (`server/`), fuera del alcance
de esta tarea ("Trabajás en client/"). No lo resolví — opciones que veo, a
decidir en la sesión de arquitectura:
(a) un flag/env de dev en `server/src/index.ts` para levantar con
    `https.createServer` reusando el mismo cert de mkcert;
(b) un proxy TLS local delante del server (ej. `local-ssl-proxy`) documentado
    como script de dev, sin tocar código de server;
(c) aceptar que el flujo de cookie cross-site sólo se prueba de punta a punta
    contra un deploy real (Render, ambos lados https) y que local se queda en
    http-a-http para desarrollo funcional, con esta limitación documentada.

Esta tarea (fundaciones, sin login todavía) no depende de que la cookie
efectivamente pegue — el guión de abajo sólo ejercita el camino "sin sesión"
(401 esperado incluso sin cookie), así que no bloquea CERRAR esta tarea. Sí va
a bloquear la tarea 2 (login) si no se resuelve antes.

#### Guión de prueba manual

**Modo A — recomendado para esta entrega (http parejo, sin mixed content):**
1. `npm install` en la raíz (una vez).
2. Copiar `client/.env.example` a `client/.env` (`VITE_API_URL=http://localhost:4000`
   ya viene seteado).
3. `npm run dev` desde la raíz (server puerto 4000 + client puerto 5173).
4. Abrir `http://localhost:5173`.
   - Sin sesión ⇒ redirige a `/login` (el guard llamó a `GET /api/auth/me`,
     recibió 401 `NO_AUTENTICADO`, no hubo loop de redirect).
   - `/login` renderiza con los tokens: fondo papel, card blanca, monograma
     "cg" en Fraunces, wordmark en versalitas tracked, eyebrow "Panel de
     gestión" en minúsculas via CSS (mayúsculas sólo por `text-transform`, no
     en el string — ver §3).
   - Probar `/turnos`, `/servicios`, `/mi` a mano en la barra de direcciones
     sin sesión ⇒ todas terminan en `/login` (guard de sesión, no sólo la
     ruta índice).
5. Devtools → Network: confirmar que el request a `/api/auth/me` sale con
   `Content-Type` ausente (GET sin body) y SIN header `X-Requested-With` (es
   GET, no mutante) — y que si se prueba a mano un POST/PATCH contra el
   server (ej. `fetch('/api/auth/logout', {method:'POST'})` en la consola del
   browser apuntado a `VITE_API_URL`) sí sale con `X-Requested-With:
   XMLHttpRequest`.
6. Guard de rol: no verificable todavía end-to-end sin login real (tarea 2) —
   queda cubierto por lectura de código (`RequireRol` + `nav.ts`) hasta que
   haya sesión de verdad para probarlo clickeando.

**Modo B — https del panel (lo pedido en el ítem 4 de la tarea), con la
limitación de arriba:**
1. `npm run dev:https --workspace=client` (o `cd client && npm run dev:https`).
2. Primera vez: mkcert pide instalar una CA local de confianza — puede pedir
   permiso de administrador en Windows. Después de eso, certs quedan
   cacheados, no vuelve a pedir.
3. Abrir `https://localhost:5173` — cert confiado, sin warning del browser.
   Sirve para validar que Vite+mkcert están bien cableados y que la página
   carga por https.
4. Ojo: con `VITE_API_URL=http://localhost:4000` (server en http plano), CUALQUIER
   fetch real al server va a fallar por mixed content (ver ⚠ arriba) — para
   probar contra un backend real en este modo, apuntar `VITE_API_URL` a un
   server https (Render) en `client/.env`.

_(Entrada anterior: "Sin entradas todavía — no se escribió código de frontend.
Fase de mockups." — superada por esta.)_

### 2026-08-13 — Pantalla de login (panel, §4.3, tarea 2)

Formulario real sobre el stub de `routes/login/LoginPage.tsx` (antes sólo lockup
+ nota). Alcance: form email/contraseña, validación inline, submit contra
`POST /api/auth/login`, mapeo de errores por `codigo`, redirect si ya hay
sesión, y accesibilidad básica.

**⚠ REVISAR EN WEB: el mockup referenciado no existe en el repo.** El encargo
pedía clonar tokens/layout/componentes de `client/mockups/login-camila.html`
("cotejo visual pendiente del scaffolding"), pero ese archivo no está en el
working tree (`find` sobre todo el repo, excluyendo `node_modules`, sólo
encuentra `client/index.html` y `client/dist/index.html`). Construí la
pantalla directamente sobre la spec textual de §3 (tokens) y §4.3 (layout:
lockup + card blanca, campos email/contraseña con toggle, validación inline,
banner de error), reusando el mismo lockup que ya tenía el stub (coherente con
el resto del panel, ver entrada anterior). Falta el mismo pase de cotejo
visual pixel-a-pixel que ya quedó pendiente en la entrada de scaffolding — si
el mockup existe en otro lado (Claude Web, disco de Santiago) habría que
pegarlo en `client/mockups/` y cotejar layout/spacing/tipografía contra lo
construido acá.
RESUELTO EN WEB 2026-08-17: los 4 mockups están en client/mockups/ desde 2026-08-17.
**Archivos nuevos:** ninguno (todo sobre archivos ya scaffoldeados).

**Archivos modificados, `client/src/`:**
- `routes/login/LoginPage.tsx` — reescrito. Form controlado (email/password),
  toggle de visibilidad ("Mostrar"/"Ocultar" como botón de texto, no ícono —
  sin mockup que clonar para el ícono, ver ⚠ arriba; evita ambigüedad de
  `aria-label` sobre un glifo). Validación inline reusando `loginSchema` de
  `@shared/schemas/auth.schema` (pedido explícito del encargo, punto 2):
  `safeParse` sobre `{email, password}`, mapeado a hint por campo — vacío ⇒
  "Ingresá tu email"/"Ingresá tu contraseña", formato inválido de email ⇒
  "Ingresá un email válido". Submit → `http.post('/api/auth/login', ...)`
  (cliente del panel, ya trae `credentials`+CSRF); éxito ⇒
  `establecerSesion()` del `AuthContext` + `navigate(destino, {replace:true})`
  con `destino` = `location.state.from` (pathname+search) si vino de un
  redirect de `RequireSesion`, si no `/turnos`. Errores mapeados por `codigo`
  (`HttpError.codigo`), nunca por texto: 401 `CREDENCIALES_INVALIDAS` ⇒ banner
  "Email o contraseña incorrectos"; 429 `DEMASIADOS_INTENTOS` ⇒ "Demasiados
  intentos, esperá unos minutos" (cierra el pendiente de §4.3/"Pendientes
  abiertos" — el rate limit ya estaba implementado del lado del server,
  `server/src/routes/auth.routes.ts`, sólo faltaba el mensaje en el front);
  cualquier otro caso (5xx, red caída, `ERROR_DESCONOCIDO` del cliente HTTP)
  ⇒ mensaje genérico sin romper la pantalla (banner, no throw sin catch). Si
  `AuthProvider` ya trae `usuario` (sesión existente) ⇒ `<Navigate to="/turnos"
  replace/>` en vez de mostrar el form (punto 5 del encargo); mientras
  `loading` (bootstrap de `/api/auth/me` sin resolver todavía) se muestra
  "Verificando sesión…" en vez de flashear el form. A11y: labels asociadas
  (las trae la primitiva `Input`), `aria-invalid` vía `error` de `Input`,
  banner con `role="alert"` (equivalente a `aria-live="assertive"`, se anuncia
  al insertarse en el DOM), foco al primer campo con error tras un intento de
  submit fallido por validación local (`emailRef`/`passwordRef`).
- `routes/login/LoginPage.css` — reescrito acorde (banner de error, toggle
  compacto, layout de form). Mismos tokens que el stub (`--color-*`,
  `--radio-*`, `--fuente-display`), sin nada nuevo fuera de §3.
- `routes/guards/RequireSesion.tsx` — agregado `useLocation()` +
  `state={{from: location}}` al `<Navigate to="/login"/>`. No estaba en el
  stub de fundaciones (esa tarea no necesitaba la ruta de vuelta) pero es
  necesario para el punto 3 del encargo ("redirigir a location.state.from si
  existía") — sin esto, `LoginPage` no tiene de dónde leer `from`. Patrón
  estándar de react-router (guard pasa `from` por `state`, login navega ahí
  post-éxito); no toca lógica de auth, sólo agrega el dato a la redirección
  que el guard ya hacía.
- `components/ui/Input/Input.tsx` + `.css` — agregado prop opcional `suffix`
  (`ReactNode`), renderizado superpuesto al control vía un wrapper
  `input-field__row` posicionado `relative`. Necesario para el toggle de
  password (§4.3: "toggle de visibilidad") sin romper la primitiva existente
  — sigue sin lógica de negocio, puramente de layout, mismo criterio que el
  resto de `components/ui` (frontend.md §4.0). Sin este cambio no había forma
  de superponer el botón de toggle dentro del campo sin duplicar el markup de
  label/hint/error fuera de la primitiva.

**Tests/typecheck:** `npm run typecheck` (shared+server+client) limpio.
`npx vitest run` sigue **127 server + 10 shared** (no se tocó lógica de
server/shared en esta tarea). `npm run build --workspace=client` OK (`tsc
--noEmit` + `vite build` limpios). Sigue sin suite de tests de client
(ningún test runner configurado en `client/package.json` todavía — mismo
estado que la entrada de scaffolding).

#### Guión de prueba manual

1. `npm run dev` desde la raíz (server puerto 4000 + client puerto 5173).
   Requiere `server/.env` con `MONGODB_URI` apuntando a una réplica Mongo con
   al menos un usuario activo (admin o profesional) para loguearse de
   verdad — sin eso, `POST /api/auth/login` siempre da
   `CREDENCIALES_INVALIDAS` aunque el flujo esté bien. Si no hay usuario a
   mano: `SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... npm run seed:admin
   --workspace=server` (`server/src/scripts/seedAdmin.ts`, idempotente).
2. Login OK: abrir `http://localhost:5173/login`, completar email+contraseña
   válidos, submit ⇒ redirige a `/turnos`. Refrescar la página en `/turnos`:
   la sesión persiste (cookie `Lax` dev, same-site http↔http local — ver
   §4.0/§4.2, no hace falta https acá). Devtools → Application → Cookies:
   confirmar que existe la cookie `sid`.
3. Credenciales malas: email inexistente o contraseña incorrecta ⇒ banner
   "Email o contraseña incorrectos" inline, sin redirect, sin decir cuál de
   los dos campos falló. Confirmar que el campo password se vacía o no —
   (queda como está: no se limpia el password a propósito, para no forzar
   retipear si sólo el email estaba mal; si Santiago prefiere limpiarlo,
   avisar y se ajusta).
4. Validación local: submit con campos vacíos (sin tocar el server) ⇒ hints
   "Ingresá tu email"/"Ingresá tu contraseña" bajo cada campo, foco va al
   email (primer campo con error). Email con formato inválido (`asd`) ⇒
   "Ingresá un email válido".
5. Toggle de contraseña: click en "Mostrar" ⇒ el campo pasa a `type=text` y
   el botón pasa a decir "Ocultar"; confirmar que el valor no se pierde al
   togglear.
6. Ruta guardada sin sesión: en una pestaña sin cookie (incógnito o borrar
   cookies), ir directo a `http://localhost:5173/turnos` ⇒ `RequireSesion`
   redirige a `/login` con `state.from` seteado; loguearse ⇒ vuelve a
   `/turnos` (no hace falta un segundo click). Repetir apuntando a
   `/servicios` (sólo si el usuario de prueba es admin) para confirmar que
   `from` conserva la ruta pedida, no siempre `/turnos`.
7. Sesión ya activa: con sesión válida, navegar a mano a `/login` ⇒ redirige
   de inmediato a `/turnos`, nunca se ve el formulario.
8. 429: no hay guión corto para esto sin automatizar — el límite es 10
   intentos/15min (`server/src/routes/auth.routes.ts`). Si hace falta
   validarlo a mano, mandar 11 `POST /api/auth/login` seguidos desde la
   consola del browser contra `VITE_API_URL` y confirmar que el 11º da 429
   con el mensaje "Demasiados intentos, esperá unos minutos" en el banner
   (hay que disparar el submit del form en el 11º intento real, o levantar
   una pantalla de prueba — no hay endpoint de reset del contador).

### 2026-08-17 — Listado + detalle + transiciones de turnos (panel, §4.4, tarea 3)

Pantalla real sobre el stub de `routes/turnos/TurnosPage.tsx`. Alcance: listado
role-aware agrupado por día local, filtros (estado/fecha/profesional), drawer
de detalle con historial en timeline, y las 4 transiciones de panel
(aprobar/rechazar/cancelar/ausente) con manejo explícito de `409
ESTADO_INVALIDO`. Consume `TurnoPanel`/`TurnoPanelLista` (§15.6 backend) sin
redefinir shapes — se tipan a mano en `types.ts` porque esas respuestas no
tienen schema Zod del lado server (sólo los inputs lo tienen).

**Archivos nuevos, `client/src/`:**
- `lib/format/fecha.ts` — helpers Luxon: huso `America/Argentina/
  Buenos_Aires` fijo (`TIMEZONE_CENTRO`), conversión ISO UTC→local
  (`aLocal`), conversión de un `<input type="date">` (string sin huso) al
  instante UTC de inicio/fin de ESE día EN el huso del centro
  (`inicioDiaLocalUtc`/`finDiaLocalUtc` — no el huso del browser, mismo
  criterio transversal de CLAUDE.md: "día de la semana siempre en
  America/Argentina/Buenos_Aires con Luxon, nunca sobre UTC crudo"),
  etiqueta de grupo de día (`etiquetaDia`: "Hoy · ...", "Mañana · ...",
  "Ayer · ...", o fecha larga con año si no es el año en curso) y
  `agruparPorDiaLocal` (agrupa preservando el orden que ya trae el server,
  inicio asc — no reordena).
- `lib/format/plata.ts` — `centavosAPesos` con `Intl.NumberFormat('es-AR')`,
  ÷100 sólo para mostrar (§2).
- `routes/turnos/types.ts` — `TurnoPanel`/`TurnoPanelLista` tipados a mano
  (espejo de `server/src/services/turnos.service.ts`), más `OrigenTurno`/
  `PorTipoHistorial` (espejo de `server/src/models/turno.model.ts` — no
  viven en `@shared`, sólo `EstadoTurno` vive ahí y se reusa).
- `routes/turnos/api.ts` — wrapper delgado sobre `lib/http`: `listarTurnos`,
  `obtenerTurno`, `aprobarTurno`, `rechazarTurno`, `marcarAusente`,
  `cancelarTurno(id, motivo?)`, y `listarProfesionales()` (recorta
  `GET /api/admin/usuarios` a `{id,nombre,activo}` de rol `profesional`,
  para el filtro admin — sólo se llama si `usuario.rol==='admin'`).
- `routes/turnos/components/ChipUrgencia.tsx` — "vence en Xh/min" desde
  `expiraEn`; umbral hot <3h (decisión de UI, no backend, tal como aclara
  §4.4).
- `routes/turnos/components/FilaTurno.tsx` — fila de listado: hora,
  cliente+`tel:`, servicio+precio, profesional (sólo si `mostrarProfesional`),
  y a la derecha: si `pendiente` → chip de urgencia + Aprobar/Rechazar
  inline (sin motivo, ver ⚠ más abajo); cualquier otro estado → `Badge`.
  Toda la fila es clickable (rol="button" + Enter/Espacio) y abre el drawer;
  los botones inline cortan la propagación para no abrir el drawer al
  aprobar/rechazar desde la fila.
- `routes/turnos/components/DetalleTurno.tsx` — cuerpo del drawer: badge +
  nombre + tel/email, aviso de `fueraDeHorario`, filas
  servicio/duración/precio/profesional/fecha/horario/origen, e historial
  como `<ul>` timeline (`porTipo` mapeado a texto humano, ver ⚠ abajo).
  Nada de `tokenHash`/`notas` — no hace falta filtrarlos a mano, `TurnoPanel`
  (types.ts) no los declara.
- `routes/turnos/components/AccionesTurno.tsx` — footer del drawer,
  parametrizado por `estado`: pendiente → aprobar (directo) / rechazar
  (gate de confirmación sin motivo) / cancelar (gate con motivo opcional);
  confirmado → cancelar (gate con motivo) / marcar ausente (directo);
  terminal → texto "sin acciones disponibles". El gate de confirmación es
  el mismo patrón `askMotivo` del mockup (un paso intermedio que reemplaza
  los botones, no un `window.confirm`).
- `routes/turnos/TurnosPage.tsx` (reescrito) — orquesta todo: estado de
  filtros (segmento por estado con contador, rango de fecha con
  `<input type="date">` nativo sin `min` — permite pasado, filtro de
  profesional sólo si admin), fetch de listado (sin mandar `estado` al
  server: se pide toda la ventana una sola vez y el segmento se resuelve en
  el cliente, mismo patrón que el mockup — a esta escala, decenas de
  turnos/semana, es más simple que refetchear por tab y el propio backend
  lo permite, §15.6 dice que `estado` es opcional), agrupado por día local,
  drawer de detalle (fetch propio al abrir), y `ejecutarAccion` — el único
  camino para las 4 transiciones: SIEMPRE refetchea lista + detalle al
  terminar (éxito o error), nunca parchea el estado local de forma
  optimista. Un 409 `ESTADO_INVALIDO` dispara un toast informativo distinto
  ("ya cambió de estado — actualizando") pero cae por el mismo camino de
  relectura que el éxito — así el pendiente de §4.4 ("releer y avisar, no
  asumir éxito") queda cerrado sin una rama de código aparte.
- `routes/turnos/TurnosPage.css` — clonado de
  `client/mockups/turnos-camila.html` (grid de fila, badges con punto,
  segmentado, timeline con línea vertical, `.flag` de fuera de horario)
  traducido a las primitivas ya existentes en vez de reimplementarlas.

**Archivos modificados:**
- `client/package.json` — sumado `luxon@^3.5.0` + `@types/luxon` (misma
  versión que usa `server/package.json`, para no divergir de comportamiento
  entre el cálculo de disponibilidad del server y el agrupado por día del
  front).
- `components/ui/Drawer/Drawer.tsx` + `.css` — agregado prop opcional
  `footer?: ReactNode`, renderizado en una barra fija al pie
  (`drawer__footer`), fuera del área con scroll (`drawer__contenido`).
  Necesario porque `AccionesTurno` tiene que quedar visible sin scrollear
  el historial — mismo criterio que el `suffix` agregado a `Input` en la
  tarea de login (extender una primitiva vacía cuando hace falta, sin
  meterle lógica de turnos). Reusable después por los drawers de alta/
  edición de servicios/usuarios (§4.5/§4.6, footer con "Guardar").
- `components/ui/Badge/Badge.css` — sumado el punto (`::before`) y `gap`
  que tenía el mockup (antes el badge no lo dibujaba); sólo CSS, sin tocar
  `Badge.tsx`.
- `styles/global.css` — sumada la utilidad `.num` (tabular-nums), clonada
  del mockup, para hora/precio/duración en toda la fila.
- `server/package.json` — sumado el script `seed:turnos`.

**Archivo nuevo, `server/src/scripts/seedTurnos.ts`:** ver guión de prueba
abajo — inserta turnos directo al modelo (no pasa por `crearTurno`, que exige
slot realmente libre en la grilla) cubriendo los 6 estados + los dos casos de
urgencia (pendiente hot/no-hot) + `fueraDeHorario`. Idempotente por prefijo
de código `TRN-SEED-*`: si ya corrió, no duplica. Usuarios/servicios/clientas
de apoyo son find-or-create genuino (por si `seed:admin` ya corrió pero este
script es la primera vez). Probado contra un replica-set en memoria
(smoke test manual, no quedó como test automatizado — es un script, no
lógica de negocio nueva del server): primera corrida inserta 10 turnos,
segunda corrida (idempotencia) no duplica.

**Tests/typecheck:** `npm run typecheck` (shared+server+client) limpio.
`npx vitest run` sigue **127 server + 10 shared** (no se tocó lógica de
negocio de server/shared — sólo se agregó un script). `npm run build
--workspace=client` OK (`tsc --noEmit` + `vite build` limpios). Sigue sin
suite de tests de client (mismo estado que las entradas anteriores).

**⚠ REVISAR EN WEB: `POST /api/turnos/:id/rechazar` no acepta `motivo`,
a diferencia de `cancelar`.** frontend.md §4.4 dice "rechazar/cancelar
abren campo motivo (opcional → historial, §15.5)" — agrupando ambas
acciones. Pero mirando el backend (`server/src/services/turnos.service.ts`):
`ejecutarTransicion` SÍ soporta `motivo` de forma genérica para las 4
transiciones (lo pushea al historial sin importar cuál sea). El gap está
en la ruta: `server/src/routes/turnos.routes.ts`, `POST /:id/rechazar` NO
parsea `req.body` en absoluto — llama a `rechazarTurno({turnoId, usuario})`
sin `motivo`, mientras que `POST /:id/cancelar` sí parsea
`cancelarTurnoPanelSchema` y lo pasa. Es decir: el service ya sabría
guardarlo, pero la ruta de rechazar lo tira al piso en silencio si alguien
lo manda. Decidí NO ofrecer el campo motivo en el flujo de rechazar del
front (`AccionesTurno.tsx` sólo pide confirmación, sin textarea) — ofrecer
un campo que el usuario llena y que después desaparece sin aviso es peor
que no ofrecerlo. Si la intención real es que rechazar también tenga
motivo (lo más probable, dado que el service ya lo soporta), es un cambio
de una línea en la ruta (agregar el parseo de body ahí también) — pero eso
es un cambio de backend, no lo toco desde acá. Si en cambio la intención es
que rechazar NUNCA tenga motivo, no hay nada que arreglar y esto se cierra
solo. Avisar a Santiago.
RESUELTO EN WEB 2026-08-17: decisión "mínimo" — rechazar NO lleva motivo. Nada que cambiar.

**⚠ REVISAR EN WEB: la redacción de §4.4 sobre `porTipo` no matchea el
enum real.** El encargo de esta tarea (y frontend.md §4.4) describen el
historial como "clienta / la profesional / el sistema". El enum real
(`server/src/models/turno.model.ts`, `PorTipoHistorial`) es
`'cliente' | 'usuario' | 'sistema'` — `'usuario'` cubre TANTO a la
profesional COMO al admin actuando (`ejecutarTransicion` siempre escribe
`porTipo:'usuario'`, sea quien sea `req.usuario`). No hay forma de saber
desde el shape de `TurnoPanel` si una entrada con `porTipo:'usuario'` la
hizo la profesional dueña del turno o Camila (admin) actuando por ella —
sólo se tiene `porId` (el id de quien actuó), sin nombre resuelto en el
propio historial. Implementé `DetalleTurno.tsx` mostrando `'usuario'` como
"el equipo del salón" (honesto con lo que el dato realmente distingue) en
vez de inventar una distinción clienta-vs-profesional que el backend no
guarda. Si se quiere mostrar el nombre real de quien actuó, hace falta que
el backend resuelva `porId` a nombre en el propio historial (o que el
front tenga un directorio de usuarios para resolverlo — hoy sólo el admin
tiene acceso a `/api/admin/usuarios`; una profesional viendo el historial
de su propio turno no podría resolver el nombre de Camila si fue ella
quien actuó). Decisión de producto, no la resuelvo acá.
RESUELTO EN WEB 2026-08-17: §4.4 corregido al enum real; "el equipo del salón" para 'usuario'; nombres reales = fase 2.

**Simplificaciones sobre el mockup, documentadas por si hace falta
revisarlas (no son ⚠, son criterio de implementación):**
- El mockup muestra un botón "kebab" (⋮) en filas `confirmado` que abre el
  drawer, separado de hacer click en la fila. Acá la fila entera ya es
  clickable (para cualquier estado, no sólo confirmado) — un kebab
  adicional sería redundante, así que no se clonó ese elemento puntual.
- El mockup ofrece motivo (textarea) tanto para rechazar como cancelar
  desde el drawer. Por el gap de backend de arriba, acá sólo cancelar lo
  ofrece; rechazar pide confirmación sin texto libre.
- Fila/drawer no muestran "hoy"/"mañana" en el `<dt>Fecha</dt>` del drawer
  con el mismo formato corto que las filas — reusan `etiquetaDia`
  (`lib/format/fecha.ts`), así que si el drawer se abre para un turno de
  "anteriores" (por ejemplo hace 3 días), va a mostrar la fecha larga en
  vez de repetir "anteriores" — es información más específica, no una
  regresión.

#### Guión de prueba manual

Necesita turnos sembrados en varios estados — no hay forma de probar
filtros/urgencia/drawer/transiciones contra una base vacía.

1. `npm install` en la raíz (trae `luxon` nuevo).
2. `server/.env` con `MONGODB_URI` apuntando a una réplica Mongo (local o
   Atlas — recordar que las transacciones exigen replica set, §11).
3. `SEED_ADMIN_EMAIL=admin@test.local SEED_ADMIN_PASSWORD=Cambiar123! npm
   run seed:admin --workspace=server` (si no corrió antes en esta base).
4. `npm run seed:turnos --workspace=server` — inserta 10 turnos de prueba
   (prefijo de código `TRN-SEED-`) y de paso crea una profesional
   `rocio.seed@camigonzalez.local` / `Cambiar123!` (o el valor de
   `SEED_PROF_PASSWORD` si se seteó). Correrlo de nuevo no duplica nada
   (idempotente, avisa por consola y sale).
5. `npm run dev` desde la raíz, loguearse como admin
   (`admin@test.local`/`Cambiar123!`) en `http://localhost:5173/login`.
6. **Listado/agrupado:** en `/turnos` deberían verse varios grupos de día
   ("Hoy", "Mañana" y las fechas de los turnos históricos, agrupados por
   día local AR aunque el reloj del sistema esté en otro huso) con 10
   filas en total. Columna "Profesional" visible (admin). El header dice
   "3 turnos pendientes por revisar" — el contador es sobre TODOS los
   pendientes del rango de fecha cargado (hoy × 2 + mañana × 1), no sólo
   los de hoy; si no da 3, revisar `RANGO_DEFAULT_DIAS` en
   `TurnosPage.tsx` contra la fecha real (el default cubre 30 días desde
   hoy, así que el de mañana siempre debería entrar).
7. **Urgencia:** la fila de Sofía Ramírez (pendiente, vence en ~2h) muestra
   el chip en rojo ("hot"); la de Malena Ortiz (vence en ~8h) lo muestra en
   ámbar. Esperar unos minutos y refrescar — el número de horas/minutos
   baja (se recalcula en cada fetch, no hay timer en vivo dentro de la
   pantalla).
8. **Segmentos:** click en "Pendientes" (3), "Confirmados" (3),
   "Rechazados"/"Cancelados"/"Completados"/"Ausentes" (1 cada uno) — los
   contadores del segmento tienen que coincidir. "Todos" vuelve a las 10.
9. **Fecha en el pasado:** cambiar "Desde" a una fecha de hace una semana y
   dejar "Hasta" en hoy — deberían seguir apareciendo los turnos
   `rechazado`/`cancelado`/`completado`/`ausente` (todos entre 30h y 96h en
   el pasado). Poner "Hasta" antes que "Desde" ⇒ aviso inline, sin pegarle
   al server (`400 RANGO_INVALIDO` nunca debería salir por este camino).
10. **Aprobar/Rechazar inline:** en la fila pendiente de Malena Ortiz,
    click en "Aprobar" ⇒ la fila pasa a badge "Confirmado" sin recargar la
    página (refetch de la lista). En la fila pendiente de mañana (Lucía
    Fernández), click "Rechazar" ⇒ pasa a "Rechazado". Ambos botones se
    deshabilitan mientras la request está en vuelo (click rápido doble no
    dispara dos requests).
11. **Drawer + historial:** click en cualquier fila (no en el teléfono) ⇒
    abre el drawer con badge/código/cliente/servicio/duración/precio/
    profesional/fecha/horario/origen + timeline. El turno de Abril Medina
    (confirmado, `fueraDeHorario:true`, origen admin) muestra el aviso
    "Cargado fuera de la grilla habitual" y el flag en la fila.
12. **Cancelar con motivo:** abrir el drawer de un turno `confirmado`
    (Julieta Sosa), click "Cancelar" ⇒ aparece el textarea de motivo,
    escribir algo, confirmar ⇒ el turno pasa a `cancelado` y el motivo
    aparece en la línea del historial nueva ("Cancelado — <motivo>").
13. **Rechazar sin motivo (gap de backend):** abrir el drawer de un
    pendiente, click "Rechazar" ⇒ sólo pide confirmar (sin textarea) ⇒
    confirmar ⇒ pasa a rechazado. Esto es a propósito, ver ⚠ arriba.
14. **409 en vivo:** abrir el drawer de un turno pendiente en una pestaña,
    y en OTRA pestaña (misma sesión o la de `rocio.seed@...`) aprobar ese
    mismo turno desde el listado. Volver a la primera pestaña y clickear
    "Aprobar" en el drawer (todavía muestra "pendiente" porque no se
    refrescó solo) ⇒ toast "Este turno ya cambió de estado — actualizando"
    y el drawer se actualiza solo mostrando "Confirmado" con el historial
    real (no queda pegado en un estado mentiroso).
15. **Ownership de profesional:** cerrar sesión, loguearse como
    `rocio.seed@camigonzalez.local`. Nav reducido (sin Servicios/
    Profesionales/Configuración/Excepciones). `/turnos` muestra sólo los
    turnos de Rocío (sin columna "Profesional", sin filtro de
    profesional) — comparar contra lo que veía el admin, tiene que ser un
    subconjunto. No hay forma de forzar `profesionalId` de otra por query
    param manual porque el front ni siquiera pinta el filtro para
    profesional (y aunque se pegara directo a la API, el server lo ignora,
    §15.6).
16. **Responsive:** angostar la ventana (~700px) — columnas de servicio y
    profesional se ocultan, el drawer pasa a ancho completo.

### 2026-08-17 — Cotejo visual contra los 4 mockups (panel, tarea 4)

Sin features nuevas — sólo presentación, alineando lo ya construido (tareas
1-3) contra `client/mockups/*.html` y los tokens de §3. No se tocó lógica,
contratos ni fetching. Servicios/Profesionales/Configuración/Excepciones
siguen en `PantallaPendiente` (sin construir) — el cotejo de sus mockups fue
sólo para las primitivas compartidas (Button/Input/Switch/Drawer), no hay
pantalla propia todavía que cotejar ahí.

**Primitivas (`client/src/components/ui/`):**
- `Button.css` — `font-weight` global 500→600 (los 3 mockups usan 600 en
  todos los `.btn`, no sólo el submit del login). Tamaños `md`/`sm` ajustados
  a los valores reales de mockup (9px/15px y 7px/12px de padding, 13px/12.5px
  de fuente — antes eran valores más grandes, sin clonar de ningún mockup).
  `--btn--danger` pasó de la variante atenuada (fondo `error-fondo`, texto
  `error-texto`) a la SÓLIDA (fondo/borde `error-texto`, texto blanco): es la
  que usa `AccionesTurno` para confirmar rechazar/cancelar, y el mockup la
  pinta sólida (`style="background:#8f322c"` inline en `turnos-camila.html`,
  función `askMotivo`). La variante atenuada del mockup (`.btn.danger` en
  servicios/profesionales, para "Desactivar") no tiene consumidor todavía —
  esas pantallas no están construidas — así que no se agregó como variante
  nueva sin uso; si hace falta cuando se construya §4.5/§4.6, es una variante
  adicional, no un pisado de ésta.
- `Input.css` — foco y error pasan de `outline` a borde+`box-shadow` (clonado
  de los 3 mockups: `border-color` + `box-shadow:0 0 0 3px rgba(...)`), con
  la rgba derivada numéricamente de `--color-tinta`/`--color-error-texto` (no
  es un valor suelto, es el mismo token en rgba con alfa). El estado de error
  ya NO cambia el fondo del control (antes lo pintaba con `--color-error-fondo`;
  ningún mockup lo hace — sólo el borde+sombra). Alto fijo 44px (clonado de
  `login-camila.html`, el input más representativo).
- `Drawer.css` — el mockup anima entrada de drawer+scrim (`transform`+
  `opacity` con transition); acá no había ninguna animación (aparecía de
  golpe). Se agregó vía `@keyframes` sólo de ENTRADA (el componente desmonta
  el nodo al cerrar, `Drawer.tsx` no mantiene estado de salida — animar el
  cierre exigiría tocar la lógica de montaje, fuera de alcance de una tarea
  de presentación). Respeta `prefers-reduced-motion`. Botón de cerrar
  rehecho como el `.dclose` del mockup (caja 32×32, fondo `--color-papel`,
  radio 8px) en vez de una `×` suelta sin caja. Ancho `min(460px,92vw)`
  (los mockups varían 436-492px según pantalla; 460 es un punto medio único
  para un componente compartido).
- `Badge.tsx`/`.css`, `Switch.tsx`/`.css` — cotejados, ya estaban alineados a
  los tokens de §3 (dot+pill, medidas del switch calzan con el mockup
  pixel a pixel). Sin cambios.
- `Toast.tsx`/`.css` — cotejado contra el toast de servicios/profesionales
  (fondo tinta, texto papel, radio 10px, check icon). Se deja la posición
  actual (stack en `bottom-right`, 3 variantes exito/error/info) en vez de
  clonar el `bottom-center` de un solo toast del mockup: el panel ya dispara
  toasts concurrentes (ej. éxito de una transición + el aviso de
  `ESTADO_INVALIDO`, `TurnosPage.tsx`) y el mockup nunca ejercita ese caso
  (un solo toast a la vez, sin variantes de color). Decisión de
  implementación, no ⚠ — no hay conflicto con §3, sólo una escena que el
  mockup no cubre.

**`LoginPage` vs `login-camila.html`:**
- Faltaba el tagline de marca "Salón de belleza" (tracked, `letter-spacing:
  .34em`) — el lockup sólo tenía monograma+wordmark. Se agregó, y se separó
  el lockup de la card (en el mockup el lockup vive FUERA de la card, con su
  propio margen; acá todo estaba adentro de `.login-page__card`).
- El pie "¿Olvidaste tu contraseña? Pedísela a Camila." estaba DENTRO del
  form/card, como texto plano (ni siquiera con el segmento "Pedísela a
  Camila" distinguido). Se movió afuera de la card (`.login-page__foot`,
  como el `.foot` del mockup) y se le dio tratamiento visual de enlace al
  segmento variable (subrayado, `--color-tinta-72`) SIN volverlo un `<a
  href>` real — sigue sin self-service de reset (§4.3/§15.9 backend), un link
  de verdad que no lleva a ningún lado sería peor que el texto plano que
  había.
- Toggle de contraseña: pasó de texto "Mostrar"/"Ocultar" a ícono de ojo (SVG
  inline, clonado del `<svg id="eye">` del mockup) — pedido explícito del
  encargo. El mismo glifo para ambos estados (el mockup tampoco cambia de
  ícono al togglear); la distinción accesible vive en `aria-label`
  ("Mostrar contraseña"/"Ocultar contraseña"), que sí cambia — un lector de
  pantalla sigue teniendo la info que tenía con el botón de texto, sólo que
  ahora no está duplicada visualmente.
- Banner de error: se agregó el ícono de alerta (SVG inline, clonado) al lado
  del mensaje — antes era sólo texto centrado.
- Tipografía/spacing del lockup y la card ajustados a los valores exactos del
  mockup (wordmark 25px vs 17.6px que tenía antes, eyebrow con
  `letter-spacing:.16em` y `font-weight:600` vs `.1em`/400 que tenía, padding
  de card 30/28/26px vs 40/32px parejo).

**`Sidebar`/`PanelLayout` vs el shell de los 3 mockups de panel:**
- Los 6 items de nav no tenían ícono — sólo texto. Se agregó un ícono SVG por
  item (clonados 1:1 de los `<svg class="ic">` de los mockups), nuevo archivo
  `layout/NavIcon.tsx` + campo `icon: NavIconName` en `NAV_ITEMS`
  (`layout/nav.ts`) — sigue siendo el único lugar que decide qué se muestra
  por rol, el ícono es sólo un dato más ahí.
- La marca de la sidebar tampoco tenía el tagline "Salón de belleza" bajo el
  wordmark (mismo gap que en LoginPage). Agregado.
- El bloque de usuario (`.who` del mockup) tiene un avatar circular con
  iniciales; acá sólo mostraba nombre+rol en texto, sin avatar. Se agregó
  (`iniciales()`, deriva de `usuario.nombre`, mismo patrón `ini()` del
  mockup) — puramente presentacional, no toca `AuthContext`.
- Ancho de sidebar 240px→212px (valor real del mockup) y padding del bloque
  de marca ajustado (sin el borde inferior que tenía antes: el mockup separa
  marca de nav sólo con padding, sin línea).
- Breakpoint responsive (≤760px, clonado de los mockups): sidebar pasa a
  barra horizontal arriba, nav sin labels (sólo íconos), bloque de usuario
  sin texto. Antes no había ningún breakpoint en Sidebar/PanelLayout (sólo
  `TurnosPage.css` tenía uno, para la grilla de filas y el drawer).

**`TurnosPage` vs `turnos-camila.html`:** cotejado a fondo — ya estaba bien
clonado desde la tarea 3 (grid de fila, badges, chip de urgencia, timeline,
segmentado con contador calzan con el mockup dentro de 1-2px). No requirió
cambios propios; se beneficia en cascada de los ajustes de Button/Input/
Drawer de arriba (ej. los botones "Aprobar"/"Rechazar" inline ahora pesan
600 como en el mockup, el drawer de detalle ahora anima al abrir).

**⚠ REVISAR EN WEB: no existe logout en el panel — ni funcional ni con
botón.** El mockup (`.who .lo`, ícono de puerta+flecha) asume que hay un
logout clickeable desde la sidebar. Buscando en el código (`AuthContext.tsx`,
`http/`), no hay ningún método `cerrarSesion`/`logout` ni llamada a
`POST /api/auth/logout` en ningún lado del client — no se puede verificar
siquiera si ese endpoint existe del lado del server sin salir del alcance de
esta tarea. Agregar el ícono sin funcionalidad real sería un botón muerto
(peor que no tenerlo); agregar la funcionalidad completa (wiring de fetch +
estado de sesión) es lógica, explícitamente fuera de alcance de una tarea de
"sólo presentación". No lo agregué. Si el logout es un pendiente real (muy
probable — un panel sin forma de cerrar sesión es raro), es una tarea aparte
con alcance de lógica, no de este cotejo visual.

**Archivos nuevos:** `client/src/layout/NavIcon.tsx`.

**Archivos modificados:** `components/ui/Button/Button.css`,
`components/ui/Input/Input.css`, `components/ui/Drawer/Drawer.css`,
`routes/login/LoginPage.tsx`, `routes/login/LoginPage.css`,
`layout/Sidebar.tsx`, `layout/Sidebar.css`, `layout/PanelLayout.css`,
`layout/nav.ts`.

**Tests/typecheck:** `npm run typecheck` (shared+server+client) limpio.
`npm run build --workspace=client` OK (`tsc --noEmit` + `vite build`
limpios). `npx vitest run` — shared 10/10; server 127/127 en aislamiento
(`npx vitest run src/routes/auth.routes.test.ts` solo, 14/14) — en la corrida
de la suite COMPLETA los 2 tests de rate-limit de `auth.routes.test.ts`
dieron timeout de 5000ms por contención de recursos (varios
`MongoMemoryReplSet` en paralelo en esta máquina), no por nada tocado acá
(cero cambios de `server/` en esta tarea). Sigue **127 server + 10 shared**,
sin tests de client (mismo estado que las entradas anteriores — esta tarea
tampoco agrega lógica testeable, es CSS/JSX presentacional).

#### Guión de prueba manual

1. `npm run dev` desde la raíz, loguearse (ver guión de la tarea 3 para
   `seed:admin`/`seed:turnos` si hace falta data).
2. **Login (`/login`):** lockup arriba (monograma "cg" + "CAMILA GONZÁLEZ" +
   "SALÓN DE BELLEZA" tracked) separado de la card blanca; dentro de la
   card, eyebrow "Panel de gestión", campos, y el botón "Ingresar" en negro
   pleno. El campo contraseña muestra un ícono de ojo a la derecha (no
   texto) — clickearlo alterna el valor visible sin perder el contenido; con
   lector de pantalla (o inspeccionando el DOM) el `aria-label` del botón
   cambia entre "Mostrar contraseña"/"Ocultar contraseña". Abajo de la card,
   fuera de ella, "¿Olvidaste tu contraseña? Pedísela a Camila." con el
   segundo tramo subrayado (no es un link real, no navega a ningún lado).
   Forzar un error (contraseña incorrecta) ⇒ banner rojo con ícono de alerta
   al lado del texto.
3. **Sidebar (cualquier pantalla logueada):** cada item de nav tiene un
   ícono a la izquierda del label. Bajo "Camila González" en la marca,
   aparece "SALÓN DE BELLEZA" tracked chico. Abajo del todo, el bloque de
   usuario tiene un círculo oscuro con las iniciales (ej. "CG") a la
   izquierda del nombre+rol.
4. **Responsive de sidebar:** angostar la ventana a ~700px — la sidebar pasa
   a ser una barra horizontal arriba (nav sin texto, sólo íconos), el bloque
   de usuario colapsa al avatar solo.
5. **Turnos:** abrir el drawer de detalle de cualquier turno — ahora entra
   con una animación de deslizamiento (antes aparecía de golpe); el botón de
   cerrar es una caja gris redondeada, no una "×" suelta. Los botones
   "Aprobar"/"Rechazar" de las filas pendientes y "Rechazar turno"/"Cancelar
   turno" del drawer (danger, sólido rojo) se ven un toque más gruesos
   (peso 600) que antes.
6. Con `prefers-reduced-motion: reduce` activado en el SO/navegador, repetir
   el paso 5 — el drawer aparece sin animación (instantáneo), sin romper
   nada.

### 2026-08-17 — Logout del panel (§2, §4.0)

Cierra el `⚠ REVISAR EN WEB: no existe logout en el panel` de la entrada
anterior (tarea 4, cotejo visual). Alcance: wiring completo, servidor
incluido en el chequeo.

**Server:** `POST /api/auth/logout` YA EXISTABA en
`server/src/routes/auth.routes.ts` (`requireAuth` + `req.session.destroy` +
`res.clearCookie('sid')` + 204) con test propio en
`server/src/routes/auth.routes.test.ts` (`describe('POST /api/auth/logout')`
+ los 3 casos de CSRF que lo usan como request mutante de prueba) — la nota
de la tarea 4 decía "no se puede verificar siquiera si ese endpoint existe
del lado del server sin salir del alcance de esa tarea (presentación)"; acá
sí estaba en alcance y se confirmó que ya está, cerrado y testeado desde
antes. **No se tocó `server/`** — nada que registrar en §17 backend.

**Archivos modificados, `client/src/`:**
- `lib/auth/AuthContext.tsx` — nuevo `cerrarSesion()` en `AuthContextValue`:
  `POST /api/auth/logout` (vía `http.post`, ya trae `credentials`+CSRF del
  wrapper) → `finally` limpia `usuario` y `navigate('/login',
  {replace:true})`, tanto en éxito como en catch (red caída, 5xx, o sesión ya
  muerta del lado del server) — nunca deja el front pensando que sigue
  logueado. No dispara `establecerSesion`/`refrescar`: es un camino
  independiente del bootstrap de `/me`.
- `layout/Sidebar.tsx` — botón de logout en `.sidebar__usuario`, después del
  bloque de texto. `onClick` llama `cerrarSesion()` del contexto;
  `aria-label="Cerrar sesión"` + `title="Salir"` (el `title` clona el
  `title="Salir"` del mockup, útil además como tooltip en desktop).
  Ícono `IconoSalir` (SVG inline, mismo patrón que `IconoOjo`/`IconoAlerta`
  de `LoginPage.tsx` — no se sumó a `NavIcon.tsx` porque ese componente es
  específicamente para `NAV_ITEMS`, no para íconos sueltos del shell) con el
  path de puerta+flecha clonado 1:1 de `.who .lo` en
  `client/mockups/{turnos,servicios,profesionales}-camila.html`.
- `layout/Sidebar.css` — `.sidebar__logout` (botón sin chrome, `margin-left:
  auto` para pegarse al borde derecho del bloque de usuario, color
  `--color-tinta-48` en reposo → `--color-tinta` en hover — mismo patrón que
  `.who .lo`/`.who .lo:hover` del mockup). Sin regla nueva en el breakpoint
  responsive (`@media (max-width:760px)`): el botón queda visible con sólo
  el ícono en mobile por herencia de layout (sólo `.sidebar__usuario-texto`
  se oculta ahí), igual que el mockup mantiene `.lo` visible cuando esconde
  `.wn`/`.wr`.

**Tests/typecheck:** `npm run typecheck` (shared+server+client) limpio.
`npx vitest run` — shared 10/10, server 127/127 (sin cambios de conteo, no
se tocó `server/`; corridos ambos por separado, sin contención esta vez).
`npm run build --workspace=client` OK (`tsc --noEmit` + `vite build`
limpios). Sigue sin suite de tests de client.

#### Guión de prueba manual

1. `npm run dev` desde la raíz, loguearse como admin (ver guión de la tarea
   3 para `seed:admin` si hace falta un usuario).
2. **Logout funcional:** en cualquier pantalla del panel, en la sidebar
   (bloque de usuario, abajo del todo) aparece el ícono de puerta+flecha a
   la derecha del nombre/rol — clickearlo redirige a `/login` de inmediato.
3. **Cookie realmente destruida:** antes de clickear logout, Devtools →
   Application → Cookies: confirmar que existe `sid`. Después de clickear
   logout: la cookie `sid` ya no está en la lista (`res.clearCookie('sid')`
   del lado del server, sobre la sesión ya destruida en el store de Mongo).
4. **No hay sesión colgada tras el logout:** en `/login` (ya redirigido),
   entrar a mano por la barra de direcciones a `http://localhost:5173/turnos`
   ⇒ `RequireSesion` vuelve a mandar a `/login` (no hay cookie, `GET
   /api/auth/me` da 401 `NO_AUTENTICADO`) — no "un ratito logueado" ni
   flash del panel antes de redirigir.
5. **`aria-label`:** con lector de pantalla (o inspeccionando el DOM) el
   botón anuncia "Cerrar sesión"; pasar el mouse por encima muestra el
   tooltip nativo "Salir" (`title`).
6. **Responsive:** angostar a ~700px — el ícono de logout sigue visible y
   clickeable en la barra horizontal, sólo se esconde el nombre/rol de
   texto (igual que en desktop, mismo comportamiento que ya tenía el resto
   del bloque de usuario).
7. **Logout con red caída (opcional, difícil de forzar sin devtools):**
   Devtools → Network → Offline, clickear logout ⇒ igual redirige a
   `/login` y limpia el estado local (el `catch` de `cerrarSesion()` no dejó
   la sesión "colgada" en el front aunque el POST nunca haya llegado al
   server). Volver a poner la red online y refrescar en `/login` para seguir
   probando otras cosas.

### 2026-08-17 — CRUD de servicios (panel, admin, §4.5, tarea 5)

Pantalla real sobre el stub de `routes/servicios/ServiciosPage.tsx`. Alcance:
lista (todos, incl. inactivos, ordenada por `orden`), drawer de alta/edición,
Desactivar/Activar (sin DELETE), y el **editor de horarios compartido**
(`nullable` configurable) como pieza propia en `components/` para que
usuarios/configuración lo reusen después (§4.6/§4.5 "Componente reusable").
Consume `/api/admin/servicios` (§15.7), shape `ServicioPanel` — sin schema Zod
de respuesta del lado server (sólo los inputs lo tienen), así que se tipa a
mano en `types.ts`, mismo criterio que `routes/turnos/types.ts`.

**Archivos nuevos, `client/src/`:**
- `components/EditorHorarios/EditorHorarios.tsx` + `.css` — editor semanal
  reusable, parametrizado por `nullable`. `nullable:true` (servicios) agrega
  el segmentado "Hereda de la profesional | Horario propio"; `nullable:false`
  (para cuando usuarios/configuración lo reusen) salta directo al editor
  semanal. Estado interno por día (`on` + `bloques[]`) inicializado desde
  `value` una sola vez al montar — el componente sólo se monta mientras el
  drawer está abierto (ver más abajo, "por qué no hace falta resetear por
  props"). Togglear un día "on" siempre crea un bloque con default 09:00-13:00
  (clonado del mockup); quitar el último bloque apaga el día — por
  construcción nunca hay día con `bloques:[]` ni día duplicado (un row fijo
  por día, Lun→Dom). Lo que la construcción NO puede evitar (hasta<=desde,
  solape entre bloques del mismo día, "propio" con cero días encendidos) se
  valida de verdad en `validar()` (expuesto por `ref` vía
  `useImperativeHandle`), reusando `horariosSchema({nullable})` de `@shared`
  — el MISMO validador que corre en el server (§10 backend), no una copia a
  mano de las reglas. Único ajuste sobre el mensaje crudo del schema: el caso
  "array vacío" (propio sin ningún día) se reescribe a "Elegí al menos un
  día, o cambiá a 'Hereda de la profesional'." — el texto de §4.5 pide
  explícitamente que ese error "empuje a Hereda", y el mensaje de
  `horariosSchema` ("usar null para 'no aplica'") habla en términos del
  backend, no del segmentado que el usuario tiene enfrente. El resto de los
  mensajes (hasta<=desde, solape) se muestran tal cual los devuelve el
  schema, ya son específicos. El toggle de día reusa las clases globales
  `.switch`/`.switch__perilla` de `components/ui/Switch/Switch.css` en vez de
  duplicar el track (mismo lenguaje visual) — no reusa el componente
  `<Switch>` en sí porque su layout apila label+descripción en columna y acá
  hace falta swich+nombre+"cerrado" en una sola fila (clonado de
  `.dayhd` en el mockup), un layout distinto que el primitivo no cubre.
- `routes/servicios/types.ts` — `ServicioPanel`, espejo de
  `server/src/services/servicios.service.ts`.
- `routes/servicios/api.ts` — `listarServicios`/`crearServicio`/
  `editarServicio`. Sin `obtenerServicioPanel` (`GET /:id` existe en el
  server pero no tiene consumidor acá): la edición arranca del registro que
  ya está en memoria desde el listado, mismo criterio que el mockup
  (`S.find(id)`), no hace falta refetchear.
- `routes/servicios/components/FilaServicio.tsx` — fila de listado: nombre+
  desc, duración, limpieza, precio (+"oculto en la web" si `!mostrarPrecio`),
  tag Hereda/Propio, tag Activo/Inactivo. Sin acciones inline (a diferencia
  de turnos) — clonado del mockup, la fila entera abre el drawer, que es
  donde vive Desactivar/Activar. Los tags NO son `<Badge>` (ese componente
  está tipado a `EstadoTurno` de `@shared`, y "Activo"/"Hereda" no son
  `EstadoTurno` — no hay contrato de Zod que reusar ahí) pero sí reusan los
  tokens de color de estado de turno ya cotejados (`confirmado`/`cancelado`)
  en vez de hexs nuevos.
- `routes/servicios/components/ServicioDrawer.tsx` — el drawer completo
  (header/body/footer en un solo componente, con su propio `<Drawer>`
  adentro, en vez de que `ServiciosPage` arme `footer`+`children` por
  separado): nombre, descripción (textarea propio reusando las clases
  `.input-field__control` de `Input.css`, mismo patrón que el textarea de
  motivo en `AccionesTurno.tsx` — no se estiró el primitivo `<Input>`, que es
  literalmente un `<input>`, para que también renderizara un textarea),
  duración/limpieza en grilla 2 columnas con sufijo "min", precio con
  prefijo "$" (input en PESOS, se manda en centavos:
  `Math.round(Number(precioPesos)*100)`, sólo al hacer submit), switch
  mostrar precio, `<EditorHorarios nullable/>`, orden. Validación en
  `validar()`: chequeo optimista de nombre duplicado (case-insensitive,
  contra `serviciosExistentes` que pasa `ServiciosPage`, excluyendo el propio
  id al editar) + `crearServicioSchema`/`editarServicioSchema` de `@shared`
  (reuso pedido explícitamente, frontend.md §4.0) para el resto de los
  campos, con una tabla `MENSAJE_CAMPO` para traducir los mensajes default de
  zod a copy más claro donde hace falta + `editorRef.current.validar()` para
  horarios. Si el 409 `NOMBRE_DUPLICADO` real del server llega igual (otro
  admin creó el mismo nombre en el medio, o el chequeo local no lo agarró),
  `ServiciosPage` lo mapea por `codigo` y lo vuelve a mostrar bajo el campo
  nombre — el chequeo local es sólo UX rápida, nunca la única fuente de
  verdad (punto 4 del encargo).
- `routes/servicios/ServiciosPage.tsx` (reescrito) — orquesta todo: fetch de
  la lista, abrir/cerrar drawer (alta = `editando:null`, edición =
  `editando:ServicioPanel`), `guardar()` (crea o edita según haya
  `editando`, refetchea la lista al éxito, nunca parchea local — mismo
  criterio que `ejecutarAccion` de `TurnosPage`), y `toggleActivo()` (PATCH
  `{activo:!activo}` sobre el servicio en edición, dispara desde el footer
  del drawer). El drawer sólo se MONTA mientras `abierto`
  (`{abierto ? <ServicioDrawer .../> : null}`) en vez de quedar siempre
  montado como en `TurnosPage` — acá, a diferencia del drawer de detalle de
  turnos (que sólo lee), el drawer de servicios tiene estado de formulario
  propio que tiene que arrancar limpio en cada apertura; como el scrim
  bloquea la lista de atrás, nunca se puede abrir un segundo registro sin
  cerrar el drawer actual primero, así que desmontar/remontar alcanza para
  resetear sin necesitar un `key` ni sincronizar `value` por `useEffect`.
- `routes/servicios/ServiciosPage.css` — clonado de
  `client/mockups/servicios-camila.html` (grilla de fila de 6 columnas,
  header de lista, tags, grilla 2 columnas del form, responsive ≤820px que
  oculta duración/limpieza/precio igual que el mockup).

**Archivos modificados:**
- `components/ui/Button/Button.tsx` + `.css` — variante nueva
  `danger-outline` (atenuada: fondo blanco, borde/texto en tono de error,
  fondo atenuado sólo al hover) para "Desactivar". Distinta de `--btn--danger`
  (la sólida que ya usa `AccionesTurno` para confirmar rechazar/cancelar
  turno) — la tarea 4 (cotejo visual) ya había dejado anotado que esta
  variante atenuada del mockup no tenía consumidor todavía; acá sí lo tiene.
- `components/ui/Input/Input.tsx` + `.css` — agregado prop opcional
  `prefijo` (slot superpuesto a la izquierda, simétrico al `suffix` que ya
  existía desde la tarea de login), para el "$" del campo precio. Nombrado en
  español a propósito: `prefix: ReactNode` como nombre de prop choca con el
  `prefix?: string` real de `InputHTMLAttributes` (atributo RDFa que React
  tipa en cualquier elemento HTML) — TS2430, "Types of property 'prefix' are
  incompatible". `suffix` no tuvo ese problema porque no es un atributo HTML
  estándar.
- `components/ui/Drawer/Drawer.css` — regla `.drawer__footer .btn--danger-
  outline{flex:none}`, clonada de `.dact .btn.danger{flex:none}` del mockup:
  la acción destructiva secundaria no se estira parejo con Cancelar/Guardar.
  Vive en el primitivo (no en `ServiciosPage.css`) porque el `<Drawer>` se
  monta vía portal en `document.body` — un selector `.servicios-page
  .drawer__footer ...` no matchea (la jerarquía de DOM real no es
  descendiente de `.servicios-page`, aunque el árbol de React sí lo sea).

**Simplificaciones sobre el mockup, documentadas por si hace falta
revisarlas (no son ⚠, son criterio de implementación):**
- El mockup arma el drawer entero con un solo `drawerHTML()` que interpola
  strings; acá `ServicioDrawer` es un componente con estado propio, pero
  mantiene la misma idea de "un solo componente dueño de header+body+footer"
  en vez de partirlo en piezas que tendrían que compartir estado de formulario
  entre sí (a diferencia de `DetalleTurno`+`AccionesTurno`, que sí se separan
  porque el drawer de turnos es de sólo lectura + acciones sin estado
  compartido).
- El campo Orden usa un `<input type=number>` simple (sin drag-and-drop),
  tal como pide explícitamente el "PENDIENTE de implementación" de la sección
  del editor de horarios en §4: "Orden: input numérico en v1 (drag-and-drop →
  pulido posterior)".
- El mockup no valida duración/limpieza/precio más allá de lo que el
  `<input type=number min=...>` nativo ofrece (y ni siquiera eso, porque el
  submit no es un `<form>` nativo). Acá si se corre `crearServicioSchema`/
  `editarServicioSchema` sobre esos campos también (no sólo nombre), con
  mensajes propios en `MENSAJE_CAMPO` — más estricto que el mockup, pero
  consistente con "reusar Zod para validar formularios" (§4.0) y evita mandar
  un 400 evitable al server por un campo vacío.

**Tests/typecheck:** `npm run typecheck` (shared+server+client) limpio.
`npm run build --workspace=client` OK (`tsc --noEmit` + `vite build`
limpios). `npx vitest run` — shared 10/10. Server: la corrida de la suite
COMPLETA dio 4 timeouts de 5000ms (`turnos.panel.get.test.ts`,
`turnos.panel.test.ts`, `admin/excepciones.routes.test.ts`,
`admin/usuarios.routes.test.ts`) por la misma contención de recursos ya
documentada en la entrada de la tarea 4 (varios `MongoMemoryReplSet` en
paralelo en esta máquina) — **cero cambios de `server/` en esta tarea**, así
que no puede ser una regresión real; corridos esos 4 archivos aparte
(`npx vitest run <los 4 archivos>`), los 45 tests dan verdes. Sigue
**127 server + 10 shared**, sin tests de client (mismo estado que todas las
entradas anteriores — no hay test runner configurado en `client/package.json`
todavía).

#### Guión de prueba manual

No hace falta un seed nuevo: `npm run seed:turnos --workspace=server` ya
siembra 4 servicios reales (`Perfilado de cejas`, `Manicura semipermanente`,
`Limpieza facial profunda`, `Lifting de pestañas`, todos activos,
`horarios:null`) como efecto secundario de sembrar turnos — alcanza como
punto de partida; el resto de los casos (inactivo, horario propio,
mostrarPrecio:false) se cargan a mano desde la pantalla nueva, lo cual de
paso ejercita el flujo de alta.

1. `npm run dev` desde la raíz. Si no corrieron antes en esta base:
   `SEED_ADMIN_EMAIL=admin@test.local SEED_ADMIN_PASSWORD=Cambiar123! npm run
   seed:admin --workspace=server` y `npm run seed:turnos --workspace=server`.
   Loguearse como admin en `http://localhost:5173/servicios`.
2. **Lista:** 4 filas (las del seed), ordenadas por `orden` (el orden que les
   dio `seedTurnos.ts`, 0-3). Cada una muestra nombre, duración, "+N min" de
   limpieza, precio en ARS, tag "Hereda" (todas nacen con `horarios:null`) y
   tag "Activo". El subtítulo dice "4 servicios · 4 activos en la web".
3. **Alta con duplicado:** "+ Nuevo servicio" → completar nombre
   "Perfilado de cejas" (igual a uno existente, distinta capitalización:
   "PERFILADO DE CEJAS") + duración/precio cualquiera → "Guardar" ⇒ hint rojo
   bajo Nombre "Ya existe un servicio con ese nombre.", el drawer NO se
   cierra (chequeo local, ni siquiera pega al server). Cambiar a un nombre
   real nuevo (ej. "Depilación de cera") + duración 30 + limpieza 10 +
   precio 12000 + dejar "Mostrar el precio" prendido + orden 4 → Guardar ⇒
   toast "Servicio creado.", el drawer cierra, aparece 5ta fila.
4. **Duplicado real (409 del server, no sólo el local):** para forzar el
   409 real (no el chequeo optimista), hay que ganarle la carrera al chequeo
   local — más simple: crear un servicio, y ANTES de que la lista en memoria
   se refresque en una segunda pestaña, crear el mismo nombre desde ahí
   también. Alternativa más directa sin dos pestañas: crear "Prueba 409" dos
   veces seguidas rápido con doble click en Guardar no alcanza (el botón se
   deshabilita en vuelo) — el camino confiable es dos pestañas logueadas como
   admin, crear "Prueba 409" en la pestaña A, y en la pestaña B (que todavía
   tiene la lista vieja sin ese nombre) intentar crear "Prueba 409" también
   ⇒ el chequeo local no lo agarra (no está en su copia de `serviciosExistentes`)
   pero el submit igual vuelve con el hint bajo Nombre, esta vez con el
   `mensaje` real que manda el server (409 `NOMBRE_DUPLICADO`).
5. **Editar + precio oculto:** abrir "Manicura semipermanente" ⇒ el drawer
   trae los valores actuales (precio ya convertido a pesos, ej. 15000 si son
   1500000 centavos). Apagar "Mostrar el precio en la web" → Guardar ⇒ toast
   "Cambios guardados.", la fila ahora muestra el precio con "oculto en la
   web" chico debajo.
6. **Editor de horarios — Hereda (default):** en cualquier alta/edición, el
   segmentado arranca en "Hereda de la profesional" con el texto de ayuda
   "Se ofrece en los mismos horarios que cada profesional que lo presta." y
   sin el editor semanal visible.
7. **Editor de horarios — Propio + corte de mediodía:** click en "Horario
   propio" ⇒ aparece la semana Lun→Dom, todos apagados. Prender "Mié" ⇒
   aparece un bloque 09:00-13:00 por default + botón "Agregar bloque" ⇒
   click ⇒ aparece un segundo bloque 15:00-20:00 (el corte de mediodía).
   Guardar ⇒ reabrir el mismo servicio ⇒ el editor recuerda los dos bloques
   de Miércoles, resto de los días apagados.
8. **Validación de solape:** con "Mié" prendido y sus 2 bloques, editar el
   segundo bloque para que empiece 12:00 (superpone con el primero,
   09:00-13:00) → Guardar ⇒ NO cierra el drawer, aparece el cuadro de error
   rojo bajo el editor con el mensaje de solape que devuelve
   `horariosSchema` (menciona los dos bloques y el día). Corregir a 15:00 →
   Guardar ⇒ ahora sí guarda.
9. **Propio sin ningún día ⇒ empuja a Hereda:** "Horario propio" con TODOS
   los días apagados (o apagar el único que se había prendido, quitando su
   último bloque) → Guardar ⇒ error "Elegí al menos un día, o cambiá a
   'Hereda de la profesional'." — no el mensaje crudo del schema.
10. **Desactivar/Activar:** abrir cualquier servicio activo ⇒ el footer
    muestra "Desactivar" (atenuado, borde/texto rojo, NO sólido) a la
    izquierda, separado de Cancelar/Guardar. Click ⇒ toast "Servicio
    desactivado · deja de ofrecerse en la web.", el drawer cierra, la fila
    queda atenuada (opacity) con tag "Inactivo". Reabrirlo ⇒ el botón ahora
    dice "Activar"; click ⇒ vuelve a "Activo", ya no atenuada. Confirmar que
    en NINGÚN momento aparece un botón "Eliminar" ni se pierde el registro de
    la lista.
11. **Responsive:** angostar la ventana (~700px) — las columnas Duración/
    Limpieza/Precio se ocultan tanto en el header como en las filas, quedan
    Servicio/Horario/Estado; la grilla 2 columnas del form (Duración/
    Limpieza) pasa a 1 columna.

### 2026-08-17 — CRUD de usuarios/profesionales (panel, admin, §4.6, tarea 6)

Pantalla real sobre el stub de `routes/profesionales/ProfesionalesPage.tsx`.
Alcance: lista (todos, incl. inactivos), drawer de alta/edición con rol/
atiende/servicios/horario, contraseña por canal separado (alta con inicial,
edición con reset dedicado), y Desactivar/Activar con el aviso de turnos
futuros de §15.9. Consume `/api/admin/usuarios`, shape `UsuarioPanel` —
tipado a mano en `types.ts` (sin schema Zod de respuesta del lado server,
mismo criterio que turnos/servicios). Reusa `EditorHorarios` (nullable:false,
sin segmentado Hereda) y `listarServicios` de `routes/servicios/api.ts` tal
como pedía el encargo — nada de esto se reimplementó.

**Archivos nuevos, `client/src/`:**
- `lib/format/telefono.ts` — `normalizarTelefonoAR`, réplica de
  `server/src/services/telefono.ts` (mismo criterio: 9 después de +54,
  convención doméstica '15') pero devolviendo `null` en vez de tirar
  `ApiError` (ese tipo vive en `server/utils`, fuera del bundle de client).
  Duplicada a propósito y no movida a `shared/`: es la primera vez que el
  front necesita normalizar un teléfono para ENVIAR (turnos sólo lo
  mostraba, ya normalizado, para el link `tel:`) — si aparece un tercer
  consumidor vale la pena moverla, no antes.
- `routes/profesionales/types.ts` — `UsuarioPanel` (espejo de
  `usuarios.service.ts`), `UsuarioPanelConTurnosFuturos` (el campo extra que
  el PATCH de desactivar suma sólo en esa transición), y `RolUsuario`
  derivado de `CrearUsuarioInput['rol']` de `@shared` en vez de redeclarar el
  enum admin/profesional a mano (`usuario.schema.ts` no exporta un
  `rolSchema` propio).
- `routes/profesionales/api.ts` — `listarUsuarios`/`crearUsuario`/
  `editarUsuario`/`resetearPassword`.
- `routes/profesionales/components/FilaUsuario.tsx` — fila de listado:
  avatar con iniciales (mismo criterio que el avatar de `Sidebar.tsx`,
  duplicado a propósito — 6 líneas, otro propósito, no ameritaba un util
  compartido todavía), nombre+email, tags rol/atiende/estado. Los tags NO
  son `<Badge>` (mismo motivo que servicios: no hay `EstadoTurno` de por
  medio) pero sí reusan tokens de color ya cotejados
  (confirmado/cancelado/ausente) — **excepto el tag "Admin"**: el mockup lo
  pinta con un índigo (`#26215c`/`#eeedfe`) que no está en ningún lado de
  §3 (CERRADO salvo la fuente). En vez de introducir un color nuevo fuera
  del token set cerrado, "Admin" usa la tinta de marca sólida
  (`--color-tinta`/`--color-papel`, el mismo tratamiento que ya tiene un
  segmentado "activo" o el ítem de nav actual) — mantiene la distinción
  visual sin salirse de la paleta cerrada. Ver ⚠ abajo.
- `routes/profesionales/components/UsuarioDrawer.tsx` — el drawer completo
  (mismo patrón que `ServicioDrawer`: un componente dueño de su propio
  `<Drawer>`, header+body+footer juntos porque comparten estado de
  formulario). Campos: nombre+teléfono (grilla 2 columnas), email (con help
  "cambia con qué se loguea" SÓLO en edición), rol (segmentado Admin/
  Profesional, sin reusar el `.seg2` de `EditorHorarios` porque ese CSS es
  privado del componente — se clonó localmente en
  `ProfesionalesPage.css`), atiende (`<Switch/>` + help), servicios (chips
  toggleables poblados con la prop `servicios: ServicioPanel[]` que le pasa
  `ProfesionalesPage`, ya resuelta vía `listarServicios()` — inactivos se
  muestran igual, con "(inactivo)" al lado, porque un usuario puede tener
  asignado un servicio que después se desactivó y hay que poder
  destildarlo), `<EditorHorarios nullable={false}/>`, y contraseña (bifurca
  por `usuario` null/presente):
  - Alta: campo "Contraseña inicial" normal, viaja en el mismo payload que
    el resto — validado por `crearUsuarioSchema` completo en `validar()`.
  - Edición: sin campo password (`editarUsuarioSchema` es `.strict()` y no
    lo declara — ni siquiera puede colarse por accidente). En su lugar, un
    botón "Resetear contraseña" que revela un box con el campo nueva +
    callout de aviso ("se cierran las sesiones abiertas") + botón de
    confirmar, que llama a un canal aparte (`onResetPassword`, →
    `POST .../reset-password`) y cierra el drawer al terminar (mismo
    comportamiento que el mockup).
  - `validar()` arma el payload con un `base` común + `password` sumado
    SÓLO por spread condicional (`usuario ? base : {...base, password}`) —
    nunca `password: undefined` como key: `editarUsuarioSchema.strict()`
    trata una key DESCONOCIDA con valor `undefined` como no-reconocida igual
    que si tuviera un valor real (confirmado corriendo
    `z.object({a:z.string().optional()}).strict().safeParse({a:undefined,
    b:undefined})` — sólo `b` sale marcada `unrecognized_keys`, `a` no,
    porque `a` SÍ está en el shape). `telefonoE164` en cambio sí puede viajar
    `undefined` sin problema porque ES una key declarada en ambos schemas.
  - Teléfono: opcional; si viene, se corre por `normalizarTelefonoAR` ANTES
    de armar el payload (frontend.md §2) — si falla, error inline, no pega a
    la red. Servicios/horarios se excluyen del loop genérico de
    `fieldErrors` de zod (mismo patrón que `ServicioDrawer`): servicios no
    tiene mensaje propio porque nunca falla en la práctica (siempre son ids
    reales tomados de los chips), horarios lo valida `EditorHorarios` con su
    propio `ref.validar()`.
  - Desactivar/Activar y el aviso de turnos futuros: ver el punto grande más
    abajo, es la pieza no trivial de esta tarea.
- `routes/profesionales/ProfesionalesPage.tsx` (reescrito) — orquesta todo:
  fetch de la lista + fetch del catálogo de servicios (para el multiselect,
  en un `useEffect` aparte — si falla, el multiselect simplemente queda
  vacío, no rompe la pantalla), `guardar()` (crea o edita, refetchea al
  éxito, mapea 409 `EMAIL_DUPLICADO` al campo email igual que servicios
  mapea `NOMBRE_DUPLICADO`), `toggleActivo()` (ver abajo) y `resetPassword()`
  (PATCH dedicado + toast). El drawer sólo se MONTA mientras `abierto`, igual
  que servicios.
- `routes/profesionales/ProfesionalesPage.css` — clonado de
  `client/mockups/profesionales-camila.html` (grilla de fila de 5 columnas,
  avatar, tags, segmentado de rol, chips, callouts, responsive ≤820px que
  oculta Toma-turnos/Servicios).

**Archivos modificados:**
- `client/package.json` — sumado `libphonenumber-js@^1.11.9` (misma versión
  que `server/package.json`) como dependencia directa — ya estaba hoisteado
  en la raíz por ser dependencia de `server/`, pero declararlo en `client/`
  evita una dependencia fantasma (el bundle de client lo importa directo).

**La pieza no trivial — Desactivar con turnos futuros (§15.9), y por qué NO
es un gate de confirmación previo como en el mockup:**

El mockup (`tryDeactivate()`) simula un "preview": mira `u.futuros` (un
campo de su fixture local) ANTES de decidir si muestra el callout de aviso o
desactiva directo. La API real no tiene ese preview — mirando
`usuarios.service.ts` (`editarUsuarioPanel`), `turnosFuturosActivos` se
calcula y se agrega a la respuesta DESPUÉS de que el `$set{activo:false}` ya
se aplicó; no hay un endpoint de "¿cuántos turnos futuros tiene, sin tocar
nada todavía?". O sea: para cuando el front SABE el conteo, la desactivación
ya ocurrió — no se puede pedir confirmación "antes" de algo que el server ya
hizo. Esto no contradice el encargo: la propia redacción dice "mostrar el
conteo e INFORMAR, no bloquear" (no dice "confirmar antes de aplicar"), así
que la implementación es: click en "Desactivar" → PATCH inmediato
(`toggleActivo()` en `ProfesionalesPage`) → si
`turnosFuturosActivos > 0`, el drawer NO se cierra solo y muestra el callout
de aviso con dos botones que imitan los del mockup en su EFECTO, no en su
mecánica:
- "Desactivar igual" → sólo cierra el drawer (ya está desactivado, no hay
  nada más que hacer).
- "Volver" → vuelve a llamar a `toggleActivo()` — como el `usuario` que le
  llega por prop ya refleja `activo:false` (el padre hizo `setEditando
  (actualizado)` en el primer llamado), este segundo llamado hace
  `!editando.activo` = `true` y REACTIVA (un segundo PATCH, no un "deshacer
  in-memory" — la primera desactivación fue real y quedó en la base hasta
  que este segundo PATCH la revierte).

Sin toast genérico en el camino con turnos futuros (el callout YA es el
aviso); si `turnosFuturosActivos` es 0/undefined, sí hay toast normal
("Profesional desactivada."/"activada.") y el drawer cierra solo, igual que
servicios.

⚠ REVISAR EN WEB: no es una contradicción de la spec (que ya dice "informar,
no bloquear"), pero si Santiago esperaba el comportamiento LITERAL del
mockup (confirmar ANTES de que el registro cambie en la base), hace falta un
endpoint de preview del lado del server (`GET` que cuente turnos futuros sin
tocar `activo`) — hoy no existe, y agregarlo es cambio de backend, fuera de
esta tarea. Tal como está, el resultado visible para Camila es equivalente
(ve el mismo aviso con las mismas dos opciones) pero el momento en que la
desactivación queda persistida es antes del click en "Desactivar igual", no
después.

**Simplificaciones sobre el mockup, documentadas por si hace falta
revisarlas (no son ⚠, son criterio de implementación):**
- El multi-select de servicios muestra TODOS los servicios (activos e
  inactivos) con "(inactivo)" al lado de los que no están activos — el
  mockup no tiene servicios inactivos en su fixture. Necesario porque una
  profesional puede tener asignado un servicio que se desactivó después
  (§15.9: "los ObjectId no se validan contra existencia", y tampoco se
  filtran del catálogo que arma los chips) — sin esto, no habría forma de
  destildarlo desde acá.
- El campo teléfono, al editar, precarga el `telefonoE164` crudo tal cual
  vino del server (ej. `+5493415552847`) en vez de reconstruir un formato
  local "lindo" (`341 555-2847`, como hacía el mockup con un campo `telD`
  separado que no existe en el modelo real) — no hay forma de reconstruir
  sin ambigüedad un formato local a partir de un E.164 ya normalizado (la
  convención '15' se pierde en el camino), así que se muestra la fuente de
  verdad tal cual. Al reenviar sin tocarlo, `normalizarTelefonoAR` es
  idempotente sobre su propia salida (confirmado por
  `server/src/services/telefono.test.ts`), así que no se rompe nada.
- El borde del callout de aviso (`--warn-l` en el mockup, `#e4d3a0`) se tomó
  tal cual del mockup en vez de derivarlo de un token: §3 sólo define pares
  texto/fondo por estado, no un tercer tono de borde — mismo criterio que ya
  usa `--color-error-linea` para el error de formulario, pero ése SÍ está en
  §3 y el de warning no. Valor único, bajo riesgo (no es un hue nuevo, es
  el tono de borde a juego con `--color-estado-pendiente-*`, que sí es del
  token set).

**Tests/typecheck:** `npm run typecheck` (shared+server+client) limpio.
`npm run build --workspace=client` OK (`tsc --noEmit` + `vite build`
limpios). `npx vitest run` — shared 10/10. Server: la corrida de la suite
COMPLETA volvió a dar 4 timeouts de 5000ms (archivos distintos cada vez que
corre — esta vez `turnos.panel.get.test.ts`, `turnos.panel.test.ts`,
`admin/excepciones.routes.test.ts`, `admin/usuarios.routes.test.ts` cada uno
con UN test específico distinto al de la tarea anterior), mismo patrón de
contención de `MongoMemoryReplSet` en paralelo ya documentado en las dos
entradas previas — **cero cambios de `server/` en esta tarea**. Esos mismos
4 archivos corridos aparte dan 45/45 verdes. Sigue **127 server + 10
shared**, sin tests de client (mismo estado que todas las entradas
anteriores).

#### Guión de prueba manual

No hace falta `seed:turnos` para esta pantalla — alcanza con `seed:admin`
(un admin para loguearse) y crear profesionales desde el panel mismo, lo
cual de paso ejercita el alta.

1. `npm run dev` desde la raíz. Si no corrió antes en esta base:
   `SEED_ADMIN_EMAIL=admin@test.local SEED_ADMIN_PASSWORD=Cambiar123! npm run
   seed:admin --workspace=server`. Loguearse como admin en
   `http://localhost:5173/profesionales`. Si se quiere el multiselect de
   servicios poblado con algo, correr también
   `npm run seed:turnos --workspace=server` (siembra 4 servicios) o cargar
   uno o dos servicios de prueba primero desde `/servicios`.
2. **Lista:** 1 fila (el admin del seed), avatar con iniciales, tag "Admin"
   (tinta sólida), tag "Sí" en Toma turnos (el seed lo crea con
   `atiende:true`), "0 servicios", tag "Activa".
3. **Alta con contraseña inicial:** "+ Nueva profesional" → nombre "Rocío
   Benítez", teléfono "341 555-2847" (formato local con código de área, sin
   +54), email "rocio@test.local", dejar rol en "Profesional" (default),
   dejar "Toma turnos" prendido, tildar 1-2 chips de servicio, en el editor
   de horarios (SIN segmentado "Hereda" — arranca directo en la semana)
   prender "Lun" y "Mié" con sus bloques default, contraseña inicial
   "Cambiar123!" → Guardar ⇒ toast "Profesional creada.", aparece 2da fila.
   Reabrirla ⇒ confirmar que el teléfono quedó guardado como
   `+5493415552847` (E.164, visible en el campo tal cual).
4. **Teléfono inválido:** en un alta nueva, poner teléfono "15 1234567" (sin
   código de área) → Guardar ⇒ hint rojo bajo Teléfono "Teléfono inválido.
   Probá con código de área, ej: 341 555-2847." — no llega a pegarle al
   server (mismo criterio que nombre/email vacíos).
5. **Edición sin campo password:** abrir "Rocío Benítez" ⇒ confirmar que NO
   hay ningún campo de contraseña visible en el form principal — en su lugar
   un botón "Resetear contraseña". Cambiar el nombre a "Rocío A. Benítez" →
   Guardar ⇒ toast "Cambios guardados.".
6. **Reset con aviso de sesiones:** reabrir "Rocío A. Benítez" → "Resetear
   contraseña" ⇒ aparece el campo "Nueva contraseña" + el callout "Al
   resetear, se cierran las sesiones abiertas de la profesional." Probar con
   menos de 8 caracteres → hint "Mínimo 8 caracteres.". Poner
   "NuevaClave123!" → "Guardar contraseña nueva" ⇒ toast "Contraseña
   actualizada · comunicásela a la profesional.", el drawer se cierra. Para
   confirmar la invalidación de sesión de verdad: loguearse como
   "rocio@test.local" con la password VIEJA en otra pestaña antes del reset,
   y después del reset refrescar esa pestaña ⇒ vuelve a `/login` (401
   `NO_AUTENTICADO`, la cookie vieja ya no sirve — cubierto también por el
   test de server `reset-password > invalida las sesiones vivas`).
7. **Email duplicado:** alta nueva con email "rocio@test.local" (ya
   existente) → Guardar ⇒ hint bajo Email "Ya hay una cuenta con ese email."
   sin pegarle al server (chequeo local). Para forzar el 409 REAL (no sólo
   el local), repetir el mismo truco de dos pestañas que se usó en servicios
   §5 (tarea 5): crear el email en la pestaña A, y en la pestaña B —que
   todavía tiene la lista vieja sin ese email en memoria— intentar crearlo
   también ⇒ el chequeo local no lo agarra pero el submit vuelve con el
   mensaje real del server.
8. **Multi-select de servicios:** en cualquier alta/edición, click en varios
   chips de servicio ⇒ togglean visualmente (fondo tinta cuando están
   prendidos). Guardar y reabrir ⇒ los mismos chips siguen marcados. Si hay
   algún servicio inactivo en la base (desactivar uno desde `/servicios`
   primero), confirmar que aparece igual en la lista de chips con
   "(inactivo)" al lado, y que se lo puede destildar si una profesional lo
   tenía asignado.
9. **Editor de horarios sin Hereda:** confirmar que el editor de horarios de
   esta pantalla arranca DIRECTO en la semana Lun→Dom, sin el segmentado
   "Hereda de la profesional | Horario propio" que sí tiene servicios (es el
   mismo componente `EditorHorarios` con `nullable={false}`). Dejar todos
   los días apagados → Guardar ⇒ error "Elegí al menos un día." (mensaje
   distinto al de servicios, que dice "...o cambiá a Hereda", porque acá no
   existe esa opción).
10. **Desactivar SIN turnos futuros:** con "Rocío A. Benítez" sin turnos
    cargados (no corriste `seed:turnos`, o esta profesional en particular no
    tiene ninguno), abrir su drawer → "Desactivar" ⇒ toast "Profesional
    desactivada.", el drawer cierra solo, la fila queda atenuada con tag
    "Inactiva". Reabrir ⇒ botón dice "Activar" → click ⇒ vuelve a "Activa".
11. **Desactivar CON turnos futuros (el caso interesante):** requiere que la
    profesional tenga turnos `pendiente`/`confirmado` con `inicio` en el
    futuro — la vía más simple es correr `npm run seed:turnos
    --workspace=server` ANTES de esta prueba (crea la profesional
    `rocio.seed@camigonzalez.local` con varios turnos futuros reales) y
    editar a "Rocío Benítez" (la del seed, no la creada a mano en el paso
    3). Abrir su drawer → "Desactivar" ⇒ el drawer NO se cierra: aparece un
    callout amarillo arriba del todo ("Rocío Benítez tiene N turnos futuros.
    Desactivarla no los cancela — reasignalos o cancelalos por WhatsApp.")
    con dos botones. Devtools → Network: confirmar que el PATCH
    `{activo:false}` YA salió y ya volvió 200 ANTES de que aparezca el
    callout (no es un "¿estás segura?" previo). Click "Volver" ⇒ un segundo
    PATCH (`{activo:true}`) reactiva, toast "Profesional activada.", drawer
    cierra. Repetir y esta vez click "Desactivar igual" ⇒ el drawer
    simplemente cierra (ya estaba desactivada de antes), la fila queda
    atenuada.
12. **Responsive:** angostar la ventana (~700px) — las columnas Toma-turnos/
    Servicios se ocultan tanto en el header como en las filas, queda
    Profesional/Rol/Estado; la grilla 2 columnas del form (Nombre/Teléfono)
    pasa a 1 columna.

### 2026-08-17 — Ajuste: copy y manejo de error del aviso de turnos futuros (§4.6, cierra la ⚠)

Cierra el `⚠ REVISAR EN WEB` de la entrada anterior. El PATCH inmediato se
queda tal cual (confirmado en §4.6: no hay preview del lado del server, así
que no hay otra forma de hacerlo) — el ajuste es sólo de copy y de manejo de
error en `UsuarioDrawer.tsx`, nada de `ProfesionalesPage.tsx` ni del server.

**Cambios en `routes/profesionales/components/UsuarioDrawer.tsx`:**
- **Copy del callout:** de "Rocío tiene N turnos futuros. Desactivarla no
  los cancela..." (redactado como si la desactivación fuera a pasar) a
  "Rocío quedó desactivada. Tiene N turnos futuros ya reservados — no se
  cancelaron. Reasignalos o cancelalos por WhatsApp." — tiempo pasado,
  porque el PATCH ya se aplicó antes de que este texto se muestre en
  pantalla (eso es justamente lo que decía la ⚠).
- **Botones:** "Desactivar igual" → **"Entendido"** (mismo efecto: sólo
  cierra el callout, no dispara ningún request — ya no hay nada que
  "desactivar igual", ya está desactivada) / "Volver" → **"Reactivar"**
  (mismo request de antes, un segundo PATCH `{activo:true}`, pero con
  manejo de error propio ahora — ver siguiente punto). El texto viejo
  ("Volver") sugería deshacer algo que no había pasado todavía; el nuevo
  nombra la acción real que dispara.
- **Manejo de error de la reactivación:** antes, `handleVolver()` limpiaba
  `avisoTurnosFuturos` ANTES de llamar a `onToggleActivo()` — si el segundo
  PATCH fallaba (red caída, 5xx), el callout desaparecía igual y no quedaba
  ninguna pista en pantalla de que la profesional seguía desactivada (sólo
  el toast de error, fácil de perder). El nuevo `handleReactivar()` NO
  limpia el aviso hasta confirmar que `onToggleActivo()` devolvió
  `ok:true` — si falla, el callout se queda en pantalla exactamente igual
  (con su copy "quedó desactivada..."), reforzando que no hay que asumir
  que revirtió; el toast de error ya lo dispara `toggleActivo()` del lado
  de `ProfesionalesPage` (sin cambios ahí, ese manejo de error ya existía
  desde la tarea anterior — sólo faltaba que el drawer no borrara la
  evidencia en pantalla antes de tiempo).

**Sin cambios:** `ProfesionalesPage.tsx` (el `toggleActivo()` que hace el
PATCH y el toast de error en el catch ya estaban bien desde la tarea
anterior), `usuarios.service.ts`/rutas del server (no hay endpoint de
preview nuevo — confirmado que no hacía falta uno para este ajuste), CSS
(`.callout`/`.callout__acciones` se reusan tal cual).

**Tests/typecheck:** `npm run typecheck` (shared+server+client) limpio.
`npm run build --workspace=client` OK (`tsc --noEmit` + `vite build`
limpios). Sin cambios de `server/`/`shared/`, no hacía falta re-correr esa
suite — sigue **127 server + 10 shared**.

#### Guión de prueba manual (sólo lo que cambió)

Reusa el punto 11 del guión de la entrada anterior (necesita
`seed:turnos --workspace=server` para tener una profesional con turnos
futuros reales) con dos verificaciones nuevas:
1. Desactivar a la profesional del seed con turnos futuros ⇒ el callout dice
   "... quedó desactivada. Tiene N turnos futuros ya reservados — no se
   cancelaron..." (tiempo pasado, no "Desactivarla no los cancela"). Botones
   "Entendido" y "Reactivar" (ya no "Desactivar igual"/"Volver").
2. **Error al reactivar:** Devtools → Network → Offline, click "Reactivar"
   ⇒ toast de error, y el callout de aviso SIGUE visible en el drawer (no
   desaparece) — confirma que no se asume que revirtió. Volver a poner la
   red online y click "Reactivar" de nuevo ⇒ ahora sí funciona, toast
   "Profesional activada.", el drawer cierra.

### 2026-08-21 — Configuración del centro (panel, admin, §4.7)

Pantalla real sobre el stub de `routes/configuracion/ConfiguracionPage.tsx`.
Alcance: singleton, NO CRUD — sin drawer, sin lista, sin alta/baja. Página de
ajustes en 3 secciones (Datos del centro, Horario del centro, Reglas de
reserva) con guardado global de sólo los campos "sucios" (PATCH parcial).
Consume `/api/admin/configuracion` (§15.8), shape `ConfiguracionPanel` —
tipado a mano en `types.ts` (sin schema Zod de respuesta del lado server,
mismo criterio que turnos/servicios/usuarios). Reusa `EditorHorarios`
(`nullable:false`, sin segmentado Hereda) y `normalizarTelefonoAR` de
`lib/format/telefono.ts` tal como pedía el encargo — nada de esto se
reimplementó.

**Archivos nuevos, `client/src/routes/configuracion/`:**
- `types.ts` — `ConfiguracionPanel`/`ContactoCentro`, espejo de
  `server/src/services/configuracion.service.ts`.
- `api.ts` — `obtenerConfiguracion`/`editarConfiguracion` (GET + PATCH,
  sin POST/DELETE — nace del seed, §15.8).
- `ConfiguracionPage.tsx` (reemplaza el stub `PantallaPendiente`) — toda la
  lógica de la pantalla:
  - **Dirty-tracking por sección**, no por campo individual, siguiendo la
    regla de §4.7 ("si viene, reemplaza entero"): `nombreSucio` (string
    trim vs. el valor cargado), `contactoSucio` (cualquiera de los 3
    subcampos difiere ⇒ manda el sub-objeto COMPLETO o no lo manda),
    `horariosTocado` (booleano seteado por `handleHorariosChange`, nunca en
    el montaje — ver más abajo por qué), y una `reglaSucia(campo)` por cada
    una de las 5 reglas numéricas (comparación de string contra
    `String(config[campo])`, no de número, para no arrastrar problemas de
    formato). El botón Guardar se deshabilita mientras ninguna de éstas da
    `true` (`haySucio`).
  - **`validar()`** arma el payload SÓLO con las claves sucias y corre
    `editarConfiguracionSchema.safeParse` sobre ESE payload recortado (nunca
    sobre el estado completo del form) — así un campo no tocado nunca entra
    en el PATCH ni se valida de más. `nombre` y las 5 reglas usan el error
    de zod mapeado por una tabla `MENSAJE_CAMPO` (mismo patrón que
    `ServicioDrawer`/`UsuarioDrawer`). `horarios` se valida aparte vía
    `editorRef.current.validar()` (reusa `horariosConfigSchema` por dentro
    de `EditorHorarios`, no una copia a mano).
  - **`contacto`**: primero normaliza `telefonoE164` con
    `normalizarTelefonoAR` (frontend.md §2) — si no trae área, el teléfono
    se rechaza ACÁ, antes de tocar el schema o la red (punto explícito del
    encargo). Para `email`/`direccion` no reinventé una validación manual:
    desenvolví el sub-schema real de `contacto` con
    `editarConfiguracionSchema.shape.contacto.unwrap()` (mismo `ZodObject`
    que usa el server, no una redefinición) y lo corrí standalone sobre
    `{telefonoE164, email, direccion}` — hace falta aparte del
    `safeParse` grande porque **probé a mano que `.flatten().fieldErrors`
    colapsa los 3 subcampos de un objeto anidado bajo el mismo key
    `'contacto'`** (sin distinguir cuál de los tres falló); parseando el
    sub-objeto solo, los errores salen con `path` relativo
    (`email`/`direccion`) y sí se pueden mapear al campo exacto. `timezone`
    NUNCA entra al payload — no hay campo editable para eso, sólo un
    `<Input disabled>` de sólo lectura con el texto exacto de §4.7 ("Buenos
    Aires (no editable)").
  - **`EditorHorarios` en una página que no se desmonta:** a diferencia de
    los drawers de servicios/usuarios (que se montan/desmontan y por eso
    `EditorHorarios` sólo lee `value` una vez al montar, ver su propio
    comentario de diseño), esta pantalla vive montada todo el tiempo. Para
    resincronizar el editor contra el server después de cargar, guardar, o
    descartar cambios, se fuerza un remount real con
    `key={horariosKey}` (incrementado en `aplicarConfig`, el helper común a
    carga inicial/post-guardado/descarte) — sin este `key`, un
    guardado o un "Descartar cambios" dejaría el editor mostrando el
    estado viejo aunque `value` haya cambiado por debajo. No es un cambio
    al componente compartido, es cómo lo consume esta pantalla en
    particular.
  - **Guardar**: PATCH → toast "Cambios guardados." → `aplicarConfig(actualizado)`
    con la respuesta fresca del server (nunca parchea el estado local a
    mano, mismo criterio que `ejecutarAccion`/`guardar` de
    turnos/servicios) — esto también resetea todas las banderas de "sucio"
    a `false` de una sola vez.
  - **"Descartar cambios"** (botón `ghost`, sólo visible mientras `haySucio`):
    no estaba pedido explícitamente en el encargo, lo agregué porque sin él
    la única forma de deshacer una edición a medio terminar era refrescar
    la página entera — reaplica `config` (el último snapshot cargado del
    server) sin pegarle a la red. Señalado acá por transparencia, no es una
    `⚠`.
- `ConfiguracionPage.css` — sin mockup que clonar (§4.7 lo dice
  explícito): 3 tarjetas de sección (mismo `--radio-card`/`--borde-hairline`
  que `.fila-servicio-grupo`), grilla 2 columnas para contacto y para las 5
  reglas (clon del patrón `.servicio-drawer__grid2`), y una barra de
  acciones `position:sticky;bottom:0` al pie de la página — no hay drawer
  con footer fijo acá, así que la barra se pega sola al fondo del viewport
  mientras se scrollea el formulario largo.

**Sin archivos modificados fuera de `routes/configuracion/`** — `Input`
(prop `suffix` para "min"/"hs"/"días") y `EditorHorarios` (`nullable:false`)
ya traían todo lo que hacía falta desde las tareas de servicios/usuarios;
no fue necesario tocar ninguna primitiva compartida.

**Tests/typecheck:** `npm run typecheck` (shared+server+client) limpio.
`npm run build --workspace=client` OK (`tsc --noEmit` + `vite build`
limpios). Sin cambios de `server/`/`shared/` (tarea 100% de `client/`) —
sigue **127 server + 10 shared**: `npx vitest run` en `shared/` da 10/10;
en `server/` la corrida de la suite COMPLETA dio 1 timeout de 5000ms en
`auth.routes.test.ts` (el mismo patrón de contención de recursos ya
documentado en las entradas de las tareas 4 y 5 — varios `MongoMemoryReplSet`
en paralelo en esta máquina), confirmado como flake corriendo ESE archivo
solo (`npx vitest run src/routes/auth.routes.test.ts`): 14/14 verdes. Sigue
sin suite de tests de client (mismo estado que todas las entradas
anteriores).

#### Guión de prueba manual

El seed de `seedAdmin.ts` ya crea el singleton `centro` con nombre real
("Camila González Belleza"), Lun-Vie 09:00-18:00, y los defaults numéricos
de §4 — alcanza como punto de partida, no hace falta un seed nuevo.

1. `npm run dev` desde la raíz. Si no corrió antes en esta base:
   `SEED_ADMIN_EMAIL=admin@test.local SEED_ADMIN_PASSWORD=Cambiar123! npm run
   seed:admin --workspace=server`. Loguearse como admin en
   `http://localhost:5173/configuracion`.
2. **Carga inicial:** las 3 secciones aparecen con los valores del seed:
   nombre "Camila González Belleza"; contacto con el teléfono/email/
   dirección placeholder; "Zona horaria" muestra "Buenos Aires (no
   editable)" en un campo gris, no clickeable; horario Lun-Vie 09:00-18:00
   prendidos, Sáb/Dom apagados; las 5 reglas con 30/3/60/24/12. El botón
   "Guardar" aparece deshabilitado y "Descartar cambios" NO se ve (nada
   sucio todavía).
3. **Editar sólo nombre ⇒ PATCH sólo nombre:** cambiar el campo Nombre a
   "Camila González Belleza — Sucursal Centro" sin tocar nada más. Aparece
   "Descartar cambios" y "Guardar" se habilita. Devtools → Network → click
   Guardar ⇒ inspeccionar el body del PATCH: `{"nombre":"..."}` únicamente,
   sin `contacto`/`horarios`/reglas. Toast "Cambios guardados.". Refrescar
   la página ⇒ el nombre nuevo persiste.
4. **Editar una regla numérica:** cambiar sólo "Ventana máxima" a 90 ⇒
   Guardar ⇒ Network confirma `{"ventanaMaximaDias":90}` solo. Refrescar ⇒
   persiste, el resto de las reglas siguen en sus valores previos.
5. **Editar el horario del centro:** en la sección "Horario del centro",
   prender "Sáb" (crea bloque 09:00-13:00 por default) ⇒ Guardar ⇒ Network
   confirma que el body trae `"horarios"` con el array COMPLETO (los 6 días
   encendidos, no un diff) y NADA más (ni nombre, ni contacto, ni reglas,
   si no se tocaron). Refrescar ⇒ Sábado sigue prendido.
6. **`pasoGrillaMin < 5` ⇒ error:** cambiar "Paso de grilla" a 2 ⇒ Guardar
   ⇒ NO pega a la red (chequeo local vía `editarConfiguracionSchema`), hint
   rojo "Mínimo 5 minutos." bajo el campo. Corregir a 15 ⇒ Guardar ⇒ ahora
   sí guarda.
7. **Verificar que NO se manda `timezone`:** el campo "Zona horaria" está
   deshabilitado (no se puede escribir ahí) — inspeccionar cualquier PATCH
   de los pasos anteriores en Network y confirmar que el body nunca incluye
   la key `"timezone"` bajo ninguna circunstancia.
8. **Teléfono de contacto sin área ⇒ rechazado antes de enviar:** en
   "Contacto", cambiar el teléfono a `1544445555` (sin código de área) ⇒
   Guardar ⇒ NO pega a la red, hint rojo "Teléfono inválido. Probá con
   código de área, ej: 341 555-2847." bajo el campo. Corregir a
   `341 555-0000` ⇒ Guardar ⇒ ahora sí guarda (Network: `contacto` viaja
   completo con el `telefonoE164` ya normalizado, ej. `+5493415550000`, no
   el crudo tipeado).
9. **Email/dirección inválidos dentro de contacto:** con el teléfono ya
   válido, borrar el `@` del email ⇒ Guardar ⇒ hint "Ingresá un email
   válido." bajo Email, sin tocar el hint de Teléfono ni el de Dirección
   (confirma que el error de zod sobre el sub-objeto se mapeó al campo que
   correspondía, no a los tres). Vaciar Dirección ⇒ agrega también "Ingresá
   una dirección." bajo ese campo.
10. **Descartar cambios:** editar nombre + una regla + el horario sin
    guardar ⇒ click "Descartar cambios" ⇒ los 3 vuelven a los valores
    cargados del server (sin pegarle a la red — confirmar en Network que no
    sale ningún request), "Guardar"/"Descartar" vuelven a su estado inicial
    (deshabilitado/oculto).
11. **Responsive:** angostar la ventana (~600px) — la grilla de contacto y
    la de las 5 reglas pasan a 1 columna; la barra de acciones del pie pasa
    a apilar la nota arriba de los botones.
12. **Rol no-admin:** loguearse como una profesional (`rocio.seed@
    camigonzalez.local` si corrió `seed:turnos`, o cualquier usuario con
    `rol:'profesional'`) ⇒ `/configuracion` no aparece en el nav y
    navegar ahí a mano redirige a `/turnos` (guard de rol, sin tocar la API
    siquiera).

⚠ REVISAR EN WEB: ninguna encontrada en esta tarea — §15.8 y §4.7 coincidían
en todo lo que hizo falta implementar (seed ya crea el singleton, schema ya
excluye `timezone` con `.strict()`, `contacto` ya es "reemplaza entero").

### 2026-08-24 — Excepciones (feriados/vacaciones/bloqueos) (panel, admin, §4.8)

Pantalla real sobre el stub `routes/excepciones/ExcepcionesPage.tsx`. Cierra el
CRUD del panel (turnos → servicios → usuarios → configuración → **excepciones**,
orden de §4.1). Alcance: lista filtrada por ventana + filtro de profesional,
drawer de alta/edición, y la única acción DELETE física del sistema (§15.10)
con confirmación irreversible. Sin mockup — reusa el shell y los patrones de
fila/drawer ya cotejados de servicios/profesionales, adaptados donde el
encargo pedía algo distinto (ver abajo).

**Archivos nuevos, `client/src/routes/excepciones/`:**
- `types.ts` — `ExcepcionPanel`, espejo de
  `server/src/services/excepciones.service.ts` (sin schema Zod de respuesta
  del lado server, mismo criterio que turnos/servicios/usuarios/
  configuración). `TipoExcepcion` derivado de `CrearExcepcionInput['tipo']`
  de `@shared`, no repetido a mano (mismo criterio que `RolUsuario` en
  `routes/profesionales/types.ts`).
- `api.ts` — `listarExcepciones`/`crearExcepcion`/`editarExcepcion`/
  `eliminarExcepcion` contra `/api/admin/excepciones` (§15.10). `eliminarExcepcion`
  devuelve `Promise<void>` — el 204 sin body ya lo mapea `lib/http/client.ts`.
- `format.ts` — `formatearRangoExcepcion(desdeIso, hastaIso)`: infiere si el
  rango es "todo el día" mirando la hora local de los dos extremos (00:00/
  23:59) para decidir cómo mostrarlo en la fila (con u sin horario, con u sin
  rango de días) — la inferencia es sólo de DISPLAY, no persiste ni viaja a
  ningún lado (el modelo no tiene campo `todoElDia`, §15.10/§4 "sin campo
  todoElDia: el panel arma 00:00–23:59 antes de mandarlo").
- `components/FilaExcepcion.tsx` — tag de tipo (3 tonos de §3, ver mapping
  abajo), rango (vía `format.ts`), alcance (nombre resuelto por el padre) y
  motivo. **Con botones "Editar"/"Eliminar" EXPLÍCITOS en la fila** — a
  diferencia de servicios/profesionales (fila entera abre el drawer,
  Desactivar vive adentro), acá el encargo pide las dos acciones visibles en
  la fila (§4.8: "Acciones: editar, eliminar (con confirm)"), consistente con
  que ésta es la única pantalla con un DELETE de verdad — no tiene sentido
  esconderlo un nivel más adentro que las demás acciones "seguras" del
  sistema. "Eliminar" dispara un paso de confirmación INLINE dentro de la
  celda de acciones (mismo lenguaje que el gate de `AccionesTurno.tsx`, sólo
  que sin drawer de por medio): "¿Eliminar? No se puede deshacer." + Cancelar
  / Sí, eliminar.
- `components/ExcepcionDrawer.tsx` — alta/edición: tipo (segmentado
  Feriado/Vacaciones/Bloqueo), alcance (UN SOLO `<select>` con "Todo el
  centro" + la lista de profesionales — el encargo lo describe como una sola
  pieza "(select)", así que no se armó un segmentado aparte + select
  condicional), toggle "Todo el día" (default ON), y motivo opcional.
  - **Todo el día ON:** dos `<input type="date">` (Desde/Hasta, multi-día) →
    `inicioDiaLocalUtc(fechaDesde)` / `finDiaLocalUtc(fechaHasta)` (helpers ya
    existentes de `lib/format/fecha.ts`, usados tal cual — sin tocarlos).
  - **Todo el día OFF:** un solo `<input type="date">` ("Día") + dos
    `<input type="time">` (Desde/Hasta) → `fechaHoraLocalUtc(fechaDesde,
    horaDesde/horaHasta)`. Al togglear OFF se fuerza `fechaHasta = fechaDesde`
    para que no quede un rango multi-día escondido detrás del campo oculto.
  - Validación: reusa `crearExcepcionSchema`/`editarExcepcionSchema` de
    `@shared` tal cual (encargo, punto 4: "sólo hasta>desde. NO validar
    solape") — sin ninguna regla propia agregada. El error de `hasta>desde`
    se muestra como un aviso de formulario general (no bajo un input
    puntual: los campos que arman el rango cambian según el toggle, así que
    no hay un único input al que anclar el error).
  - `profesionalId` se manda `null` explícito (no `undefined`) cuando el
    alcance es "todo el centro" — el select vacío mapea a `''` en el estado
    de React, y `''|| null` lo normaliza antes de validar/enviar.
- `ExcepcionesPage.css` — clases propias de esta pantalla (mismo criterio que
  `ServiciosPage.css`/`ProfesionalesPage.css`: no se comparte CSS entre
  pantallas), incluidas `.filtro-fecha`/`.filtro-profesional` (duplicadas a
  propósito de `TurnosPage.css`, mismo criterio de no cruzar imports de CSS
  entre pantallas independientes).

**Archivos modificados:**
- `client/src/lib/format/fecha.ts` — agregado `fechaHoraLocalUtc(fechaISODate,
  horaHHmm)`: combina una fecha de calendario + una hora de reloj ('HH:mm',
  misma convención que `horariosSchema`) en el instante UTC del huso del
  centro. No existía un helper para esto (sólo `inicioDiaLocalUtc`/
  `finDiaLocalUtc`, día completo) — se agregó UNA vez acá, junto a sus
  hermanos, en vez de armarlo ad hoc adentro de `ExcepcionDrawer` (encargo,
  punto 3: "mismo helper que ya usás para turnos... reutilizalo, no
  dupliques" — la parte de "no duplicar" se interpretó como "un solo lugar
  para esta familia de helpers de fecha", ya que el combinador fecha+hora en
  sí no existía todavía en ningún lado del client).
- `client/src/routes/excepciones/ExcepcionesPage.tsx` (reemplaza el stub
  `PantallaPendiente`) — filtros (Desde con default = hoy, Hasta opcional sin
  default, Profesional), listado, drawer, y `eliminar(id)` (DELETE físico,
  sin PATCH de por medio). Catálogo de profesionales vía `listarUsuarios` de
  `routes/profesionales/api.ts` (encargo, punto 1: "vía listarUsuarios") —
  filtrado a `rol==='profesional'` en esta pantalla, no reimplementado; si
  falla, el select de alcance queda sin opciones y las filas muestran
  "Profesional" genérico en vez del nombre (mismo criterio de degradación
  que `ProfesionalesPage` con el catálogo de servicios).

**Mapping de tonos del tag de tipo (documentado por el encargo, punto 1 —
"tres tonos diferenciables tomados del set de §3, NO hues nuevos"):**
`feriado` → tono "confirmado" (verde, el centro cierra, sin urgencia),
`vacaciones` → tono "pendiente" (ámbar, alguien está afuera, amerita
atención), `bloqueo` → tono "rechazado" (rojo, el más restrictivo de los
tres). Verde/ámbar/rojo da la mayor separación de hue posible dentro del set
cerrado de §3.

**Decisión de implementación no pedida explícitamente — ventana por defecto:**
§4.8 ofrece dos alternativas ("default: de hoy en adelante / este mes"); el
encargo de esta tarea puntual pedía explícitamente "default de hoy en
adelante", así que se implementó **sin tope superior por defecto** (`Hasta`
arranca vacío, el usuario angosta la ventana a mano si quiere) en vez de
clamped a "este mes". Documentado acá por si hace falta revisarlo — no es una
⚠ porque §4.8 ya dejaba las dos opciones abiertas, no hay contradicción, sólo
una elección entre dos alternativas ya autorizadas.

**Tests/typecheck:** `npm run typecheck` (shared+server+client) limpio.
`npm run build --workspace=client` OK (`tsc --noEmit` + `vite build`
limpios). `npx vitest run` — **shared 10/10 sin cambios**; **server 127
tests, 125 pasan en la corrida completa, 2 fallan por timeout de 5000ms bajo
contención de paralelismo** (`auth.routes.test.ts` y `mi.routes.test.ts`, sin
relación con esta tarea — no se tocó código de server) — corridos en
aislamiento, los 21 tests de esos dos archivos pasan limpios. Conteo de §14
sin cambios (no se agregó ni tocó ningún test de server/shared en esta
tarea: es 100% frontend). Sigue sin test runner configurado en
`client/package.json` (mismo estado que el resto del panel).

#### Guión de prueba manual

1. `npm run dev` desde la raíz (server puerto 4000 + client puerto 5173).
   Necesita `server/.env` con `MONGODB_URI` apuntando a una réplica Mongo.
   Si no hay usuario a mano: `SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=...
   npm run seed:admin --workspace=server` (admin) y opcionalmente
   `npm run seed:turnos --workspace=server` (crea, entre otras cosas, la
   profesional "Rocío Benítez" — útil para probar el alcance "Una
   profesional" sin cargarla a mano).
2. Login como admin → nav completo, entrar a "Excepciones".
   - **Rol no-admin:** loguearse como una profesional ⇒ "Excepciones" no
     aparece en el nav y navegar a `/excepciones` a mano redirige a
     `/turnos` (guard de rol, sin pegarle a la API).
3. **Feriado del centro, todo el día:** "+ Nueva excepción" → tipo Feriado,
   alcance "Todo el centro", Todo el día ON (default), Desde/Hasta = mismo
   día (ej. mañana), motivo "Feriado nacional" → Guardar. Aparece en la
   lista con tag verde "Feriado", rango sin horario (ej. "22 ago 2026"),
   alcance "Todo el centro". Confirmar en Network que el POST manda
   `desde`/`hasta` como ISO **con Z**, sin offset (ej.
   `2026-08-22T03:00:00.000Z` si el día local arranca a las 00:00 -03:00).
4. **Vacaciones multi-día de una profesional:** tipo Vacaciones, alcance =
   "Rocío Benítez" (u otra profesional cargada), Todo el día ON, Desde =
   hoy+5, Hasta = hoy+10 → Guardar. Fila con tag ámbar "Vacaciones", rango
   "27 ago – 1 sep 2026" (sin horario, sin año repetido si coincide), alcance
   con el nombre de la profesional (no "Profesional" genérico).
5. **Bloqueo parcial por horas:** tipo Bloqueo, alcance "Todo el centro" (o
   una profesional), Todo el día **OFF** → aparece un único campo "Día" +
   Desde/Hasta de horario (ej. 14:00–16:00) → Guardar. Fila con tag rojo
   "Bloqueo", rango "22 ago 2026 · 14:00–16:00" (con horario, mismo día).
6. **Editar rango:** abrir el feriado del paso 3 con "Editar" → cambiar Hasta
   a un día posterior (con Todo el día ON) → Guardar → la fila refleja el
   nuevo rango multi-día.
7. **Eliminar con confirm:** click "Eliminar" en cualquier fila → la celda de
   acciones cambia a "¿Eliminar? No se puede deshacer." + Cancelar/Sí,
   eliminar. Click Cancelar ⇒ vuelve a Editar/Eliminar, NINGÚN request salió
   (confirmar en Network). Click "Eliminar" de nuevo → "Sí, eliminar" ⇒
   `DELETE /api/admin/excepciones/:id` con `X-Requested-With` (CSRF),
   respuesta 204, toast "Excepción eliminada.", la fila desaparece de la
   lista sin recargar la página a mano.
8. **hasta<=desde ⇒ error:** en el drawer, con Todo el día OFF, poner Hasta
   antes que Desde en el horario (ej. Desde 16:00, Hasta 14:00) → Guardar ⇒
   NO pega a la red, aviso de formulario "La fecha/hora 'hasta' tiene que ser
   posterior a 'desde'." Corregir ⇒ ahora sí guarda.
9. **Filtro por ventana y profesional:** con varias excepciones cargadas
   (pasos 3–5), poner "Hasta" en el filtro superior a un día ANTES del
   feriado del paso 3 ⇒ desaparece de la lista (sigue existiendo, sólo fuera
   de ventana). Vaciar "Hasta" ⇒ vuelve a aparecer. Filtrar por la
   profesional del paso 4 ⇒ quedan sólo sus vacaciones + las excepciones de
   "Todo el centro" (nunca las de otra profesional) — confirma el
   `$in:[null,id]` del server (§15.10/§5.1).
10. **Responsive:** angostar la ventana (~700px) — la fila colapsa a
    tipo/rango/acciones (alcance y motivo se ocultan), la grilla del drawer
    (Desde/Hasta) pasa a 1 columna.

⚠ REVISAR EN WEB: ninguna encontrada en esta tarea — el service/schema de
§15.10 ya traían todo lo necesario (DELETE físico, sin validación de solape,
`$in:[null,id]` en el listado, revalidación de `hasta>desde` cuando el PATCH
sólo trae un extremo). La única decisión no cerrada de antemano por el .md
fue la ventana por defecto del filtro (ver más arriba), y ésa ya venía con
dos alternativas autorizadas, no una contradicción.

### 2026-08-24 — Mi perfil (panel, cualquier usuario, §4.9) — CIERRA EL PANEL

Última pantalla del panel. Superficie de auto-gestión sobre `/api/mi/*`
(`requireAuth`, SIN admin-gate, recurso = sesión, sin `:id` en ningún
endpoint — ver `server/src/routes/mi.routes.ts`, ya scaffoldeado). Sin
mockup: mismo layout en secciones-card que `ConfiguracionPage` (§4.7),
reusando `Input`/`Button`/`EditorHorarios` ya cotejados — pero con **tres
guardados independientes** (uno por endpoint) en vez de un PATCH global con
dirty-tracking, porque acá son tres superficies de verdad separadas
(perfil/horarios/password), no un solo doc.

**NAV — ya estaba cerrado, no requirió cambio:** el encargo pedía "agregar
Mi perfil al nav de TODOS los roles". Al revisar `layout/nav.ts` (tarea de
scaffolding, 2026-08-13), el item `/mi` ya está sin `rolesPermitidos` (a
diferencia de servicios/profesionales/configuración/excepciones, que sí lo
tienen con `['admin']`) — visible para cualquier rol logueado por
construcción de `navParaRol()`. Mismo caso `App.tsx`: la ruta `/mi` cuelga
de `RequireSesion` pero NO de `RequireRol(['admin'])`, a diferencia de las 4
rutas admin-only. No se tocó ninguno de los dos archivos — verificado con el
guión de abajo (punto 4), no sólo por lectura.

**Archivos nuevos, `client/src/routes/mi/`:**
- `types.ts` — `MiPerfil`, espejo de `UsuarioPanel`
  (`server/src/services/usuarios.service.ts`, `obtenerUsuarioPanel` — GET
  `/api/mi/perfil` reusa el MISMO mapper que el CRUD admin, sólo cambia qué
  campos puede tocar cada superficie). Mirrorea acá en vez de importar
  `UsuarioPanel` de `routes/profesionales/types.ts` aunque el shape sea
  idéntico: ese tipo describe la respuesta de un endpoint admin-only
  (`/api/admin/usuarios`) al que una profesional no puede pegarle, y el
  criterio del repo es que cada carpeta de ruta mirrorea el shape de SU
  propio endpoint (mismo patrón que `routes/servicios/types.ts` y
  `routes/excepciones/types.ts` — `excepciones` sí importa `UsuarioPanel` de
  `profesionales/`, pero porque literalmente reusa `listarUsuarios()` de esa
  API para poblar un select, no porque el shape coincida). `rol` reusa el
  tipo `Rol` de `lib/auth` (ya el mismo par admin/profesional que
  `SesionUsuario`) en vez de redefinir el enum.
- `api.ts` — `obtenerMiPerfil`, `editarMiPerfil`, `editarMisHorarios`,
  `cambiarMiPassword`; wrapper delgado sobre `http`, mismo criterio que el
  resto de `routes/*/api.ts`.
- `MiPerfilPage.tsx` (reescribe el stub `PantallaPendiente`) + `.css`.

**`MiPerfilPage.tsx`, tres secciones:**
1. Mis datos — `nombre` editable (único campo de `miPerfilSchema`,
   `.strict()` en `@shared/schemas/usuario.schema.ts`: sólo declara
   `nombre`, SIN `telefonoE164`). Se verificó el schema real antes de
   decidir: `telefonoE164` no está declarado ahí, así que queda readonly por
   contrato del server (mandarlo daría 400 BODY_INVALIDO por el `.strict()`),
   no por elección de UI — Input disabled con hint "Lo cambia Camila desde el
   CRUD de profesionales." Mismo criterio para `email` (tampoco está en el
   schema): Input disabled, hint "Es tu usuario de acceso. Lo cambia
   Camila." Guardar corre `miPerfilSchema.safeParse({nombre})` antes de
   pegarle a la red (reuso de Zod) y, en éxito, llama
   `useAuth().establecerSesion(...)` con el `MiPerfil` que devuelve el
   PATCH — sincroniza el nombre en el bloque de usuario de la sidebar sin un
   round-trip extra a `/api/auth/me`.
2. Bloque readonly de contexto (rol/atiende/servicios) — sección separada,
   mismos Input disabled que arriba (reuso de la primitiva, no un
   componente nuevo de badge/chip). `servicios` se muestra como conteo ("N
   servicios"), no resuelto a nombres: mismo criterio que `FilaUsuario.tsx`
   en el CRUD admin (conteo también ahí, sin nombres). Alternativa
   considerada y descartada: resolver nombres vía GET /api/servicios
   (público, sin admin-gate, así que una profesional sí podría pegarle) — se
   descartó por sumar un request extra y sólo resolver servicios
   `activo:true` (uno dado de baja quedaría sin nombre igual, forzando un
   caso especial), cuando el precedente ya establecido en el panel para esta
   misma info es conteo. Copy exacto del encargo: "Tu rol, servicios y
   disponibilidad los administra Camila."
3. Mis horarios — EditorHorarios nullable=false, mismo patrón de remount por
   `key` que ConfiguracionPage (la página nunca se desmonta, EditorHorarios
   sólo lee `value` al montar). PATCH /api/mi/horarios con
   `misHorariosSchema` (`.strict()`, reemplaza el array completo, no diff) —
   validación real vía `editorRef.validar()`, no una copia del validador.
4. Cambiar mi contraseña — actual + nueva (min 8, `cambiarPasswordSchema` de
   @shared) + repetir (sólo front, el server no conoce "repetir"). POST
   /api/mi/password. Mapeo por `codigo` (frontend.md §2): 401
   CREDENCIALES_INVALIDAS (único código que emite `cambiarMiPassword` en
   `usuarios.service.ts` cuando `actual` no verifica) da error inline bajo
   el campo "Contraseña actual", NO toast genérico — mismo criterio que
   LoginPage.tsx con el mismo código. Cualquier otro error cae al toast
   genérico.

**¿La sesión sobrevive a cambiar la propia contraseña?** El encargo pedía no
asumir y verificar. Por lectura de código: `usuarios.service.ts` en
`cambiarMiPassword` sólo actualiza `passwordHash` y guarda — a diferencia de
`resetPasswordUsuario` (reset del admin, §15.9), NO toca la colección de
sesiones. Conclusión: la sesión actual sigue viva después de un cambio de
contraseña propio con éxito (a diferencia del reset por el admin, que sí
invalida todo). El punto 3 del guión de abajo lo ejercita a mano, no sólo
por lectura.

**Sin ⚠ REVISAR EN WEB:** no se encontró ninguna contradicción con lo
cerrado en §4.9 — el schema real (`miPerfilSchema`) confirma exactamente lo
que el encargo anticipaba ("verificá el schema; si no está, readonly"), y
NAV/route-guard ya estaban resueltos desde el scaffolding.

**Tests/typecheck:** `npm run typecheck` (shared+server+client) limpio.
`npm run build --workspace=client` OK (`tsc --noEmit` + `vite build`
limpios). `npx vitest run` — shared 10/10 sin cambios; server: en la corrida
de la suite COMPLETA 2 tests dieron timeout de 5000ms por contención de
paralelismo (`auth.routes.test.ts` y `mi.routes.test.ts`, mismo síntoma ya
documentado en la entrada 2026-08-17 — no relacionado con esta tarea, cero
cambios de `server/`), corridos en aislamiento los 21 tests de esos dos
archivos pasan limpios. Sigue 127 server + 10 shared, sin test runner en
`client/package.json` (mismo estado que el resto del panel — esta tarea
tampoco agrega lógica testeable del lado server/shared).

#### Guión de prueba manual

1. `npm run dev` desde la raíz. Necesita `server/.env` con `MONGODB_URI`. Si
   no hay usuarios a mano: `npm run seed:admin --workspace=server` (admin) y
   `npm run seed:turnos --workspace=server` (crea, entre otras cosas, la
   profesional "Rocío Benítez" con horario propio — útil para el punto 2).
2. Loguearse como profesional (ej. Rocío Benítez): el nav muestra "Turnos" +
   "Mi perfil" únicamente (sin Servicios/Profesionales/Configuración/
   Excepciones). Entrar a "Mi perfil".
   - Mis datos: editar "Nombre" — el botón "Guardar" de esa sección pasa de
     disabled a habilitado sólo cuando el valor difiere del cargado.
     Guardar da toast "Nombre actualizado.", y el nombre en el bloque de
     usuario de la sidebar (abajo a la izquierda) cambia también, sin
     recargar la página.
   - Teléfono/Email: campos grises, no editables (tipear no hace nada);
     debajo de cada uno, el hint explica quién los cambia.
   - Bloque "Tu perfil en el centro": Rol="Profesional", Atiende
     turnos="Sí"/"No" según el seed, "Servicios que presta" con un número
     (no nombres) — todos disabled. Debajo, el copy "Tu rol, servicios y
     disponibilidad los administra Camila."
   - Mis horarios: tocar cualquier bloque (ej. correr un "hasta" 30min) — el
     botón "Guardar" de esa sección se habilita (el de "Mis datos" NO, son
     independientes). Guardar da toast "Horarios actualizados." Recargar la
     página (F5) — el horario nuevo sigue ahí (persistió de verdad).
   - Cambiar contraseña: dejar "Contraseña actual" vacía y "Nueva" con 3
     caracteres, Guardar — no pega a la red, hints inline ("Ingresá tu
     contraseña actual.", "La nueva contraseña necesita mínimo 8
     caracteres."). Completar con la actual MAL (cualquier valor) + nueva
     válida (8+) + repetir igual, Guardar — pega al server, vuelve 401, el
     campo "Contraseña actual" muestra "La contraseña actual no es
     correcta." inline (NO redirige a /login — confirmar en Network que NO
     se disparó el interceptor global: seguís en /mi, no en /login). Ahora
     con la actual BIEN + nueva válida + repetir que NO coincide — error
     inline "No coincide con la nueva contraseña." bajo "Repetir nueva
     contraseña", sin pegarle a la red. Corregir el repetir, Guardar — toast
     "Contraseña actualizada.", los 3 campos se vacían.
3. Verificar que la sesión sigue viva tras cambiar la propia contraseña:
   inmediatamente después del último paso, navegar a "Turnos" sin volver a
   loguearse — debe cargar normal (NO redirige a /login). Cerrar sesión,
   volver a entrar con la contraseña NUEVA (la vieja ya no debería andar).
4. Loguearse como admin y confirmar que "Mi perfil" aparece en su nav junto
   con el resto de las pantallas (Servicios/Profesionales/Configuración/
   Excepciones/Turnos), no sólo en el de profesional. Entrar, repetir el
   cambio de contraseña propio (con la de admin) para confirmar que la
   superficie funciona igual para ambos roles — el "Rol" del bloque readonly
   debe decir "Admin".
5. Guard sin sesión: deslogueado, navegar a /mi a mano en la barra de
   direcciones — redirige a /login (mismo guard RequireSesion que el resto
   del panel, sin caso especial).

### 2026-08-25 — Ajuste de config de dev: `dev:https` roto + chequeo de `.env.example` (dev-tooling, sin pantalla asociada)

No es tarea de pantalla — arranque de dev tooling. Dos pedidos puntuales: (1)
confirmar un fix manual sobre `mkcert()` en `vite.config.ts`, (2) verificar que
`server/.env.example`/`client/.env.example` traigan `NODE_ENV=development` /
`VITE_API_URL` (el gap que causaba el 401 mudo de la cookie, ya depurado y
documentado en la entrada 2026-08-13).

**1. `mkcert()` condicional — el fix a mano estaba bien, pero `dev:https`
seguía roto por otra razón, no relacionada.**

El cambio manual (`mkcert()` sólo entra a `plugins` si el flag de https está
prendido) es correcto: `vite-plugin-mkcert` fuerza `server.https` con sólo
estar presente en el array (confirmado leyendo `dist/index.cjs` del paquete —
únicamente se abstiene si `server.https === false` explícito), así que antes
`npm run dev` normal también terminaba en https por la sola presencia del
plugin, sin importar ningún flag. Esa parte quedó consistente.

Lo que NO andaba: el propio flag. `dev:https` era `"vite --https"`, y **Vite 5
no tiene `--https` en su CLI** (existía en Vite 2, se sacó después). Confirmado
corriendo `npm run dev:https` tal cual estaba: revienta antes de leer
`vite.config.ts` con `CACError: Unknown option `--https``. El detector nuevo
(`process.argv.includes('--https')`) nunca llegaba a ejecutarse — el proceso
ya había muerto en el parseo de argumentos del propio Vite. Confirmado
inspeccionando `node_modules/vite/dist/node/cli.js`: las opciones válidas del
comando `dev`/`serve` son `--host`, `--port`, `--open`, `--cors`,
`--strictPort` — no hay `--https`; `-m, --mode <mode>` sí es una opción global
real.

**Fix:** `client/vite.config.ts` — `defineConfig(({ command, mode }) => ...)`,
`httpsFlag = mode === 'https'` (antes `process.argv.includes('--https')`).
`client/package.json` — `dev:https`: `"vite --mode https"` (antes `"vite
--https"`). Comentario del archivo actualizado explicando por qué no se usa
`--https` (la razón queda escrita ahí para que no se reintroduzca).

**Verificado corriendo ambos scripts (no sólo lectura de código):**
- `npm run dev:https --workspace=client` ⇒ `VITE ... ready`, `Local:
  https://localhost:5173/`. Usó el cert de mkcert ya cacheado de una sesión
  anterior (no volvió a pedir instalar la CA).
- `npm run dev --workspace=client` ⇒ `Local: http://localhost:5173/` (sin
  https, mkcert no se cargó — confirma que el gate condicional funciona en
  ambos sentidos, no sólo cuando se prende).

**2. `.env.example` — ya estaban, no hizo falta tocar nada.**

`server/.env.example` ya tenía `NODE_ENV=development` (línea 2, desde el
scaffolding inicial). `client/.env.example` ya tenía `VITE_API_URL=http://localhost:4000`
(con la nota sobre mixed-content de la entrada 2026-08-13 al lado). Un clone
nuevo que copie ambos a `.env` no debería pisar el 401 mudo de la cookie
(`esDev()` en `server/src/middleware/session.ts` necesita `NODE_ENV=development`
para la rama `secure:false`+`sameSite:'lax'` — ver modelo-datos-turnos.md §17,
entrada 2026-08-13 "Ajuste dev-only").

**Sin ⚠ REVISAR EN WEB:** nada de esto contradice una decisión cerrada — es
un bug de dev-tooling (flag de CLI que dejó de existir en algún upgrade de
Vite) sin relación con el modelo de datos ni con pantallas.

**Tests/typecheck:** `npm run typecheck` (shared+server+client) limpio. Sin
cambios de lógica de negocio — no aplica `npx vitest run`.

#### Guión de prueba manual

1. `cd client && npm run dev:https` — confirmar `Local: https://...` en la
   salida, sin error de CLI. Primera vez en una máquina nueva: mkcert pide
   instalar la CA local (puede pedir permiso de administrador en Windows);
   después queda cacheado.
2. `cd client && npm run dev` — confirmar `Local: http://...` (sin https).

### 2026-08-25 — Scaffolding de la web pública (`client-publico/`, cierra §4.2.1)

Segunda SPA del monorepo, hermana de `client/` (§4.10). Nombre de carpeta:
`client-publico` — la primera opción sugerida en el encargo; se descartó
`public/` porque colisiona conceptualmente con la carpeta de assets estáticos
que Vite reserva con ese nombre. Sólo fundaciones — SIN la pantalla de reserva
(§4.11 es la tarea siguiente).

**Archivos nuevos, `client-publico/`:**
- `package.json` — Vite+React+TS. SIN `react-router-dom` (ver nota de
  `App.tsx` abajo) y SIN `vite-plugin-mkcert` (esta app no tiene cookie de
  sesión que dependa de https en dev, §4.10 — la única razón por la que el
  panel necesita mkcert no aplica acá).
- `vite.config.ts` — alias `@shared` idéntico al panel; puerto **5174** (el
  panel usa 5173, no pueden compartirlo si `npm run dev` los levanta juntos).
- `tsconfig.json` — mismo target/paths que `client/tsconfig.json`.
- `index.html` — título propio ("Reservar turno").
- `src/vite-env.d.ts` — igual al panel (`VITE_API_URL`).
- `src/lib/http/{client.ts, httpError.ts, index.ts}` — cliente HTTP propio,
  deliberadamente más chico que el del panel: SIN `credentials:'include'`,
  SIN header `X-Requested-With` (CSRF), SIN interceptor 401 ni evento global
  (no hay sesión que perder). Sólo expone `get`/`post` — la superficie
  pública de §4.11 (servicios, profesionales, disponibilidad, crear turno)
  no necesita `patch`/`delete`, así que no se declaran. Parse de error
  `{codigo, mensaje, detalle?}` vía `errorApiSchema` de `@shared`, mismo
  criterio de mapeo por `codigo` que el panel.
- `src/styles/tokens.css` — copia byte a byte de
  `client/src/styles/tokens.css` (mismos tokens de marca, §3, ninguna
  variable nueva ni redefinida).
- `src/styles/global.css` — mismo reset e import de fuentes que el panel;
  comentario nuevo aclarando mobile-first (~420px de base) en vez de
  desktop-first.
- `src/routes/inicio/InicioPage.tsx` (+ `.css`) — placeholder; sólo confirma
  que la app sirve algo en su puerto para el guión de prueba de esta tarea.
  La pantalla real es §4.11, tarea siguiente.
- `src/App.tsx` — sin router. El flujo de reserva v1 (§4.11) es una única
  pantalla con pasos internos (acordeón → grilla → bottom sheet → éxito), no
  rutas separadas; si eso cambia al construir esa pantalla,
  `react-router-dom` se agrega ahí, no antes.
- `src/main.tsx` — sin `AuthProvider` ni `ToastProvider` (app anónima, §4.10;
  `ToastProvider` es una primitiva del panel que no se portó todavía — no
  hace falta para esta tarea).
- `.env.example` — `VITE_API_URL` propio (misma API que el panel), con nota
  sobre el gap de CORS (ver ⚠ abajo).
- `mockups/reserva-camila.html` — copiado desde `client/mockups/` (§4.11: "la
  referencia visual se mueve/copia a la carpeta de la app pública en su
  scaffolding").

**Archivos modificados:**
- `package.json` (raíz) — cuarto workspace `client-publico`. `dev` ahora
  levanta tres procesos con `concurrently` (server + client + client-publico,
  mismo patrón `-n`/`-c` con un tercer color). Scripts nuevos:
  `dev:client-publico`; `build` y `typecheck` extendidos al nuevo workspace.

**⚠ REVISAR EN WEB: CORS del server sólo admite UN origen — no deja pasar
esta app tal cual está hoy.** `server/src/app.ts` arma
`cors({ origin: resolverPanelOrigin(...) })` con un string único
(`PANEL_ORIGIN`, default de dev `http://localhost:5173`). En dev, un
GET/POST desde `http://localhost:5174` (esta app) va a fallar por CORS en
cuanto la pantalla de reserva (§4.11) empiece a pegarle a la API — no lo
pude ejercitar de punta a punta en esta tarea porque todavía no hay ningún
request real (fundaciones sin pantalla), pero el problema está en el código,
no es hipotético: `origin` no acepta lista ni función en la forma en que se
usa hoy. Necesita, del lado del server (fuera de alcance acá, "toca
server"):
- o una función `origin` que compare contra un array de orígenes permitidos,
- o una env var nueva (ej. `CORS_ORIGINS_PUBLICOS`, lista separada por coma)
  además de `PANEL_ORIGIN`.
No lo resolví. Workaround manual sólo para probar la pública sola en local:
levantar el server con `PANEL_ORIGIN=http://localhost:5174` — pisa el acceso
del panel, no es una solución, sólo destrabaría un guión de prueba de §4.11
mientras esto se decide en la sesión de arquitectura.

**Tests/typecheck:** `npm run typecheck` (shared+server+client+client-publico)
limpio. `npm run build --workspace=client-publico` OK (`tsc --noEmit` +
`vite build`, bundle ~143KB / ~46KB gzip). `npx vitest run` — shared 10/10
sin cambios. Server: no se tocó ningún archivo de `server/` ni `shared/` en
esta tarea; igual corrí la suite completa por protocolo (CLAUDE.md). En la
corrida completa dieron timeout de 5000ms 4-5 tests distintos en cada
intento (contención de paralelismo entre los 17 archivos de test, cada uno
con su propio `MongoMemoryReplSet` — mismo síntoma ya documentado en las
entradas 2026-08-17 y anteriores de esta sección); corridos en aislamiento
los mismos archivos pasan 100% limpio (confirmado corriendo los 5 que
fallaron en la primera pasada: 59/59 verde). Conteo real observado hoy: 135
tests en server, no 127 como quedó anotado en entradas previas de este
archivo — drift preexistente de trabajo sin documentar en `server/` (hay
archivos de test nuevos sin commitear al abrir esta sesión, ver `git
status`), no producido por esta tarea; no lo reconcilié porque no toqué
`server/`/`shared/` — queda para quien cierre esa tarea de backend.

#### Guión de prueba manual

1. `npm install` en la raíz (una vez; ya trae los tres workspaces existentes
   + `client-publico`).
2. Copiar `client-publico/.env.example` a `client-publico/.env`
   (`VITE_API_URL=http://localhost:4000` ya viene seteado).
3. `npm run dev` desde la raíz — ahora levanta TRES procesos: server (4000),
   client/panel (5173), client-publico (5174).
4. Abrir `http://localhost:5174` — debe verse el placeholder ("Reservar
   turno" + copy de fundaciones), SIN redirect a ningún `/login` (no hay
   guard, es anónima). En DevTools > Network, confirmar que no sale ningún
   request a la API todavía (no hay pantalla real que pedir datos).
5. Confirmar que el panel (`http://localhost:5173`) sigue andando igual que
   siempre en paralelo — las dos apps no deben pisarse (puertos y procesos
   distintos).
6. `npm run build --workspace=client-publico` — build limpio, `dist/`
   generado (verificado en esta tarea, ver arriba).

### 2026-08-25 — Pantalla de reserva pública (`client-publico/`, §4.11)

Pantalla real sobre el scaffolding de la tarea anterior. Alcance completo del
encargo: 4 pasos (catálogo acordeón → grilla por día local → bottom sheet de
datos → éxito), manejo de `409 SLOT_OCUPADO` en el submit (no al tocar el
slot, a diferencia del mockup) y de `429` en las cuatro superficies públicas,
validación con `crearTurnoSchema` de `@shared` + `libphonenumber-js`.

**Archivos nuevos, `client-publico/src/`:**
- `lib/format/fecha.ts` — Luxon fijo a `America/Argentina/Buenos_Aires`
  (`TIMEZONE_CENTRO`, análogo al de `client/`, sin compartirlo: cada app
  arma el suyo). `agruparPorDiaLocal(slots)` agrupa la lista plana de
  `{inicio,fin}` ISO UTC por clave `yyyy-MM-dd` LOCAL y arma la etiqueta
  ("Hoy · jueves 13 ago" / "Mañana · …" / "sábado 15 ago", clon del formato
  del mockup). `rangoSemanaUtc()` arma `[ahora, ahora+7d]` en ISO UTC con Z
  para pedir "sólo el tramo visible" (§4.11) — el server igual clampea a su
  propia ventana, pero no tiene sentido pedirle los ~60 días completos.
- `lib/telefono.ts` — `armarTelefonoE164(resto)`: candidato `+549${dígitos}`
  validado con `libphonenumber-js` (país AR, `isValid()`). Más simple que
  `normalizarTelefonoAR` del server (`server/src/services/telefono.ts`)
  porque el form YA fija el prefijo `+54 9` (no hay que resolver el
  marcador doméstico "15" ni el caso sin 9) — cubre áreas de 2 a 4 dígitos
  porque delega en la librería, no en un regex propio.
- `lib/errores.ts` — `mensajeDeError(err)`: mapea `HttpError.codigo ===
  'DEMASIADAS_SOLICITUDES'` a un texto propio más claro que el genérico del
  server; para el resto reusa `HttpError.message` (ya es el `mensaje`
  curado de `ApiError` o el fallback de red de `lib/http/httpError.ts`).
  Usado en las CUATRO superficies públicas (servicios, profesionales,
  disponibilidad, crear turno) — ninguna falla en silencio ante un 429
  (pedido explícito del encargo, más allá del 409 crítico).
- `lib/iniciales.ts`, `lib/format/plata.ts` — helpers chicos (avatar de
  iniciales, centavos→ARS), mismo criterio que sus pares en `client/`.
- `routes/reserva/types.ts` — shapes espejados a mano (server no tiene Zod
  para sus RESPUESTAS, sólo inputs): `ServicioPublico`, `ProfesionalPublico`,
  `Slot`, `TurnoCreado`, `DatosClienta`. `Carga<T>` (`{tipo:'cargando'} |
  {tipo:'error',mensaje} | {tipo:'ok',datos}`) reemplaza el union más simple
  `T[]|'cargando'|'error'` porque el mensaje de error necesita variar
  (rate limit vs. genérico) y ahí no hay dónde colgarlo.
- `routes/reserva/api.ts` — `listarServicios`, `listarProfesionales`,
  `listarDisponibilidad`, `crearTurno`, wrappers delgados sobre `lib/http`
  (todos públicos, sin auth, §15.1/15.2/15.3).
- `routes/reserva/ReservaPage.tsx` (+ `.css`) — orquestador. Todo el estado
  vive acá (sin Context/reducer — la pantalla es un único árbol, no
  justifica más máquina): catálogo cacheado (no se vuelve a pedir al volver
  del paso 2 con "Cambiar"), selección servicio+profesional, slots del paso
  2, datos del sheet (paso 3), resultado (paso 4), toast. `manejarSlotOcupado`
  implementa el contrato del 409 al pie de la letra: cierra el sheet,
  toast de aviso, vuelve al paso 2 reemplazando SÓLO los slots del día
  local del horario que se ocupó (`detalle.slots` trae nomás ese día) con
  lo que devolvió el propio 409 — sin otro GET — conservando los demás
  días ya cargados y sin tocar `servicioElegido`/`profesionalElegido`.
- `routes/reserva/components/Catalogo.tsx`, `Grilla.tsx`, `HojaDatos.tsx`,
  `Exito.tsx`, `Toast.tsx` — clonados de `.svc`/`.summary`+`.daygroup`/
  `.sheet`/`.success`/`.toast` del mockup, sobre los tokens de `styles/
  tokens.css` (ya existían del scaffolding). `HojaDatos` valida con
  `crearTurnoSchema.safeParse(candidato)` (nombre/email) + `armarTelefonoE164`
  (el gate real del teléfono — el schema sólo exige `min(6)`, no E164
  válido) y recién ahí habilita "Confirmar turno"; hints inline por campo
  tocado, mismo criterio que el toggle de contraseña del panel.

**Decisiones de implementación no cerradas explícitamente en el encargo,
documentadas por si hace falta revisarlas (no son ⚠, están dentro de "a
discreción de impl" del propio encargo):**
- **3 segmentos de progreso, no 4.** El encargo dice "4 pasos con indicador
  de progreso (ver mockup)", pero el mockup referenciado sólo tiene 3 `<i>`
  en `.steps` — el paso de datos es un bottom sheet SOBRE la grilla, no una
  pantalla propia, y el mockup no le da segmento. Repliqué el mockup tal
  cual (3 segmentos: catálogo / grilla+sheet / éxito) en vez de inventar un
  4º segmento que el propio mockup no tiene.
- **Botón "Cancelar" agregado al pie del sheet**, además de "Confirmar
  turno" (el mockup sólo tenía el botón sólido; cerraba tocando el scrim).
  Sin él no hay forma accesible por teclado de cerrar el sheet — el scrim
  no es alcanzable sin mouse/touch. Costo bajo, cierre explícito coherente
  con el resto de la UI (botón de texto, no otro `.solid`).
- **Confirmar deshabilitado hasta validar** (no "click y mostrar error" como
  hace literalmente el JS del mockup) — leo "Validación inline antes de
  habilitar Confirmar" (texto del encargo) como pedido de disable
  proactivo; los hints inline por campo tocado cubren el "por qué" para que
  el disable no sea mudo.

**Confirmado durante esta tarea, sin acción — el ⚠ REVISAR EN WEB de la
entrada anterior (CORS sólo admitía un origen) YA estaba resuelto en
`server/src/app.ts`** (`CORS_ORIGINS`/`resolverOrigenesPermitidos` con lista
de orígenes, default de dev `[':5173', ':5174']`) antes de empezar esta
tarea — no hizo falta tocar `server/`. Verificado end-to-end en el smoke
test de abajo (request real desde el flujo contra `localhost:5174`).

**Tests/typecheck/build:** `npm run typecheck` (shared+server+client+
client-publico) limpio. `npm run build --workspace=client-publico` limpio
(`tsc --noEmit` + `vite build`, ~405KB/~116KB gzip JS + ~11KB/~3KB gzip
CSS). `npm run build --workspace=client` también limpio (no se tocó nada
de `client/`, corrido por protocolo). `npx vitest run` en `shared/`: 10/10
verde. En `server/`: misma contención de paralelismo entre
`MongoMemoryReplSet` ya documentada en las dos entradas anteriores de esta
sección (varios archivos dan timeout de 5000ms corriendo los 17 juntos);
re-corridos en aislamiento los 7 archivos que habían fallado (`turnos.panel.
test.ts`, `consultarDisponibilidad.test.ts`, `whatsapp.test.ts`,
`admin/configuracion.routes.test.ts`, `admin/servicios.routes.test.ts`,
`auth.routes.test.ts`, `admin/usuarios.routes.test.ts`): **todos verdes**
(104/104 en ese subconjunto). No se tocó ningún archivo de `server/` ni
`shared/` en esta tarea — la causa es contención de recursos del entorno,
no una regresión introducida acá.

**Smoke test contra API real** (además del guión de abajo, que lo hace
Santiago): con el server ya corriendo contra el Atlas de dev y el admin ya
sembrado, seedeé por `curl` un servicio ("Corte de pelo", 30min, $5000,
`mostrarPrecio:true`) y una profesional (`rocio.smoketest@x.com`,
Lun-Vie 09-18, prestando ese servicio) vía `/api/admin/*`, y ejercité en
orden `GET /api/servicios` → `GET /api/servicios/:id/profesionales` →
`GET /api/disponibilidad` → `POST /api/turnos` (201, `TRN-2026-0001`) →
`POST /api/turnos` de nuevo sobre EL MISMO `inicio` → `409 SLOT_OCUPADO`
con `detalle.slots` trayendo la grilla de ese día YA sin el horario
tomado. Los cuatro shapes coinciden exactamente con `routes/reserva/
types.ts`/`api.ts` — nada quedó desalineado entre lo tipado a mano y la
respuesta real. Esa profesional/servicio de prueba quedan en la base de
dev (mismo criterio que `rocio.seed@camigonzalez.local` de la tarea de
turnos del panel) — sirven de datos ya sembrados para el guión de abajo,
no hace falta crearlos de nuevo.

**No hecho en esta sesión, por falta de herramienta:** no hay
`chromium-cli`/Playwright disponible en este entorno para una pasada
visual con capturas de pantalla — la verificación de esta tarea fue
typecheck + build + contrato de API real de punta a punta (arriba), no una
inspección visual del render. El cotejo visual real (colores, spacing,
que el bottom sheet anime bien, etc.) queda para el guión de abajo, que
Santiago corre local con el browser.

#### Guión de prueba manual

Ya hay datos sembrados en la base de dev (servicio "Corte de pelo" +
profesional `rocio.smoketest@x.com`, ver smoke test arriba) — no hace falta
sembrar nada para probar el flujo feliz, pero abajo también se explica cómo
generar más si hace falta.

1. `npm install` en la raíz si no corrió antes en esta sesión.
2. `npm run dev` desde la raíz (server 4000, panel 5173, pública 5174).
3. Abrir `http://localhost:5174`.
4. **Flujo feliz:** tocar "Corte de pelo" → se expande mostrando a
   "Rocío Test" con avatar "RT" → tocar la profesional → pasa a la grilla
   (resumen fijo arriba con "Cambiar", slots agrupados por día, "Hoy" y los
   próximos días de la semana en grid de 3 columnas). Tocar un slot → se
   abre el bottom sheet sobre la grilla (no navega). Completar nombre
   ("Juana Pérez"), teléfono (sólo el resto después de "+54 9", ej.
   "341 555-1234") — el botón "Confirmar turno" pasa de deshabilitado a
   habilitado sólo cuando nombre y teléfono son válidos; tocar el campo y
   dejarlo vacío/inválido muestra el hint en rojo debajo. Confirmar → pasa
   al paso 4 con el resumen (servicio/profesional/día·hora) y el aviso de
   WhatsApp — confirmar en DevTools > Network que la respuesta 201 de
   `POST /api/turnos` NO trae ningún campo de token.
5. **"Cambiar" y catálogo cacheado:** desde la grilla, tocar "Cambiar" →
   vuelve al catálogo con el mismo servicio ya expandido (no repite el GET
   de profesionales — confirmar en Network que no sale un segundo
   `GET /api/servicios/:id/profesionales`).
6. **Empty-state (0 slots, no error):** en el panel (`http://localhost:5173`,
   admin ya sembrado), ir a Configuración y subir momentáneamente
   "antelacionMinimaHoras" a un número enorme (ej. 999999) y guardar; volver
   a la pública, elegir el mismo servicio/profesional → la grilla muestra
   "No quedan horarios en estos días. Probá más adelante." (no un banner de
   error). Revertir el valor en Configuración al terminar (contrato: la
   ventana efectiva `[desde,hasta]` queda vacía y el server devuelve
   `{slots:[]}` sin 400, §15.2).
7. **409 SLOT_OCUPADO (el caso crítico):** abrir DOS pestañas en
   `http://localhost:5174`, en ambas llegar hasta el mismo slot del mismo
   día/profesional y abrir el sheet con datos distintos cargados. Confirmar
   en la pestaña A primero (pasa a éxito). Volver a la pestaña B (sigue
   mostrando el sheet abierto sobre la grilla vieja) y confirmar ahí
   también → banner de error en el sheet NO debería aparecer para este
   caso puntual (el 409 cierra el sheet en vez de mostrarlo inline) — lo
   que sí tiene que pasar: toast "Ese horario se acaba de ocupar. Elegí
   otro." abajo, el sheet se cierra solo, y la grilla del paso 2 se
   re-renderiza SIN ese slot (los demás slots de ese día y de los otros
   días siguen ahí) — todo esto sin que salga un segundo
   `GET /api/disponibilidad` en Network (confirmar: sólo el `POST
   /api/turnos` que dio 409).
8. **429 (difícil de forzar a mano, igual que el de login del panel):**
   `POST /api/turnos` corta a partir del intento 21 en 10 minutos por IP
   (`server/src/routes/turnos.routes.ts`). Si hace falta validarlo,
   disparar ~21 `fetch('http://localhost:4000/api/turnos', {method:'POST',
   headers:{'Content-Type':'application/json'}, body:'{}'})` seguidos desde
   la consola del browser (van a dar 400 antes que 429 porque el body está
   vacío, pero lo que importa es el conteo por IP) y confirmar que alguno
   de los últimos da 429 `DEMASIADAS_SOLICITUDES` — si se llega a probar
   desde la propia pantalla, el banner del sheet debería decir "Demasiadas
   solicitudes seguidas. Esperá un momento y volvé a intentar."
   `GET /api/servicios`/`/profesionales`/`/disponibilidad` cortan a las 60/min
   cada uno — mismo criterio de mensaje, más difícil aún de alcanzar
   navegando a mano.
9. **Servicio/profesional propios (opcional):** si se quiere probar con
   datos nuevos en vez de los ya sembrados, crear un servicio en
   `/servicios` del panel (admin) y una profesional en `/profesionales`
   marcándola "atiende" con horario semanal y ese servicio en "servicios
   que presta" — aparece en la pública sin reiniciar nada (son reads
   directos a la base, sin caché de servidor).
10. `npm run build --workspace=client-publico` — build limpio (verificado
    en esta tarea, ver arriba).