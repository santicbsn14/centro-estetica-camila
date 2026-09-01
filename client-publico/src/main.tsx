import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';

// Sin AuthProvider ni ToastProvider (frontend.md §4.10): esta app es anónima,
// no hay sesión que bootstrapear ni interceptor 401 que escuchar — a
// diferencia de client/src/main.tsx (panel).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
