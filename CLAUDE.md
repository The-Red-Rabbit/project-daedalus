# Daedalus

Daedalus ist zugleich der Name des Spiels und des Raumschiffs. Es ist ein kooperatives digitales Lernspiel für das Fach Medientechnik (Einführungsphase) und dient der Ergebnissicherung. Eine Klasse navigiert gemeinsam die Daedalus durch ein Asteroidenfeld und löst dabei Mini-Spiele, die Unterrichtsinhalte abbilden. Laptop und Beamer sind der Host, die Smartphones der Lernenden werden über einen QR-Code zu Steuerungsstationen.

Diese Datei ist die Arbeitsgrundlage für Claude Code. Sie beschreibt Architektur, Konventionen und die nächsten Schritte. Inhaltliche und gestalterische Details stehen in `docs/GAME_DESIGN.md` und `docs/VISUAL_DESIGN.md`. Beide sind verbindlich.

## Leitprinzipien für den Code

- Benutze AskUserQuestion so viel wie möglich, um dem User Designentscheidungen zu ermöglichen.
- Modular und einfach. Ein Modul erledigt eine Sache. Lieber mehrere kleine Dateien als eine große.
- Server-autoritativ. Der Server hält den Spielzustand, die Clients senden nur Eingaben und rendern.
- Prozedural mit Slots. Grafik entsteht aus Code und CSS, Ton aus der Web Audio API. Für spätere echte Sprites und Sounddateien gibt es benannte Slots unter `assets/`.
- Zufall für Wiederspielwert. Jedes Mini-Spiel erzeugt seine Aufgaben aus einem Seed. Gleicher Seed ergibt dieselbe Aufgabe, deshalb kann der Server eine Lösung nachrechnen.
- Kein Build-Schritt. Der Browser lädt native ES-Module, der Node-Server liefert sie aus. Das hält den Einstieg niedrig.

## Tech-Stack

- Laufzeit: Node.js (ab Version 20).
- Server: HTTP plus WebSocket über `ws`. QR-Code über `qrcode`.
- Client: reines JavaScript mit ES-Modulen, keine Frameworks.
- Host-Szene: Canvas 2D. Controller-Oberfläche: HTML und CSS.
- Ton: Web Audio API, gekapselt in einer kleinen Audio-Engine.

## Projektstruktur

