// Anmeldung aller Mini-Spiele. Server und Controller nutzen dieselbe Liste.
// Wichtig: relative Importpfade, damit Node (Server) und Browser sie gleich aufloesen.
import bordcomputer from "./bordcomputer.js";
import tiefpassfilter from "./tiefpassfilter.js";
import zahlensysteme from "./zahlensysteme.js";

export const registry = {
  [bordcomputer.id]: bordcomputer,
  [tiefpassfilter.id]: tiefpassfilter,
  [zahlensysteme.id]: zahlensysteme,
};
