// Cuenta activa en este navegador. Todo lo que se guarda en localStorage va
// ligado a ella para que otra cuenta, o el modo invitado, no vea nada ajeno.
export const OWNER_EMAIL = 'xaviervarteniuc@gmail.com';

let actual: { userId?: string; email: string } = { email: '' };

export function isOwnerEmail(email?: string | null): boolean {
  return (email || '').toLowerCase().trim() === OWNER_EMAIL;
}

// App la llama en cada render, antes que cualquier módulo lea su almacenamiento.
export function setCuentaActual(userId?: string, email?: string | null): void {
  actual = { userId: userId || undefined, email: (email || '').toLowerCase().trim() };
}

export function cuentaActual(): { userId?: string; email: string } {
  return actual;
}

export function esCuentaPropietaria(): boolean {
  return Boolean(actual.userId) && isOwnerEmail(actual.email);
}

// Clave de localStorage de la cuenta activa (o del invitado)
export function claveDeCuenta(base: string, userId = actual.userId): string {
  return `${base}_${userId || 'guest'}`;
}