```
project-daedalus/
  CLAUDE.md                 diese Datei
  README.md                 Kurzanleitung und Einsatz im Unterricht
  package.json
  server/
    index.js                HTTP + WebSocket, statische Auslieferung, /qr, Rollenvergabe, Tick-Verteilung
    game.js                 autoritativer Zustand: Teilnehmer und Rollen, Rotation, Kopplung, Sektoren, Spielende
    bots.js                 simulierte Spieler fuers Solo-Testen (nur mit DAEDALUS_DEBUG, nur vom Leitstand)
  shared/
    protocol.js             Nachrichtentypen, STATUS und STATIONS (Server und Client teilen sie)
    rng.js                  deterministischer Zufall aus Seed (mulberry32)
  client/
    net.js                  WebSocket-Hilfe mit automatischem Wiederverbinden (alle Clients)
    audio.js                Audio-Engine, Cue-Katalog, geschichtete Kulisse und Alarmbett
    host/
      index.html            Starter: Auswahlseite, verlinkt Brücke und Leitstand
    beamer/
      index.html            Brücken-Ansicht (Cockpit, Szene, HUD, Stationen, Lobby, Ergebnis)
      beamer.js             bindet Renderer, HUD, Lobby und Audio zusammen (steuert nichts)
      renderer.js           First-Person-Canvas: Sterne und Asteroiden kommen durchs Cockpitfenster auf die Crew zu
    dashboard/
      index.html            Leitstand der Lehrkraft (Steuerung, Schiffswerte, Stationen, Crew, QR)
      dashboard.js          sendet Steuerbefehle, zeigt den Zustand live
    controller/
      index.html            Smartphone-Ansicht
      controller.js         Beitritt, Wartelobby, Rollenanzeige (Operator/Co-Pilot), lädt das Mini-Spiel, HUD, Ergebnis; Debug-Teststand über ?station=&level=
    dev/
      index.html            Mini-Spiel-Teststand: jede Station mit Stufen-Knöpfen (nur mit DAEDALUS_DEBUG erreichbar)
      dev.js                baut die Stationsliste aus STATIONS, verlinkt den direkt gesetzten Controller
    minigames/
      registry.js           Mini-Spiele anmelden und nachschlagen
      _template.js          Vorlage für ein neues Mini-Spiel
      bordcomputer-logic.js Kachelrouting-Logik, DOM-frei (Server + Client)
      bordcomputer-ui.js    Canvas-UI des Bordcomputers (nur Browser)
      bordcomputer.js       verbindet Logik + UI zur Mini-Spiel-Schnittstelle
      tiefpassfilter.js     RC-Tiefpass (Themenfeld 2) → wird durch „Filter auswählen" ersetzt
      zahlensysteme.js      Dualsystem über Bit-Schalter, ohne Live-Dezimalanzeige (Themenfeld 3)
      reaktor.js            Reaktanz-Kalibrierung (Themenfeld 2) → wird durch „Bauteile austauschen" ersetzt (Einzelspiel)
    styles/
      tokens.css            Designtokens der Grimdark-Palette
      controller.css        Panel- und Instrumentenoptik der Stationen
  assets/
    sprites/                Grafiken; beamer-screen-overlay.png ist das Cockpit der Brücke
                            (weitere Slots für spätere Grafiken)
    audio/                  Slot für spätere Klänge, manifest.json listet vorhandene Samples
  test/
    rng.test.js             Determinismus und Wertebereiche des Zufalls
    bordcomputer.test.js    generate/validate des Bordcomputers
    tiefpassfilter.test.js  generate/validate des Tiefpassfilters
    zahlensysteme.test.js   generate/validate der Zahlensysteme
    reaktor.test.js         generate/validate/solve/solveFor des Reaktors
    game.test.js            Spielkern: Rollen, Rotation, Kopplung, Verfall, Schonzeit, Spielende, solve, Bots
  docs/
    GAME_DESIGN.md          Spielmechanik im Detail
    VISUAL_DESIGN.md        Kunststil, verbindlich
    mockups/                statische Mock-ups von Host und Controller
    archive/                historische Logs und veraltete Dokumente (nur zur Referenz)
```

## Hauptkomponenten

1. Server (Spielkern). Verwaltet Räume, hält den autoritativen Zustand inklusive Phase (Lobby, laufend, Sieg, Niederlage), taktet die Sektoren, prüft die Kopplung der geteilten Werte und bewertet Lösungsversuche.
2. Protokoll (shared). Ein einziger Ort für Nachrichtentypen, Phasen (`PHASES`) und Konstanten, damit Server und Client nie auseinanderlaufen. Dazu der deterministische Zufall.
3. Host, zwei Ansichten. Die **Brücke** (`/beamer`) rendert die First-Person-Szene auf Canvas (Blick durchs Cockpitfenster, Sterne und Asteroiden kommen auf die Crew zu), zeigt HUD, Stationsstatus, die Wartelobby mit Beitritts-QR und das Ergebnis und spielt die Klangkulisse – sie steuert nichts. Der **Leitstand** (`/dashboard`) gehört der Lehrkraft: Spiel starten, Schwierigkeit setzen, Asteroidenwellen, neuer Anlauf sowie Stationen und Crew live. Beide verbinden sich als Rolle `host`; `/host` ist nur eine Auswahlseite, die zu beiden verlinkt.
4. Controller-Client. Zeigt vor dem Start die Wartelobby, dann die zugewiesene Station, lädt deren Mini-Spiel über die Registry und schickt Eingaben an den Server.
5. Mini-Spiele. Eigenständige Module hinter einer gemeinsamen Schnittstelle. Jedes erzeugt zufällige Aufgaben und prüft Eingaben. Der **Bordcomputer** ist ein Kachelrouting-Puzzle: Kacheln auf einem 5×5-Feld drehen, bis das Signal von den Eingängen durch Gatter zum Ausgang fließt und der Zielwert erreicht wird. Die Logik liegt in `bordcomputer-logic.js` (DOM-frei, Server + Client), die Canvas-UI in `bordcomputer-ui.js`. **Tiefpassfilter** (Station Sensorik) und **Reaktor** werden in einem späteren Paket durch neue Mini-Spiele ersetzt – das Design steht in `docs/GAME_DESIGN.md`, Abschnitt 7.
6. Designsystem. Farbtokens, Material- und Lichtregeln aus `docs/VISUAL_DESIGN.md`, der Audio-Cue-Katalog und die Asset-Slots.

