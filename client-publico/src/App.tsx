import { ReservaPage } from './routes/reserva/ReservaPage';

// Sin router (frontend.md §4.10/§4.11): el flujo de reserva v1 es una única
// pantalla con pasos internos (acordeón → grilla → bottom sheet → éxito),
// no rutas separadas — a diferencia del panel.
function App() {
  return <ReservaPage />;
}

export default App;
