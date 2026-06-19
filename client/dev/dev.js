// Mini-Spiel-Teststand (Debug): listet jede Station mit Stufen-Knoepfen. Ein Klick
// oeffnet den Controller, der sich ueber die Query-Parameter direkt auf die Station
// setzt (siehe controller.js, Debug-Pfad). Die Stationsliste kommt aus dem geteilten
// Protokoll, damit hier nichts doppelt gepflegt wird. Die Seite selbst existiert nur,
// wenn der Server mit DAEDALUS_DEBUG laeuft (sonst liefert /dev einen 404).
import { STATIONS } from "/shared/protocol.js";

const LEVELS = [1, 2, 3];
const root = document.getElementById("stations");

for (const st of STATIONS) {
  const card = document.createElement("div");
  card.className = "station";

  const meta = document.createElement("div");
  meta.className = "meta";
  const sub = st.coop
    ? `${st.minigame} · <span class="coop">Koop · +Bot-Partner</span>`
    : st.minigame;
  meta.innerHTML = `<div class="name">${st.name}</div><div class="sub">${sub}</div>`;
  card.appendChild(meta);

  const levels = document.createElement("div");
  levels.className = "levels";
  const label = document.createElement("span");
  label.className = "lvl-label";
  label.textContent = "Stufe";
  levels.appendChild(label);
  for (const lvl of LEVELS) {
    const a = document.createElement("a");
    a.className = "lvl";
    a.textContent = String(lvl);
    a.href = `/controller?station=${encodeURIComponent(st.id)}&level=${lvl}`;
    a.target = "_blank";
    a.rel = "noopener";
    a.title = `${st.name} auf Stufe ${lvl} testen`;
    levels.appendChild(a);
  }
  card.appendChild(levels);
  root.appendChild(card);
}