## Datenfluss und Protokoll

Der Server tickt mit fester Rate (Vorgabe 10 Hz), aktualisiert die geteilten Werte, prüft die Kopplung und sendet Zustandsupdates. In der Lobby und nach Spielende ruht die Simulation (nur die Uhr läuft für die adaptive Schwierigkeit weiter). Die Clients senden nur Eingaben.

Nachrichtentypen liegen in `shared/protocol.js`. Auszug:

- Client an Server: `join` (Host oder Controller, optional `label`), `solveAttempt`, `requestTask`, `startGame`, `triggerEvent`, `setDifficulty`, `resetGame`, `debugBots` (`{ action: "spawn" | "clear", count? }`, nur Host und nur mit `DAEDALUS_DEBUG`), `debugSeat` (`{ station, level, label? }`, Mini-Spiel-Teststand: setzt diesen Controller direkt auf eine Station, nur mit `DAEDALUS_DEBUG`), `coopInput` (`{ param: "a" | "b", value: 0..1 }`, stufenlose Eingabe der Koop-Station). `coopConfirm` ist veraltet (die Koop-Station rastet jetzt ueber die Haltezeit ein) und bleibt nur fuer die Kompatibilitaet im Protokoll.
- Server an Client: `joined` (fuer den Host zusaetzlich `debug`), `assignment`, `state`, `taskAssigned`, `result` (auch bei eingerasteter Koop-Station), `event` (`kind`: `start` mit `sector`; `asteroid`; `rotate` mit `sector` und `sectorCount` fuers Zwischenbild – die neue Station je Person folgt im anschliessenden `assignment`)

Der Host-`state` traegt zusaetzlich `grace`: die verbleibende Schonzeit in ganzen Sekunden nach Start und Sektorwechsel (0, wenn keine laeuft). In dieser Zeit verfaellt nichts und die Huelle haelt; die Bruecke blendet einen Anflug-Hinweis ein. Koop-Stationen liefern im `state` Zusatzfelder: in der Host-Sicht je Station `coop: true` und `coopView` (Ziel, Naehe `match`, Istwert, Haltefortschritt `hold` 0..1 und `locked` – ohne die Einzel-Reglerwerte, der Informationsspalt bleibt). In der Controller-Sicht `coop` mit dem eigenen Reglerwert, Ziel, `match`, ob im Band, dem Haltefortschritt `hold` und `locked`.

Das Spiel beginnt in der Phase `lobby` (`PHASES`) und wartet auf den Start durch die Lehrkraft. Der Server verteilt die Stationen selbst: Auf das `join` eines Controllers folgt ein `assignment` (Operator oder Co-Pilot samt Station) und eine erste Aufgabe, niemand wartet. `startGame` (Lobby → laufend; verteilt frische Aufgaben), `triggerEvent` (Asteroidenwelle), `setDifficulty` (Grundstufe) und `resetGame` (zurück in die Lobby) nimmt der Server nur vom Host an (Leitstand). Beim Sektorwechsel rotiert er die Sitzordnung und schickt allen ein neues `assignment`. Der Host erhält im `state` die Gesamtansicht (Sektor, Phase, Crew, `roster` mit allen Namen, Stationen mit Operator und Co-Pilot-Namen), ein Controller seine Stationsansicht samt Phase. Der Controller mountet sein Mini-Spiel erst in der Phase `running` und zeigt davor die Wartelobby, danach das Ergebnis.

Onboarding und Sektorwechsel (Phase 6): Die Wartelobby auf dem Controller traegt eine kurze Einsatzbesprechung („Mission"). Vor jedem Mounten zeigt der Controller eine Anleitungskarte aus `howto` der Station (Ziel, Beispiel, „Los") – beim Erststart und nach jeder Rotation, nicht nach dem blossen Loesen (das mountet die naechste Aufgabe direkt). Beim Sektorwechsel kommt zuerst ein Zwischenbild: die Bruecke blendet gross „Sektor N erreicht" ein, die Phones zeigen „Sektor erreicht" samt neuer Station und Rolle, ein paar Sekunden lang (die Schonzeit `grace` deckt die Lesezeit). Erst danach folgt die Anleitungskarte und das Spiel. Der Teststand (`/dev`) ueberspringt die Anleitungskarte, damit das Mini-Spiel sofort kommt.

