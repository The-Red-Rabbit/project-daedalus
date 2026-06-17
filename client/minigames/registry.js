// Anmeldung aller Mini-Spiele. Server und Controller nutzen dieselbe Liste.
// Wichtig: relative Importpfade, damit Node (Server) und Browser sie gleich aufloesen.
import bordcomputer from "./bordcomputer.js";

export const registry = {
  [bordcomputer.id]: bordcomputer,
  // Weiteres Mini-Spiel hier importieren und eintragen, z. B.:
  // [tiefpassfilter.id]: tiefpassfilter,
};
