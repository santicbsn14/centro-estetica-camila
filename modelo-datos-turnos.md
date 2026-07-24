# Sistema de Turnos — Camila González Belleza

## Modelo de datos y decisiones

**Estado:** modelo cerrado. Base para el chat de arquitectura.
**Fuente de verdad del alcance:** `propuesta_camiGonzalez_Belleza.docx` (aprobada por la clienta).

---

## 1. Contexto

Sistema de gestión de turnos para un centro de estética. Las clientas solicitan turno desde la web sin registrarse; el centro aprueba o rechaza desde un panel; el sistema notifica automáticamente por WhatsApp y mail en cada paso.

**Stack**

| Capa | Tecnología |
|---|---|
| Frontend | React + TypeScript + Vite (hosting a definir) |
| Backend | Node.js + Express + TypeScript, en Render |
| Base de datos | MongoDB Atlas (requiere replica set por transacciones) |
| WhatsApp | Twilio → WhatsApp Business Platform |
| Mail | proveedor con tier gratuito |

**Prioridad número uno:** la mensajería automática. Es lo que se vendió y el único componente con riesgo externo (aprobación de plantillas por Meta).

**Duración estimada:** 4 a 5 semanas.

---

## 2. Cómo funciona, de punta a punta

La clienta elige un servicio y ve las profesionales que lo prestan. Elige una, y el sistema le muestra los horarios libres: el horario del centro, recortado por el de la profesional, recortado por el del servicio, menos feriados y bloqueos, menos los turnos ya tomados con su buffer de limpieza. Deja nombre y teléfono — el mail si quiere — y confirma. Sin registro, sin contraseña.

El turno nace **pendiente** y ocupa el horario de inmediato. Le llega un WhatsApp de "recibimos tu solicitud" con un link personal, y arranca un reloj. Si nadie responde antes del vencimiento, el turno se rechaza solo y libera el horario.

En el panel, la admin o la profesional aprueban o rechazan con un clic. Al aprobar sale el WhatsApp con los detalles y queda programado el recordatorio de 24 horas antes. Al rechazar, sale el aviso correspondiente.

La clienta puede cancelar desde su link hasta 24 horas antes; pasado ese punto el link le muestra el teléfono del centro. Cancele quien cancele, sale la notificación y el horario vuelve a estar disponible al instante.

Cada mensaje se guarda como registro propio antes de salir. Un worker los toma, los manda, reintenta si falla y anota el resultado. **Nada se envía dentro del endpoint que crea el turno**, así que una caída de Twilio no rompe una reserva ni pierde un mensaje en silencio.

Pasada la hora, el turno se marca completado solo.

---

## 3. Reglas transversales

Aplican a todo el modelo, sin excepción.

**Tiempo.** Regla que se repite → string `'HH:mm'` en hora local. Instante único → `Date` en UTC. El día de la semana se calcula siempre en `America/Argentina/Buenos_Aires`, nunca con el `getDay()` de un `Date` UTC (un turno de las 22:00 del miércoles es jueves en UTC).

**Plata.** Enteros en centavos. Ningún `Number` decimal en campos monetarios.

**Borrado.** No existe. `activo: false` en servicios, usuarios y clientes. Los turnos referencian documentos que tienen que seguir existiendo.

**Snapshots.** El turno congela precio, duración y datos de la clienta al momento de reservar. Un cambio de precio no reescribe turnos viejos.

**Timestamps.** `creadoEn` y `actualizadoEn` en todas las colecciones.

**Transiciones de estado.** Siempre con el estado esperado en el filtro del `findOneAndUpdate`. Nunca un update ciego.

**Nada calculable viaja desde el cliente.** El body manda qué servicio y a qué hora. Precio, duración, `fin` y `finBloqueo` los deriva el server leyendo la base.

**Errores con forma fija.** `{ codigo, mensaje, detalle? }`. El front mapea por `codigo`, nunca por el texto.

---

## 4. Colecciones

Ocho en total. El sub-esquema de horarios se comparte entre tres de ellas.

### Sub-esquema de horarios

Compartido por `configuracion`, `usuarios` y `servicios`. Una sola forma, una sola función de intersección.