## Zufallsgenerierung der Mini-Spiele

Der Server vergibt pro Aufgabe einen Seed und sendet `taskAssigned` mit `{ minigame, level, seed }`. Der Controller erzeugt daraus dieselbe Aufgabe wie der Server:

```js
import { mulberry32 } from "../../shared/rng.js";
const rng = mulberry32(seed);
const task = minigame.generate(level, rng);
```

Weil die Erzeugung deterministisch ist, kann der Server denselben Seed nutzen, um die Aufgabe nachzubauen und einen Lösungsversuch zu prüfen. Variiert werden je nach Mini-Spiel die Zielvorgabe, die Einkleidung und die Parameterbereiche. So unterscheidet sich jede Runde.

## Mini-Spiel-Schnittstelle

Jedes Mini-Spiel ist ein ES-Modul mit einem Default-Export, das diese Form erfüllt:

```js
export default {
  id: "bordcomputer",            // eindeutig, klein geschrieben
  station: "Bordcomputer",       // Anzeigename der Station
  howto: { goal: "...", example: "..." }, // Kurzanleitung fuer die Anleitungskarte (nur Text)
  generate(level, rng) { ... },  // erzeugt eine Aufgabe (taskData) aus dem Zufall
  mount(root, task, ctx) { ... },// baut die Controller-UI in root auf
  validate(task, input) { ... }, // prüft eine Eingabe
  solve(task) { ... },           // optional: liefert eine korrekte Eingabe (DOM-frei)
};
```

`mount` bekommt ein Wurzelelement, die Aufgabe und einen Kontext `ctx` mit `ctx.audio.play("ui.toggle")`, `ctx.submit(input)`, `ctx.station` (Anzeigename) und `ctx.role` (`"operator"` oder `"supporter"`). Es liefert ein Handle mit `unmount()` und optional `onResult(res)` zurück. `validate` gibt `{ geloest, teiltreffer, hinweis }` zurück, wobei `teiltreffer` zwischen 0 und 1 die Live-Rückmeldung speist.

