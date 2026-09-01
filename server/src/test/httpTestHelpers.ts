import request from 'supertest';
import { HEADER_CSRF, VALOR_CSRF } from '../middleware/auth';

// Header CSRF liviano (§16, revisión "Dominios separados") — mismo nombre y
// valor que exige requireAuth en todo request mutante autenticado (ver
// middleware/auth.ts). Los archivos de test que loguean un agente y después
// mandan POST/PATCH/DELETE contra rutas autenticadas necesitan mandarlo en
// cada uno; en vez de repetir `.set(HEADER_CSRF, VALOR_CSRF)` a mano en cada
// request, `conCsrf` envuelve el agente una sola vez, en el mismo punto
// donde ya se logueaba (`loguearAgente` de cada archivo).

type SuperAgentTest = ReturnType<typeof request.agent>;
type MetodoMutante = 'post' | 'patch' | 'delete';
type FnMutante = (url: string) => request.Test;

const METODOS_MUTANTES: MetodoMutante[] = ['post', 'patch', 'delete'];

export function conCsrf<T extends SuperAgentTest>(agente: T): T {
  for (const metodo of METODOS_MUTANTES) {
    const original = (agente[metodo] as FnMutante).bind(agente);
    (agente[metodo] as FnMutante) = (url: string) => original(url).set(HEADER_CSRF, VALOR_CSRF);
  }
  return agente;
}
