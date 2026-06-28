// Anmeldung aller Mini-Spiele. Server und Controller nutzen dieselbe Liste.
// Wichtig: relative Importpfade, damit Node (Server) und Browser sie gleich aufloesen.
import bordcomputer from "./bordcomputer.js";
import filterauswahl from "./filterauswahl.js";
import zahlensysteme from "./zahlensysteme.js";
import bauteiltausch from "./bauteiltausch.js";

export const registry = {
  [bordcomputer.id]: bordcomputer,
  [filterauswahl.id]: filterauswahl,
  [zahlensysteme.id]: zahlensysteme,
  [bauteiltausch.id]: bauteiltausch,
};