`howto` ist eine kurze Anleitung (Felder `goal` und `example`, reiner Text, DOM-frei). Der Controller zeigt sie als Anleitungskarte (Station, Ziel, Beispiel, Knopf „Los") vor dem Mounten – beim Erststart und nach jeder Rotation, nicht nach dem blossen Loesen. Alle vier Mini-Spiele bringen sie mit.

Wichtig: `generate` und `validate` müssen DOM-frei bleiben, denn der Server ruft sie zur autoritativen Prüfung ebenfalls auf. Nur `mount` darf das Document benutzen. Registriert sind derzeit `bordcomputer`, `tiefpassfilter`, `zahlensysteme` und `reaktor`; `tiefpassfilter` und `reaktor` werden in einem späteren Paket durch neue Module ersetzt (siehe `docs/GAME_DESIGN.md`, Abschnitt 7).

`solve(task)` ist optional und ebenfalls DOM-frei. Es liefert eine korrekte Eingabe zur Aufgabe und liegt damit am selben Ort wie `validate`. Die Debug-Bots (`server/bots.js`) und die Tests nutzen es, statt das Lösungswissen zu duplizieren. Alle vier registrierten Mini-Spiele stellen es bereit.

### Kooperative Station (Reaktor) – wird ersetzt

> **Hinweis:** Das aktuelle `reaktor.js` (Hold-to-Lock-Kalibrierung, zwei Regler, geteilter Serverzustand) wird in einem späteren Paket durch das Einzelspiel „Bauteile austauschen" abgelöst. Die Beschreibung des neuen Designs steht in `docs/GAME_DESIGN.md`, Abschnitt 7. Der bestehende Code läuft unverändert, bis das Ersatz-Modul fertig ist.

Ein neues Mini-Spiel hinzufügen:

1. `client/minigames/_template.js` kopieren und umbenennen.
2. `generate`, `mount` und `validate` ausfüllen (generate/validate ohne DOM).
3. Das Modul in `client/minigames/registry.js` anmelden.
4. Eine Station in `shared/protocol.js` (Liste `STATIONS`) ergänzen, die auf die `id` des Moduls als `minigame` zeigt.

## Visuelles Design

Verbindlich ist `docs/VISUAL_DESIGN.md`. Der Stil ist ein industrieller Grimdark-Retrofuturismus: schwerer Stahl, Verschleiß, dunkle Militärfarben und funktionale Warnakzente, starke Hell-Dunkel-Kontraste, analog-mechanische Bedienoptik mit Kippschaltern, Hebeln und Zeigerinstrumenten.

Umsetzung im Code:

- Alle Farben kommen aus `client/styles/tokens.css`. Keine willkürlichen Hex-Werte im Code.
- Akzentfarben kennzeichnen Funktion, nicht Dekoration: Warnorange und Notfallrot für Gefahr, Signalgelb für Hinweise, kaltes Cyan und blasses Grün für Status.
- Oberflächen wirken benutzt: dunkle Panels, sichtbare Schrauben und Kanten, leichte Abnutzung. Effekte über CSS und einfache Canvas-Texturen, keine schweren Bibliotheken.
- Licht ist knapp: dunkle Grundfläche, punktuelle Lichtkegel, flackernde Anzeigen. Auf dem Canvas über Radialverläufe und Partikel.
- Bewegung verstärkt die Wucht: träge Massen, kurze Erschütterung bei Treffern, mechanisches Einrasten von Schaltern.

## Audio-Design

Der Ton folgt derselben Welt: Metall, Druckluft, schwere Verschlüsse, tieffrequentes Brummen. Die Engine in `client/audio.js` kennt einen Cue-Katalog. Jeder Cue hat eine synthetisierte Variante (Web Audio) und einen optionalen Datei-Slot unter `assets/audio/` (gelistet in `assets/audio/manifest.json`). Liegt eine Datei vor, gewinnt sie, sonst spielt die Synthese. Zusätzlich schichtet `startAmbient` eine Klangkulisse (zwei verstimmte Brummschichten, tiefes Rumpeln, langsam waberndes Neonflackern), und bei kritischer Hülle blendet `setAlarm` ein pulsierendes Alarmbett ein.

Cue-Katalog (Startumfang):

- `ui.toggle`: Kippschalter, kurzer harter Klick
- `ui.confirm`: schwerer Verschluss schlägt zu
- `ui.error`: tiefer Summer
- `station.stabilize`: zischende Druckluft
- `alarm.asteroid`: anschwellende Warnsirene
- `impact.hull`: dumpfer Metallschlag mit kurzer Erschütterung
- `ambient.engine`: tiefes Brummen als Schleife
- `ambient.hum`: flackerndes Neonröhren-Brummen
- `progress.tick`: ratschendes Kettengeräusch
- `reaktor.tune`: kurzer heller Peilton der Reaktor-Kalibrierung (der Controller spielt ihn dichter, je näher am Ziel)

Stand der Umsetzung: `play(cue)` synthetisiert die Einzelklänge `ui.toggle`, `ui.confirm`, `ui.error`, `station.stabilize`, `alarm.asteroid`, `impact.hull`, `progress.tick` und `reaktor.tune`. Die Schleifen `ambient.engine`/`ambient.hum` sind als geschichtete Kulisse in `startAmbient` realisiert, nicht als Einzel-Cues. Für jeden Cue kann unter `assets/audio/<cue>.mp3` ein Sample abgelegt und im Manifest eingetragen werden, dann gewinnt die Datei. Das Manifest listet bewusst nur vorhandene Samples (sonst entstünden 404-Anfragen); `reaktor.tune` läuft daher als Synthese und ist nicht im Manifest.

## Start und Entwicklung

```bash
npm install
npm start          # Server auf http://localhost:3000
npm run dev        # mit automatischem Neustart
npm test           # reine Logik-Tests (node:test)
```

Starter unter `/host` öffnen (verlinkt Brücke und Leitstand), die Brücke unter `/beamer` auf den Beamer, den Leitstand unter `/dashboard` auf den Laptop, einen Controller testweise unter `/controller`. Im selben WLAN verbinden sich Smartphones über den QR-Code, den Brücke und Leitstand anzeigen.

## Aufgaben für Claude Code

Das Spiel ist klassenfertig (Stand 18.06.2026). Lauffähig sind: Server mit autoritativer Logik und Phasen, die Brücke (`/beamer`) mit First-Person-Cockpitszene, HUD und Wartelobby samt großem Beitritts-QR, der Leitstand (`/dashboard`) mit Steuerung und Live-Monitor, der Controller mit Beitritt, Wartelobby und Rollenanzeige, vier spielbare Mini-Spiele (Bordcomputer: Kachelrouting-Puzzle mit Gattern, Themenfeld 3; Tiefpassfilter auf Station Sensorik, Themenfeld 2; Zahlensysteme auf Station Navigation, Themenfeld 3; Reaktor als bisherige kooperative Station, Themenfeld 2), die geschichtete Audio-Engine und die Designtokens.

> **Der Spielablauf wird überarbeitet.** Das alte Modell (stationärer Stabilitätsverfall, Fortschritt an Mehrheit stabiler Stationen gekoppelt, automatischer Sektorwechsel bei 100 %, Energie an Reaktorkalibrierung gebunden) wird durch den menügesteuerten Loop aus `docs/GAME_DESIGN.md` ersetzt: drei Schiffswerte (Energie, Hülle, Fortschritt), Stationsmenü A/B/C, manueller Sektorstart durch die Lehrkraft, Hilfe-Button und Joker-Abstimmung. **`docs/GAME_DESIGN.md` ist die verbindliche Quelle für das Design; CLAUDE.md beschreibt nur Architektur und Konventionen.**

Erledigt sind alle Tickets T1 bis T6 (siehe `docs/archive/TASKS.md`), abgesichert durch Logik-Tests (`npm test`) und Durchläufe mit mehreren Controllern für Sieg- und Niederlage-Pfad. Offen bleiben nur echte Assets in den Slots unter `assets/` (das Spiel läuft prozedural ohne sie).

### Spielkern-Stellschrauben

Die Abstimmwerte liegen gebündelt oben in `server/game.js`. Die Tickrate steht als `TICK_HZ` in `shared/protocol.js`.

> **Hinweis:** Mehrere Konstanten gehören zum alten Modell und werden im Rahmen der Überarbeitung angepasst oder entfernt: `STABLE_DECAY_PER_SEC`, `HULL_DRAIN_CRITICAL`, `HULL_DRAIN_WARN`, `PROGRESS_PER_SEC` (Mehrheitskopplung), `ENERGIE_GAIN_PER_SEC` und `ENERGIE_DRAIN_PER_SEC` (Reaktorkopplung). Die Zielwerte des neuen Modells stehen in `docs/GAME_DESIGN.md`, Abschnitt 12. Weiterhin gültig bleiben `ASTEROID_DAMAGE`, `GRACE_SEC`, `MAX_SECTORS`, `FAST_SOLVE_SEC`, `SLOW_SOLVE_SEC`, `WRONG_SOLVE_PENALTY` und `SUPPORTER_BOOST`.

### Solo-Testen mit Bots (Entwicklung)

Damit der ganze Ablauf allein an Brücke und Leitstand sichtbar wird, gibt es serverseitige Testspieler in `server/bots.js`. Sie sind ein reines Entwicklerwerkzeug, hinter der Umgebungsvariable `DAEDALUS_DEBUG` verborgen (sonst tauchen sie nie auf). Mit `DAEDALUS_DEBUG=1 npm start` erscheint im Leitstand ein abgesetzter Debug-Bereich „Simulierte Spieler“ (Anzahl wählen, hinzufügen, alle entfernen). Die Bots treten über dieselbe `addParticipant`-Logik bei wie echte Lernende, bekommen Rollen, rotieren mit und lösen ihre Aufgaben über den echten `solve`-Pfad (kein Sonderweg): meist korrekt, gelegentlich daneben. Im Roster sind sie mit „🤖“ markiert. Steuern darf sie nur der Host (`debugBots`-Nachricht), und nur wenn der Server mit `DAEDALUS_DEBUG` läuft.

### Mini-Spiel-Teststand (/dev, Entwicklung)

Um ein einzelnes Mini-Spiel zu testen, ohne durch Lobby und Rotation zu spielen, gibt es den Teststand unter `/dev`. Auch er ist allein hinter `DAEDALUS_DEBUG` erreichbar: Ohne die Variable liefert der Server für `/dev` und `/dev/*` einen 404, die Seite existiert dann nicht. Der Leitstand verlinkt sie aus dem Debug-Bereich.

`client/dev/dev.js` baut die Liste aus `STATIONS` (keine Doppelpflege) und zeigt je Station die Stufen 1 bis 3. Ein Klick öffnet `/controller?station=<id>&level=<n>` in einem neuen Tab. Der Controller erkennt die Query-Parameter (`devSeat`) und schickt statt des Namens-Beitritts die Nachricht `debugSeat`; danach laufen `assignment`, `taskAssigned` und `state` wie im echten Spiel und das Mini-Spiel mountet sofort.

Serverseitig setzt `game.debugSeat(id, label, station, level)` den Teilnehmer gezielt als Operator auf die Station (über `seatParticipant`, das einen vorhandenen Operator zum Co-Pilot macht) und schaltet das Spiel in den **Sandbox**-Zustand: Phase `running`, aber im Tick ruhen Hüllenverlust, Spielende und Sektorfluss, damit eine einzelne Teststation nicht wegrotiert oder das Schiff aufreibt. Für eine Koop-Station (`coop: true`) ergänzt der Server über `bots.spawnPartner(stationId)` automatisch einen Bot als Co-Pilot, sodass der Match-Wert lebt und der Koop-Pfad allein testbar ist. Den Sandbox-Zustand verlassen `startGame` (echter Start) und `reset` (zurück zur Lobby).

### Highscore

Der Server zählt jede erfolgreiche Lösung während der Phase `running` als Punkt (Einzel-Mini-Spiele und Reaktor-Einrastungen je +1). Der Punktestand steht in `shared.score` und wird im `hostState` mitgeschickt; die Brücke zeigt ihn als großes Panel oben mittig. Bei Sieg wird ein Eintrag (Punktzahl, Crewnamen, ISO-Zeitstempel) an `data/highscores.json` angehängt (erzeugt falls fehlend, corrupt-safe). Bei Niederlage wird nichts gespeichert. Nach jedem Spielende zeigt die Brücke statt des alten Ergebnisfensters eine sortierte Top-10-Liste (höchste Punktzahl zuerst, Gleichstand nach früherem Zeitstempel); der aktuelle Sieg-Eintrag ist cyan hervorgehoben. Die Phones zeigen nur einen kurzen Hinweis, auf die Brücke zu schauen. Das Modul `server/highscore.js` kapselt die Datei-IO; `data/` liegt in `.gitignore`. Tests: `test/highscore.test.js`.

### Offene Arbeitspakete (Revision)

Die laufende Überarbeitung folgt `docs/GAME_DESIGN.md`. Noch ausstehend:

- **Spielmechanik** (menügesteuerter Loop, Stationsmenü A/B/C, Energiemodell, manueller Sektorstart, Hilfe-Button, Joker-Abstimmung, Sonderfunktionen je Station).
- **Mini-Spiele ersetzen**: `tiefpassfilter.js` → „Filter auswählen", `reaktor.js` → „Bauteile austauschen" (Einzelspiel).
- **Audio**: Voice-Lines aus `assets/audio/` einbinden (`AI_welcome`, `AI_hull_low`, `AI_hull_crit`, `AI_external_damage`), `.wav`-Unterstützung in der Engine, Fortschritts-Cues bei Meilensteinen.
- **Balance** (Paket P6): Zahlenwerte nach Komplettdurchläufen mit Bots abstimmen.
- **Echte Assets**: weitere Sprites und Samples je Cue (im Manifest eintragen).
- Optional: mehrere Räume statt eines einzigen, einfache Datenerfassung je Themenfeld und Person für die Nachbesprechung.

### Projektstand (Git)

Die gesamte Arbeit liegt auf dem Branch `review/baseline-fixes` in kleinen, beschriebenen Commits. Sie ist noch nicht nach `main` gemerged und noch nicht zum Remote gepusht (in der Arbeitsumgebung war keine GitHub-Authentifizierung hinterlegt). Vor dem Weiterarbeiten den Branch sichten und nach Bedarf mergen oder pushen.

## Konventionen

- Bezeichner im Code auf Englisch, sichtbare Texte auf Deutsch. Kommentare auf Deutsch.
- Dateinamen klein geschrieben. Ein Modul, ein Zweck.
- Keine geheimen Zustände im Client. Was zählt, entscheidet der Server.
- Farben und Schriften nur über die Tokens.
- Kurze Funktionen, klare Namen, wenige Abhängigkeiten.