```ts
horarios: [{
  dia: 0,                    // 0 = domingo (convención de Date.getDay)
  bloques: [
    { desde: '09:00', hasta: '13:00' },
    { desde: '15:00', hasta: '20:00' }
  ]
}]
```

El array de bloques resuelve el corte del mediodía sin campos extra. Validaciones: los bloques de un mismo día no se solapan y van ordenados; `hasta > desde` siempre. **Sin cruce de medianoche** — limitación conocida y aceptada.

### configuracion

Documento único.

```ts
{
  _id: 'centro',
  nombre: string,
  timezone: 'America/Argentina/Buenos_Aires',

  horarios: [...],                 // techo duro del centro

  pasoGrillaMin: 30,
  antelacionMinimaHoras: 3,        // ver nota
  ventanaMaximaDias: 60,
  cancelacionMinimaHoras: 24,
  vencimientoPendienteHoras: 12,

  contacto: { telefonoE164, email, direccion }
}
```

`antelacionMinimaHoras` hace doble función: evita reservas sobre la hora **y** garantiza que quede tiempo de confirmar antes del vencimiento. Por eso 3 y no 2.

### servicios

```ts
{
  nombre: string,
  descripcion?: string,
  duracionMin: number,
  bufferPostMin: number,           // limpieza; ocupa agenda, no se cobra
  precio: number,                  // centavos, entero
  mostrarPrecio: boolean,
  horarios: [...] | null,          // null = hereda de la profesional
  orden: number,
  activo: boolean
}
```

`horarios: null` significa "sin restricción propia". **El array vacío está prohibido** por validación: significaría "nunca disponible" y se escribe casi igual que `null`. O es `null`, o tiene al menos un día con al menos un bloque.

### usuarios

```ts
{
  nombre, email, passwordHash,
  rol: 'admin' | 'profesional',
  atiende: boolean,                // aparece en el selector público
  servicios: ObjectId[],
  horarios: [...],
  telefonoE164?,                   // aviso de turno nuevo
  activo: boolean
}
```

`atiende` separado de `rol` permite que la dueña administre y atienda con un solo usuario, sin dos agendas para la misma persona.

### excepciones

```ts
{
  profesionalId: ObjectId | null,  // null = todo el centro
  desde: Date,                     // UTC
  hasta: Date,                     // UTC
  tipo: 'feriado' | 'vacaciones' | 'bloqueo',
  motivo?: string,
  creadoPor: ObjectId
}
```

Sin campo `alcance`: `profesionalId: null` ya lo dice, y una sola fuente de verdad.

Sin campo `todoElDia`: el panel arma el rango 00:00–23:59 local antes de mandarlo.

Sin recurrencia: los feriados se cargan uno por uno. Son ~15 al año. Dejarlos precargados es un buen detalle de entrega.

**Las excepciones sólo restan, nunca abren horario.** Eso mantiene el algoritmo monótono: cada capa recorta, y la disponibilidad nunca puede superar el horario del centro.

### clientes

```ts
{
  telefonoE164: string,            // índice único — es la identidad
  telefonoCrudo: string,           // lo que tipeó, para auditar
  nombre: string,
  email?: string,
  notas?: string,                  // interno, sólo admin
  optOut: boolean,
  creadoEn, actualizadoEn
}
```

Sin contadores ni fechas derivadas: salen de una agregación sobre `turnos` el día que hagan falta.

`notas` es el campo más sensible del sistema (alergias, cuestiones de piel). **No se expone en ningún endpoint público ni aparece nunca en el cuerpo de un mensaje.**

`optOut` frena recordatorios. Confirmación y cancelación son transaccionales y siguen saliendo.

Un mismo teléfono puede ser dos personas (madre e hija es habitual en el rubro). Lo resuelve el `clienteSnapshot` del turno, que guarda el nombre cargado en esa reserva. No se intenta separar identidades más allá de eso.

### turnos

