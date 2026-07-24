import { crearTurnoSchema } from '@shared/schemas/turno.schema';

const camposTurno = Object.keys(crearTurnoSchema.shape);

function App() {
  return (
    <main style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
      <h1>Camila González Belleza</h1>
      <p>Sistema de turnos — en construcción.</p>
      <p style={{ fontSize: '0.8rem', color: '#888' }}>
        Alias @shared activo ({camposTurno.length} campos en crearTurnoSchema)
      </p>
    </main>
  );
}

export default App;
