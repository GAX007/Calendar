// The gym routines of one user in Supabase (supabase/migration_fase11_rutinas_gym.sql), for the MCP connector
// (src/asistente/mcpGym.ts). Service key, always filtered by user. The owner's account starts with the routines
// of src/data/initialGymRoutines.ts, like the web and the iOS app.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GymRoutine } from '../../types';
import type { RutinasStore } from '../mcpGym';
import { INITIAL_GYM_ROUTINES } from '../../data/initialGymRoutines';
import { comprobar, esCalendarioPropietario } from './supabase';

interface Fila { id: string; orden: number; datos: GymRoutine }

const sinProgreso = (r: GymRoutine): GymRoutine => ({
  ...r,
  exercises: r.exercises.map(({ completedSets: _hechas, ...e }) => e),
});

export function storeRutinas(sb: SupabaseClient, userId: string): RutinasStore {
  const tabla = () => sb.from('rutinas_gym');

  const filas = async (): Promise<Fila[]> =>
    (comprobar(await tabla().select('id, orden, datos').eq('user_id', userId).order('orden').order('id'), 'rutinas_gym') || []) as Fila[];

  const escribir = async (lista: GymRoutine[]) => {
    if (!lista.length) return;
    const ahora = new Date().toISOString();
    comprobar(await tabla().upsert(lista.map((r, orden) => ({ user_id: userId, id: r.id, orden, datos: sinProgreso(r), actualizado_en: ahora })),
      { onConflict: 'user_id,id' }), 'rutinas_gym');
  };

  // First use by the owner: their current routines become the starting point
  const sembrar = async (): Promise<boolean> => {
    const { data } = await sb.auth.admin.getUserById(userId);
    if (!esCalendarioPropietario({ id: userId, email: data?.user?.email })) return false;
    await escribir(INITIAL_GYM_ROUTINES);
    return true;
  };

  const listar = async (): Promise<GymRoutine[]> => {
    let actuales = await filas();
    if (!actuales.length && await sembrar()) actuales = await filas();
    return actuales.map(f => f.datos);
  };

  return {
    listar,
    async guardar(rutina, posicion) {
      const lista = await listar();
      const antes = lista.findIndex(r => r.id === rutina.id);
      const resto = lista.filter(r => r.id !== rutina.id);
      const sitio = posicion ?? (antes >= 0 ? antes : resto.length);
      resto.splice(Math.min(Math.max(0, sitio), resto.length), 0, rutina);
      await escribir(resto);
    },
    async borrar(id) {
      const lista = await listar();
      if (!lista.some(r => r.id === id)) return false;
      comprobar(await tabla().delete().eq('user_id', userId).eq('id', id), 'rutinas_gym');
      await escribir(lista.filter(r => r.id !== id));
      return true;
    },
    async reemplazar(rutinas) {
      const anteriores = await filas();
      // Write the new plan first, then remove what is no longer in it: a failure never leaves the user without routines
      await escribir(rutinas);
      const quedan = new Set(rutinas.map(r => r.id));
      const sobran = anteriores.map(f => f.id).filter(id => !quedan.has(id));
      if (sobran.length) comprobar(await tabla().delete().eq('user_id', userId).in('id', sobran), 'rutinas_gym');
    },
  };
}