```ts
{
  codigo: 'TRN-4821',              // legible, para hablar por teléfono

  clienteId: ObjectId,
  clienteSnapshot: { nombre, telefonoE164, email },
  profesionalId: ObjectId,
  profesionalNombre: string,

  servicio: {                      // snapshot, uno solo por turno
    servicioId, nombre, duracionMin, bufferPostMin, precio
  },

  inicio: Date,                    // UTC
  fin: Date,                       // inicio + duracionMin
  finBloqueo: Date,                // fin + bufferPostMin

  estado: 'pendiente' | 'confirmado' | 'rechazado'
        | 'cancelado' | 'completado' | 'ausente',
  expiraEn: Date,                  // sólo mientras está pendiente
  historial: [{ estado, fecha, porTipo: 'cliente'|'usuario'|'sistema', porId?, motivo? }],

  origen: 'web' | 'admin',
  fueraDeHorario: boolean,         // el admin pisó la política
  tokenHash: string,               // se guarda el hash, no el token

  creadoEn, actualizadoEn
}
```

`finBloqueo` guardado convierte la detección de solape en una comparación de rangos:

```
hay conflicto si  inicio < otro.finBloqueo  &&  finBloqueo > otro.inicio
```

`expiraEn` guardado (no calculado) permite que el worker lo busque por índice y que el panel muestre "vence en 3hs" con la lista ordenada por urgencia:

```ts
expiraEn = min(
  creadoEn + vencimientoPendienteHoras,
  inicio - antelacionMinimaHoras
)
```

El tope por `inicio` evita que un turno de mañana temprano venza después de haber ocurrido.

`tokenHash`: el link del WhatsApp lleva el valor crudo, la base guarda sólo el hash. Un dump filtrado no permite cancelar turnos ajenos.

### notificaciones

```ts
{
  turnoId: ObjectId,
  tipo: 'solicitud' | 'confirmacion' | 'recordatorio_24h'
      | 'cancelacion' | 'rechazo' | 'autorespuesta',
  canal: 'whatsapp' | 'email',
  destino: string,                 // E164 o email, snapshot

  programadaPara: Date,            // UTC
  estado: 'pendiente' | 'enviando' | 'enviada' | 'fallida' | 'cancelada',
  intentos: number,
  proximoIntento: Date,

  proveedorSid?: string,
  proveedorEstado?: string,        // queued / sent / delivered / read / failed
  payloadEnviado?: object,
  error?: { codigo, mensaje },

  creadaEn, enviadaEn?
}
```

### plantillas

Separada a propósito de `notificaciones.tipo`. El nombre de la plantilla es un identificador externo que no controlamos: Meta puede rechazar una y hay que reenviarla con otro nombre. Con el mapeo aparte, eso se resuelve editando un documento y no tocando código.

```ts
{
  tipo: '...',
  canal: 'whatsapp' | 'email',

  metaNombre: 'turno_confirmado_v2',
  metaIdioma: 'es_AR',
  metaEstado: 'aprobada' | 'pendiente' | 'rechazada',
  variables: ['nombre', 'servicio', 'fecha', 'hora', 'profesional'],

  asunto?: string,                 // canal email
  cuerpoHtml?: string,

  activa: boolean
}
```

> **Las variables de Meta son posicionales.** En la plantilla son `{{1}}`, `{{2}}`, `{{3}}` — no tienen nombre. El orden de `variables` **es** el significado. Reordenarlo hace que las clientas reciban el servicio donde va la hora. Va con un test que compare contra el orden esperado.

---

## 5. Disponibilidad

Intersección de tres capas, menos dos restas:

```
horario del centro
  ∩ horario de la profesional
  ∩ horario del servicio (si tiene)
  − excepciones (centro + profesional)
  − turnos activos + bufferPostMin
```

Todo el cálculo en el server, nunca en el cliente.

**Caso borde a cubrir en el panel:** si el horario de la profesional y el del servicio no se cruzan (ella trabaja martes y jueves, el servicio es miércoles y viernes), la intersección es vacía y la web no ofrece ni un turno. No es un bug, es configuración mal cargada — pero necesita una advertencia visible en la pantalla de configuración o va a parecer que el sistema está roto.

**Carrera al reservar.** La disponibilidad que ve la clienta es una foto de hace segundos. El `POST /api/turnos` revalida el solape dentro de una transacción y devuelve `409 SLOT_OCUPADO` con los slots actualizados.

---

## 6. Estados del turno

```
pendiente ──> confirmado ──> completado
    │              │
    │              ├──> cancelado
    │              └──> ausente
    ├──> rechazado
    └──> cancelado
```

