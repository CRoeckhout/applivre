// Détenteur simple de l'ID utilisateur courant pour permettre aux stores
// d'appeler la sync sans avoir à passer la session partout.
// Mis à jour par AuthGate à chaque changement de session.

let currentUserId: string | null = null;

export function setSyncUserId(id: string | null): void {
  currentUserId = id;
}

export function getSyncUserId(): string | null {
  return currentUserId;
}
