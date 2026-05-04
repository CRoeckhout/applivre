// Enregistrement des "kinds" de Grimolia auprès du package @grimolia/social.
// Le package social ne sait pas ce qu'est un livre, une fiche ou un bingo : il
// délègue la résolution et le rendu via ce registry. Tout ajout d'un nouvel
// objet socialement adressable (réactions, commentaires, feed…) passe par ici.
//
// Pour l'instant, le scaffolding du package n'expose que les follows (qui ne
// dépendent d'aucun kind), donc ce fichier est volontairement vide. À chaque
// fois qu'on étendra le package (réactions, commentaires, feed), on viendra
// ajouter ici les `registerKind('book', …)`, `registerKind('sheet', …)` etc.
//
// Importé une fois au boot (cf. app/_layout.tsx) pour que les side-effects
// d'enregistrement soient en place avant le premier rendu.

export {};