| Transición | Quién |
|---|---|
| pendiente → confirmado | admin, profesional |
| pendiente → rechazado | admin, profesional, **sistema** (vencimiento) |
| pendiente → cancelado | clienta (sin límite de horas), admin |
| confirmado → cancelado | clienta (hasta 24hs antes), admin, profesional |
| confirmado → completado | sistema, por hora |
| confirmado → ausente | admin, profesional (manual) |

**Desde `pendiente` la clienta cancela sin límite de horas.** Todavía no le confirmaron nada; retirar una solicitud es libre. Las 24hs aplican sólo sobre lo confirmado.

**`completado` es automático.** Si dependiera de que alguien lo marque después de cada turno, no pasaría nunca. Un turno confirmado cuya hora pasó y nadie canceló, se completa solo. `ausente` queda como marca manual opcional.

**Rechazo manual y vencimiento comparten estado pero no actor.** `porTipo: 'sistema'` en el historial los distingue, y eso decide qué mensaje sale. El texto es distinto: "no pudimos confirmar tu turno, escribinos" no es un rechazo explícito.

**Un `pendiente` bloquea el horario.** Nadie recibe un rechazo por "ya lo tomaron". El vencimiento automático evita que un horario quede muerto si el panel no responde.

### Reglas de política vs. conflictos reales

La distinción es por tipo de regla, no por rol:

- **Políticas** (horarios de las tres capas, antelación mínima): el admin las puede pisar con confirmación explícita. Queda marcado en `fueraDeHorario`.
- **Conflictos reales** (solape con otro turno): **nadie** los pisa, ni el admin. Dos personas no pueden estar en la misma silla a la misma hora.

Así, `origen: 'web'` valida las cinco capas y `origen: 'admin'` valida sólo el solape. El turno excepcional entra al sistema igual, marcado — y sobre todo entra, con lo cual ese horario deja de ofrecerse a la próxima clienta.

---

## 7. Worker de notificaciones

**Tomar el trabajo, no leerlo.** `findOneAndUpdate` de `pendiente` → `enviando`, y recién ahí envía. Si dos ciclos se solapan — y con Render despertándose se van a solapar — el segundo no encuentra nada que tomar. Sin esto: dos WhatsApp a la misma clienta.

**Recuperar lo que quedó tomado.** Si el proceso muere entre el claim y el envío, ese documento queda en `enviando` para siempre. Al arrancar cada ciclo, todo lo que lleve más de 5 minutos en `enviando` vuelve a `pendiente`.

**Revalidar el turno antes de mandar.** El recordatorio se crea al confirmar y sale 24 horas después; en el medio el turno puede haberse cancelado. Doble defensa: al cambiar de estado, las notificaciones pendientes del turno pasan a `cancelada`; y aun así el worker relee el turno antes de enviar.

**Reintentos** con backoff 1, 5, 15, 60 minutos. A los 4 fallos → `fallida` y visible en el panel. Una notificación que falló en silencio es peor que ninguna, porque todos asumen que salió.

**Recordatorio:** si al confirmar faltan menos de 24 horas, la notificación de recordatorio no se crea. No se crea vencida ni se manda al instante — no existe.

---

## 8. WhatsApp / Meta

**Los cinco mensajes del sistema son plantillas aprobadas, sin excepción.** WhatsApp sólo permite texto libre dentro de las 24 horas posteriores al último mensaje *de la clienta*. Como todos los mensajes del sistema los inicia el centro, ninguno puede ser texto libre. Sin plantillas aprobadas no hay mensajería, y sin mensajería no hay entrega: es un bloqueante duro, no un trámite paralelo.

**Número nuevo y dedicado.** Un número de teléfono es una sola cuenta de WhatsApp: registrarlo en la API lo desloguea de la app, igual que instalar WhatsApp en un celular nuevo. Y el historial de chats vive cifrado en el dispositivo, así que no se migra — no hay dónde ponerlo.

Migrar el número que la clienta usa a diario metería su herramienta de trabajo dentro del único riesgo que no controlamos. Con número nuevo, si el trámite se traba ella sigue trabajando igual y sólo se demora la automatización.

El perfil de WhatsApp Business del número nuevo va con nombre, foto y dirección del centro. Eso cumple el espíritu de la propuesta, que buscaba evitar un número de pool anónimo.

