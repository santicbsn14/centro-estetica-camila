// Stub compartido por todas las pantallas todavía no construidas (frontend.md
// §4.1: orden de construcción). Sólo prueba que el router + guards + layout
// funcionan de punta a punta — la pantalla real reemplaza esto pantalla por
// pantalla, no hay lógica acá para heredar.
export function PantallaPendiente({ titulo }: { titulo: string }) {
  return (
    <div>
      <h1>{titulo}</h1>
      <p style={{ color: 'var(--color-tinta-48)' }}>Pantalla pendiente de construcción.</p>
    </div>
  );
}
