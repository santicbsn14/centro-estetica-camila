import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import './PanelLayout.css';

// Layout de panel (frontend.md §4.0/§4.4): sidebar role-aware + main. El
// contenido de cada pantalla llega por <Outlet/> — esto no sabe qué ruta
// está activa, sólo arma el chrome.
export function PanelLayout() {
  return (
    <div className="panel-layout">
      <Sidebar />
      <main className="panel-layout__main">
        <Outlet />
      </main>
    </div>
  );
}