**Autorespuesta a entrantes.** Cuando alguien escribe al número automático se abre la ventana de 24 horas, así que se puede responder con texto libre sin plantilla: "este número es sólo para avisos de turnos, escribinos al ...". Regla de no repetir dentro de la misma ventana.

**Coexistencia = fase 2.** Permite usar app y API sobre el mismo número, y Argentina está entre los países soportados. Dos condiciones a verificar antes de contar con ella: que Twilio la soporte, y que alguien abra la app al menos cada 14 días para mantener la conexión viva — una dependencia de comportamiento humano en la función crítica del sistema. Mejor migrar cuando todo esté andando y estable.

---

## 9. Índices

```ts
// servicios
{ activo: 1, orden: 1 }                          // catálogo público
{ nombre: 1 } unique                             // collation strength 2

// usuarios
{ email: 1 } unique
{ activo: 1, atiende: 1, servicios: 1 }          // "quiénes prestan este servicio"

// excepciones
{ profesionalId: 1, hasta: 1, desde: 1 }         // consultar con $in: [null, id]

// clientes
{ telefonoE164: 1 } unique                       // la identidad

// turnos
{ profesionalId: 1, estado: 1, inicio: 1 }       // disponibilidad
{ estado: 1, expiraEn: 1 }                       // worker de vencimiento
{ estado: 1, inicio: 1 }                         // panel
{ tokenHash: 1 } unique sparse
{ codigo: 1 } unique
{ clienteId: 1, inicio: -1 }                     // historial

// notificaciones
{ turnoId: 1, tipo: 1, canal: 1 } unique         // idempotencia
{ estado: 1, programadaPara: 1 }                 // worker de envío
{ proveedorSid: 1 } sparse                       // webhook de Twilio

// plantillas
{ tipo: 1, canal: 1 } unique partial (activa: true)
```

**Orden de campos: igualdad, orden, rango.** En el índice de disponibilidad, `profesionalId` y `estado` son igualdad y van primero; `inicio` es rango y va último. Al revés, Mongo escanea de más en la consulta más frecuente del sistema.

El índice único de `notificaciones` es la idempotencia: si el worker corre dos veces o Render reinicia a mitad de ciclo, el insert duplicado falla y nadie recibe dos mensajes.

---

## 10. Validaciones en tres capas

**Base de datos** — los índices únicos. Es lo único que sobrevive a la concurrencia. Todo "consulto si existe y después inserto" tiene una ventana en el medio.

**Esquema — Zod compartido entre front y back.** Se define una vez, el tipo sale con `z.infer`, y se usa para validar el body en Express y el formulario en React. Con Vite se resuelve con workspace de npm o carpeta `shared/` con path alias.

```ts
export const crearTurnoSchema = z.object({
  servicioId: z.string(),
  profesionalId: z.string(),
  inicio: z.string().datetime(),      // ISO UTC
  nombre: z.string().min(2).max(80),
  telefono: z.string().min(6),        // crudo, se normaliza en el server
  email: z.string().email().optional()
});
```

Lo que **no** está ahí es lo importante: `precio`, `duracionMin`, `fin`, `finBloqueo`. Si se acepta `precio` del body, alguien reserva a $1 con curl. Si se acepta `fin`, mete un turno de 5 minutos donde van 90.

**Negocio — en la capa de servicio.** Solape, transiciones, intersección de horarios, ventana de cancelación. Nada de esto entra en un esquema ni puede vivir en el controller si se quiere testear.

### Normalización de teléfono

`libphonenumber-js` con `'AR'` por defecto, en el server, antes del `findOneAndUpdate` con `upsert`. Verificar el formato exacto que espera Twilio para WhatsApp en Argentina: los móviles necesitan el 9 después del +54 y es clásico que la normalización se lo coma.

Test obligatorio: las cuatro formas terminan en el mismo E.164.

```
3364123456
15 4123456
+54 9 336 4123456
03364 15-4123456
```

El upsert tiene carrera: dos reservas simultáneas del mismo teléfono pueden crear dos documentos. El índice único es lo que salva — capturar el error de clave duplicada y reintentar la lectura.

### Seguridad de la superficie pública

El `tokenGestion` es la única puerta pública con permiso de escritura. Alcance a un solo turno, sin lectura de nada más, vencimiento al terminar el turno, sólo permite cancelar. **Rate limit por IP desde el día uno.**

