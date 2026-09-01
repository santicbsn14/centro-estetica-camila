# Camila González Belleza — Sistema de Turnos

Sistema de gestión de turnos para un centro de estética. Clientas piden turno desde la web sin
registrarse; el centro aprueba o rechaza desde un panel; el sistema notifica por WhatsApp (Twilio)
y mail en cada paso.

**Fuente de verdad del proyecto:** [`modelo-datos-turnos.md`](./modelo-datos-turnos.md).
Leerlo ANTES de tocar modelos, endpoints, el algoritmo de disponibilidad o el worker — ahí están
las decisiones y el porqué de cada una. Este archivo no lo duplica, solo orienta la navegación
del repo y fija el protocolo de trabajo.

## Cómo se toman las decisiones acá (protocolo, no negociable)

Este proyecto se arquitecta en una sesión de Claude Web separada, no en Claude Code. Cuando
llega un prompt de tarea acá, ya viene de una decisión cerrada — no reabras ni reinterpretes
lo que ya está en `modelo-datos-turnos.md` §1 a §16, esas secciones son especificación cerrada.

**Al cerrar cualquier tarea:**
1. Agregá una entrada nueva en `modelo-datos-turnos.md` §17 (Registro de implementación),
   al final del archivo, formato append-only, fechada. Bitácora de código: qué se implementó,
   qué archivos, qué tests, qué problemas encontraste, qué descartaste — NO reescribas ni
   resumas la especificación de §1-16.
2. Si durante la implementación encontrás algo que CONTRADICE o exige cambiar una decisión ya
   cerrada en §1-16 — no la edites, no la "arregles" en silencio. Escribí la entrada en §17
   empezando con `⚠ REVISAR EN WEB:` explicando el conflicto, y avisale a Santiago. Esa
   decisión se retoma en la sesión de arquitectura, no se resuelve acá.
3. Actualizar el conteo de tests en §14 sí es rutina mecánica, no decisión — hacelo siempre
   que cambie.
4. Corré la suite completa (`npm run typecheck` + tests) antes de dar la tarea por cerrada.
   Nunca reportes "cerrado" sin haber corrido ambas cosas.

**Este archivo (`CLAUDE.md`) no lleva historial de tareas.** Eso vive en §17 del `.md`. Acá
solo va lo que es cierto siempre, en cualquier sesión.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React + TypeScript + Vite (`client/`) |
| Backend | Node.js + Express + TypeScript (`server/`), pensado para Render |
| Base de datos | MongoDB Atlas (requiere replica set por transacciones) |
| Validación compartida | Zod (`shared/`), un esquema, dos consumidores |
| WhatsApp | Twilio → WhatsApp Business Platform |

## Estructura del monorepo

Workspaces de npm. Un solo `npm install` en la raíz instala los tres paquetes.

shared/ esquemas Zod + tipos inferidos + utils (intervalos), consumidos por server y client
vía alias @shared/*
server/ Express + TS. models/, services/, routes/ completos para: auth, turnos (público +
panel), disponibilidad, CRUD admin (servicios/configuracion/usuarios/excepciones).
Worker de notificaciones: en construcción.
client/ React + TS + Vite. Sin empezar todavía.

El alias `@shared/*` apunta directo a `shared/src/*` (no hay build intermedio): configurado por
`paths` en `tsconfig` para `tsx` en el server, y por `resolve.alias` en `vite.config.ts` para el
client. Al importar algo nuevo desde `shared/`, agregarlo también al `index.ts` del paquete.

## Reglas transversales del modelo (no negociables)

Documentadas a fondo en `modelo-datos-turnos.md` §3. Resumen para no pisarlas sin querer:

- **Tiempo:** patrón que se repite (horarios) → string `'HH:mm'` local. Instante único → `Date`
  UTC. Día de la semana siempre en `America/Argentina/Buenos_Aires` con Luxon, nunca
  `Date.getDay()` sobre UTC. Fechas ISO que viajan por API SIEMPRE con sufijo `Z`
  (`.toUTC().toISO()`) — `z.string().datetime()` rechaza offset local.
- **Plata:** enteros en centavos. Nunca un `Number` decimal en campos monetarios.
- **Borrado:** no existe, salvo un caso. `activo: false` es el default (servicios, usuarios).
  Única excepción: `excepciones` tiene DELETE físico porque ningún turno la referencia por
  snapshot (§15.10 explica por qué).
- **Snapshots:** el turno congela precio, duración y datos de la clienta al reservar. Editar el
  original (precio, horarios) nunca reescribe turnos viejos.
- **Transiciones de estado:** siempre con el estado esperado en el filtro del
  `findOneAndUpdate`, nunca un update ciego.
- **Nada calculable viaja desde el cliente:** precio, duración, `fin`, `finBloqueo` los deriva
  el server. Ver `shared/src/schemas/turno.schema.ts` — lo que falta ahí es a propósito.
- **Errores con forma fija:** `{ codigo, mensaje, detalle? }`. Nunca se filtra un error crudo
  de Mongo (ej. `E11000` siempre se mapea a un código propio como `409 NOMBRE_DUPLICADO`).

## Estado del proyecto

**Cerrado y testeado:** auth del panel (sesiones, argon2id), turnos (creación pública
transaccional + 5 transiciones de panel + listado/detalle), disponibilidad, validador de
horarios compartido, y el CRUD administrativo completo (servicios, configuración, usuarios +
superficie "lo mío", excepciones) bajo `/api/admin/*`.

**En construcción:** worker de notificaciones (infra de keep-alive con ping externo + ciclo de
envío, ver `modelo-datos-turnos.md` §7 y §11).

**Conteo de tests y detalle línea por línea de qué se cerró cuándo: siempre en
`modelo-datos-turnos.md` §14 y §17, no acá** — ese número cambia por tarea y este archivo no
se actualiza por tarea.

## Comandos

npm install # una vez, en la raíz
npm run dev # server (puerto 4000) + client (puerto 5173) en paralelo
npm run typecheck # tsc --noEmit en los tres paquetes
npx vitest run # suite completa (correr desde server/ o shared/ según qué se tocó)

El server arranca aunque falte `MONGODB_URI` (solo avisa por consola). Copiar
`server/.env.example` a `server/.env` para conectar de verdad. Tests corren contra
`MongoMemoryReplSet` (no standalone — las transacciones lo requieren, ver §11).