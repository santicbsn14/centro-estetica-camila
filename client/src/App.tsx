import { Navigate, Route, Routes } from 'react-router-dom';
import { PanelLayout } from './layout/PanelLayout';
import { RequireSesion } from './routes/guards/RequireSesion';
import { RequireRol } from './routes/guards/RequireRol';
import { LoginPage } from './routes/login/LoginPage';
import { TurnosPage } from './routes/turnos/TurnosPage';
import { MiPerfilPage } from './routes/mi/MiPerfilPage';
import { ServiciosPage } from './routes/servicios/ServiciosPage';
import { ProfesionalesPage } from './routes/profesionales/ProfesionalesPage';
import { ConfiguracionPage } from './routes/configuracion/ConfiguracionPage';
import { ExcepcionesPage } from './routes/excepciones/ExcepcionesPage';

// Router del panel (frontend.md §4.0). /login vive fuera del guard de sesión;
// todo el resto cuelga de <RequireSesion/> + el layout con sidebar. Las
// secciones admin-only cuelgan además de <RequireRol roles={['admin']}/>
// (frontend.md §4.4: profesional nunca ve /servicios /profesionales
// /configuracion /excepciones, redirect silencioso a /turnos).
function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireSesion />}>
        <Route element={<PanelLayout />}>
          <Route index element={<Navigate to="/turnos" replace />} />
          <Route path="/turnos" element={<TurnosPage />} />
          <Route path="/mi" element={<MiPerfilPage />} />

          <Route element={<RequireRol roles={['admin']} />}>
            <Route path="/servicios" element={<ServiciosPage />} />
            <Route path="/profesionales" element={<ProfesionalesPage />} />
            <Route path="/configuracion" element={<ConfiguracionPage />} />
            <Route path="/excepciones" element={<ExcepcionesPage />} />
          </Route>
        </Route>
      </Route>
      

      <Route path="*" element={<Navigate to="/turnos" replace />} />
    </Routes>
  );
}

export default App;