---

## 11. Infraestructura

**MongoDB Atlas, no Mongo en Render.** Las transacciones requieren replica set; Atlas lo da hasta en el tier gratuito. Un Mongo como servicio en Render falla en runtime recién al abrir la primera transacción, que es tarde para enterarse. El tier gratuito comparte CPU: medir la consulta de disponibilidad antes de asumir que alcanza.

**El plan gratuito de Render duerme la instancia**, y eso rompe el worker de recordatorios — la función crítica del proyecto. Opciones: Render Cron Job, trigger externo contra un endpoint protegido, o BullMQ con Redis. Decisión pendiente, tiene impacto en el presupuesto acordado.

**Cuentas a nombre de la clienta desde el día uno:** dominio, Render, proveedor de mail, Twilio y sobre todo el Meta Business Manager. La propuesta dice "el sistema es tuyo"; migrar después un número de WhatsApp verificado de una cuenta a otra es lento y molesto. Si nace bien, no se hace nunca.

---

## 12. Alcance: qué entra y qué no

**Entra**

- Un servicio por turno
- Clientas sin registro
- Precios visibles en la web
- La clienta cancela sola hasta 24hs antes
- WhatsApp obligatorio, mail opcional
- Tres capas de horario + excepciones
- Cinco plantillas de mensaje

**No entra en esta versión**

| Fuera de alcance | Por qué |
|---|---|
| Reportes y analítica | Decisión de la clienta. El modelo los soporta sin migración: los snapshots y `ausente` separado de `cancelado` ya están. |
| Reprogramar desde el link | Implica recorrer todo el cálculo de disponibilidad desde la superficie pública. Lo hace el centro por WhatsApp. |
| Múltiples servicios por turno | No se habló con la clienta. Agregarlo después toca el algoritmo de disponibilidad entero. |
| Bandeja de mensajes entrantes | Es otro proyecto. Se cubre con autorespuesta. |
| Coexistencia de WhatsApp | Fase 2, con el sistema ya estable. |
| Seña con Mercado Pago | Candidato natural a segunda etapa. |

---

## 13. Pendientes

### Verificar antes de codear

- [ ] Si Twilio soporta coexistencia — define si la fase 2 es viable
- [ ] Normalización E.164 con el 9 argentino contra lo que espera Twilio
- [ ] Tarifario actual de Meta contra los USD 3–8/mes de la propuesta: son hasta 5 mensajes por turno y el volumen real puede quedar arriba de esa franja

### Definir con la clienta

Ordenados por urgencia. El primero es camino crítico.

1. **Número nuevo, Meta Business Manager a su nombre, cinco plantillas a aprobación.** Cuanto antes arranque, mejor: el tiempo de revisión no depende de nosotros.
2. **Son cinco mensajes, no cuatro.** El de rechazo/vencimiento no estaba en la propuesta. Falta definir qué dice, y si el precio va en el mensaje de confirmación.
3. **El mail va opcional.** Desvío chico pero real respecto del documento aprobado. Que quede consensuado por escrito.
4. **Hosting.** El plan gratuito de Render choca con el recordatorio de 24hs. Mejor plantearlo ahora que el día que un recordatorio no salga.
5. **Los $20.000.** La propuesta aprobada dice $700.000 en el texto y la tabla de cuotas suma $680.000. Resolverlo por escrito antes del segundo pago.
6. **Responsabilidad sobre los pendientes.** El vencimiento automático rechaza turnos si nadie responde. Conviene que lo sepa antes de que pase.

### Riesgos abiertos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Demora de Meta en aprobar plantillas | Bloquea la entrega | Arrancar el trámite ya. El canal mail queda funcional de punta a punta para entregar con mail solo si hace falta. |
| Render gratuito duerme la instancia | Rompe los recordatorios | Decidir infra del worker antes de la semana 3 |
| Costo real de Twilio sobre lo estimado | Número propio en documento aprobado | Revalidar contra tarifario antes de los primeros envíos |

---

## 14. Próximo chat: arquitectura

- Algoritmo de disponibilidad con las tres capas, excepciones y grilla
- Diseño de endpoints (público, panel, webhooks)
- Infra del worker y decisión sobre Render
- Autenticación y sesiones del panel
- Estructura de carpetas y organización del monorepo
