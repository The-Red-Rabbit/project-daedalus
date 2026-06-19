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
  REVIEW.md                 Bericht des ersten Review-Durchgangs
  TASKS.md                  Backlog mit Abnahmekriterien (T1 bis T6 erledigt)
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
      controller.js         Beitritt, Wartelobby, Rollenanzeige (Operator/Co-Pilot), lädt das Mini-Spiel, HUD, Ergebnis
    minigames/
      registry.js           Mini-Spiele anmelden und nachschlagen
      _template.js          Vorlage für ein neues Mini-Spiel
      bordcomputer.js       logische Schaltung aus Gattern bauen (Themenfeld 3)
      tiefpassfilter.js     RC-Tiefpass, Kapazität aus zwei Bauteilen bauen (Themenfeld 2)
      zahlensysteme.js      Dualsystem über Bit-Schalter, ohne Live-Dezimalanzeige (Themenfeld 3)
      reaktor.js            kooperative Reaktanz-Kalibrierung zu zweit (Themenfeld 2)
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
```

## Hauptkomponenten

1. Server (Spielkern). Verwaltet Räume, hält den autoritativen Zustand inklusive Phase (Lobby, laufend, Sieg, Niederlage), taktet die Sektoren, prüft die Kopplung der geteilten Werte und bewertet Lösungsversuche.
2. Protokoll (shared). Ein einziger Ort für Nachrichtentypen, Phasen (`PHASES`) und Konstanten, damit Server und Client nie auseinanderlaufen. Dazu der deterministische Zufall.
3. Host, zwei Ansichten. Die **Brücke** (`/beamer`) rendert die First-Person-Szene auf Canvas (Blick durchs Cockpitfenster, Sterne und Asteroiden kommen auf die Crew zu), zeigt HUD, Stationsstatus, die Wartelobby mit Beitritts-QR und das Ergebnis und spielt die Klangkulisse – sie steuert nichts. Der **Leitstand** (`/dashboard`) gehört der Lehrkraft: Spiel starten, Schwierigkeit setzen, Asteroidenwellen, neuer Anlauf sowie Stationen und Crew live. Beide verbinden sich als Rolle `host`; `/host` ist nur eine Auswahlseite, die zu beiden verlinkt.
4. Controller-Client. Zeigt vor dem Start die Wartelobby, dann die zugewiesene Station, lädt deren Mini-Spiel über die Registry und schickt Eingaben an den Server.
5. Mini-Spiele. Eigenständige Module hinter einer gemeinsamen Schnittstelle. Jedes erzeugt zufällige Aufgaben und prüft Eingaben. Der Bordcomputer ist ein Konstruktionsspiel: aus mehreren Gattern eine kleine Schaltung bauen, die eine Ziel-Wahrheitstabelle erzeugt (Rückmeldung erst nach dem Bestätigen, ein Fehlversuch kostet Stabilität). Der **Reaktor** ist die kooperative Station: zwei Personen kalibrieren gemeinsam eine Reaktanz, ihren geteilten Zustand hält der Server (siehe „Kooperative Station“).
6. Designsystem. Farbtokens, Material- und Lichtregeln aus `docs/VISUAL_DESIGN.md`, der Audio-Cue-Katalog und die Asset-Slots.

## Datenfluss und Protokoll

Der Server tickt mit fester Rate (Vorgabe 10 Hz), aktualisiert die geteilten Werte, prüft die Kopplung und sendet Zustandsupdates. In der Lobby und nach Spielende ruht die Simulation (nur die Uhr läuft für die adaptive Schwierigkeit weiter). Die Clients senden nur Eingaben.

Nachrichtentypen liegen in `shared/protocol.js`. Auszug:

- Client an Server: `join` (Host oder Controller, optional `label`), `solveAttempt`, `requestTask`, `startGame`, `triggerEvent`, `setDifficulty`, `resetGame`, `debugBots` (`{ action: "spawn" | "clear", count? }`, nur Host und nur mit `DAEDALUS_DEBUG`), `coopInput` (`{ param: "a" | "b", value: 0..1 }`, stufenlose Eingabe der Koop-Station), `coopConfirm` (Bestaetigung der Koop-Station)
- Server an Client: `joined` (fuer den Host zusaetzlich `debug`), `assignment`, `state`, `taskAssigned`, `result`, `event` (`kind`: `start`, `asteroid`, `rotate`)

Der Host-`state` traegt zusaetzlich `grace`: die verbleibende Schonzeit in ganzen Sekunden nach Start und Sektorwechsel (0, wenn keine laeuft). In dieser Zeit verfaellt nichts und die Huelle haelt; die Bruecke blendet einen Anflug-Hinweis ein. Koop-Stationen liefern im `state` Zusatzfelder: in der Host-Sicht je Station `coop: true` und `coopView` (Ziel, Naehe `match`, Istwert – ohne die Einzel-Reglerwerte, der Informationsspalt bleibt). In der Controller-Sicht `coop` mit dem eigenen Reglerwert, Ziel, `match`, ob im Band und ob beide bestaetigt haben.

Das Spiel beginnt in der Phase `lobby` (`PHASES`) und wartet auf den Start durch die Lehrkraft. Der Server verteilt die Stationen selbst: Auf das `join` eines Controllers folgt ein `assignment` (Operator oder Co-Pilot samt Station) und eine erste Aufgabe, niemand wartet. `startGame` (Lobby → laufend; verteilt frische Aufgaben), `triggerEvent` (Asteroidenwelle), `setDifficulty` (Grundstufe) und `resetGame` (zurück in die Lobby) nimmt der Server nur vom Host an (Leitstand). Beim Sektorwechsel rotiert er die Sitzordnung und schickt allen ein neues `assignment`. Der Host erhält im `state` die Gesamtansicht (Sektor, Phase, Crew, `roster` mit allen Namen, Stationen mit Operator und Co-Pilot-Namen), ein Controller seine Stationsansicht samt Phase. Der Controller mountet sein Mini-Spiel erst in der Phase `running` und zeigt davor die Wartelobby, danach das Ergebnis.

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
  generate(level, rng) { ... },  // erzeugt eine Aufgabe (taskData) aus dem Zufall
  mount(root, task, ctx) { ... },// baut die Controller-UI in root auf
  validate(task, input) { ... }, // prüft eine Eingabe
  solve(task) { ... },           // optional: liefert eine korrekte Eingabe (DOM-frei)
};
```

`mount` bekommt ein Wurzelelement, die Aufgabe und einen Kontext `ctx` mit `ctx.audio.play("ui.toggle")`, `ctx.submit(input)`, `ctx.station` (Anzeigename) und `ctx.role` (`"operator"` oder `"supporter"`). Es liefert ein Handle mit `unmount()` und optional `onResult(res)` zurück. `validate` gibt `{ geloest, teiltreffer, hinweis }` zurück, wobei `teiltreffer` zwischen 0 und 1 die Live-Rückmeldung speist.

Wichtig: `generate` und `validate` müssen DOM-frei bleiben, denn der Server ruft sie zur autoritativen Prüfung ebenfalls auf. Nur `mount` darf das Document benutzen. Registriert sind derzeit `bordcomputer`, `tiefpassfilter`, `zahlensysteme` und `reaktor` (kooperativ).

`solve(task)` ist optional und ebenfalls DOM-frei. Es liefert eine korrekte Eingabe zur Aufgabe und liegt damit am selben Ort wie `validate`. Die Debug-Bots (`server/bots.js`) und die Tests nutzen es, statt das Lösungswissen zu duplizieren. Alle vier registrierten Mini-Spiele stellen es bereit.

### Kooperative Station (Reaktor)

Der Reaktor weicht vom Einzelspiel-Muster ab: Zwei Personen kalibrieren gemeinsam eine kapazitive Reaktanz `Xc = 1 / (2*pi*f*C)` auf einen Zielwert aus dem Seed. Der Operator stellt die Kapazitaet C (Parameter `a`), der Co-Pilot die Frequenz f (Parameter `b`). Niemand sieht den Wert der anderen Person, beide sehen Ziel und Naehe – dieser Informationsspalt zwingt zum Reden. Gewertet wird, wenn **beide** bei einem Wert im Toleranzband bestaetigen (Solo-Fallback: eine Person bedient beide Regler und bestaetigt allein).

Den geteilten Zustand (beide Reglerwerte, Ziel, Bestaetigungen) haelt der Server in `server/game.js` je Koop-Station; er rechnet Reaktanz und Naehe ueber `validate` autoritativ nach. Eine Koop-Station traegt in `STATIONS` `coop: true`. Das Modul bringt zusaetzlich mit:

- `coop: true` am Modul (Kennzeichnung).
- `solveFor(task, partner, param)`: DOM-freie Reglerposition fuer den eigenen Parameter, die das Ziel trifft, wenn die andere Seite ihren Wert haelt. Nutzen die Bots, um sich schrittweise auf die Ziellinie zuzubewegen.
- `mount` nutzt `ctx.coopInput(param, value)` (stufenlose Eingabe) und `ctx.coopConfirm()` und liefert im Handle ein `onState(state)`, das der Controller bei jedem `state` aufruft (Live-Match, Ziel, Solo, Partner-Bereitschaft). Eine Reglerbewegung loescht die eigene Bestaetigung; ein erfolgreiches Einrasten rollt ein neues Ziel ueber den `state` (kein Neu-Mounten).

Die Energie ist an den Reaktor gekoppelt: stabil kalibriert haelt oder hebt sie sich, sonst faellt sie. Ohne Koop-Station bleibt Energie konstant (kein Reaktor), die drei Einzelspiele bleiben unveraendert.

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

Das Spiel ist klassenfertig (Stand 18.06.2026). Lauffähig sind: Server mit autoritativer Logik und Phasen, die Brücke (`/beamer`) mit First-Person-Cockpitszene, HUD, Reaktor-Anzeige und Wartelobby samt großem Beitritts-QR, der Leitstand (`/dashboard`) mit Steuerung und Live-Monitor, der Controller mit Beitritt, Wartelobby und Rollenanzeige, vier voll spielbare Mini-Spiele (Bordcomputer als Schaltungsbau, Themenfeld 3; Tiefpassfilter auf der Station Sensorik mit Kapazität aus zwei Bauteilen, Themenfeld 2; Zahlensysteme auf der Station Navigation ohne Live-Dezimalanzeige und ab Stufe 2 hexadezimal, Themenfeld 3; Reaktor als kooperative Station zu zweit, Themenfeld 2), die geschichtete Audio-Engine und die Designtokens. Die drei Einzelspiele belohnen Verständnis statt Probieren: Rückmeldung erst nach dem Bestätigen, ein Fehlversuch kostet Stabilität.

Der Spielablauf: Erst sammelt sich die Crew in der Lobby (Smartphones scannen den QR, geben einen Namen ein), dann startet die Lehrkraft am Leitstand das Spiel. Der Server setzt jede Person als Operator einer Station oder als Co-Pilot ein. Stationen müssen durch wiederholtes Lösen stabil gehalten werden, sonst verfallen sie und die Hülle leidet. Der Fortschritt steigt nur, wenn die Mehrheit der besetzten Stationen stabil ist. Volle Fortschrittsleiste führt in den nächsten Sektor und rotiert die Rollen; nach dem letzten Sektor folgt der Sieg, bei leerer Hülle die Niederlage. Der Leitstand löst Asteroidenwellen aus, setzt die Grundschwierigkeit und holt die Crew mit „Zurück zur Lobby“ für einen neuen Anlauf zurück.

Erledigt sind alle Tickets T1 bis T6 (siehe `TASKS.md`), abgesichert durch Logik-Tests (`npm test`) und Durchläufe mit mehreren Controllern für Sieg- und Niederlage-Pfad. Offen bleiben nur echte Assets in den Slots unter `assets/` (das Spiel läuft prozedural ohne sie).

### Spielkern-Stellschrauben

Die Abstimmwerte liegen gebündelt oben in `server/game.js`: `ASTEROID_DAMAGE`, `STABLE_DECAY_PER_SEC`, `HULL_DRAIN_CRITICAL`, `HULL_DRAIN_WARN`, `GRACE_SEC`, `PROGRESS_PER_SEC`, `MAX_SECTORS`, `SUPPORTER_BOOST`, `WRONG_SOLVE_PENALTY` (Stabilitätsabzug bei einem Fehlversuch), `FAST_SOLVE_SEC`, `SLOW_SOLVE_SEC`, `ENERGIE_GAIN_PER_SEC` und `ENERGIE_DRAIN_PER_SEC` (Energie-Kopplung an den Reaktor). Wer Tempo, Druck oder Spiellänge ändern will, justiert sie dort. Die Tickrate steht als `TICK_HZ` in `shared/protocol.js`.

Aktuelles Tempo-Profil „mittel“ (spürbar ruhiger als der erste Stand, aber noch fordernd): Eine Station hält nach dem Lösen rund 16 Sekunden stabil (`STABLE_DECAY_PER_SEC = 0.0625`), eine unbesetzte Station zieht 1,0/s, eine besetzte-instabile 0,35/s von der Hülle. `GRACE_SEC = 6` gibt nach dem Start und nach jedem Sektorwechsel eine Schonzeit von sechs Sekunden, in der nichts verfällt und die Hülle hält (der Fortschritt darf laufen); die Brücke zeigt sie als Anflug-Hinweis. Die Schonzeit gilt jeweils für den gerade beginnenden Zeitschritt, damit `GRACE_SEC` auch genau so lange wirkt.

### Solo-Testen mit Bots (Entwicklung)

Damit der ganze Ablauf allein an Brücke und Leitstand sichtbar wird, gibt es serverseitige Testspieler in `server/bots.js`. Sie sind ein reines Entwicklerwerkzeug, hinter der Umgebungsvariable `DAEDALUS_DEBUG` verborgen (sonst tauchen sie nie auf). Mit `DAEDALUS_DEBUG=1 npm start` erscheint im Leitstand ein abgesetzter Debug-Bereich „Simulierte Spieler“ (Anzahl wählen, hinzufügen, alle entfernen). Die Bots treten über dieselbe `addParticipant`-Logik bei wie echte Lernende, bekommen Rollen, rotieren mit und lösen ihre Aufgaben über den echten `solve`-Pfad (kein Sonderweg): meist korrekt, gelegentlich daneben, damit der Verfall sichtbar wird. Im Roster sind sie mit „🤖“ markiert. Steuern darf sie nur der Host (`debugBots`-Nachricht), und nur wenn der Server mit `DAEDALUS_DEBUG` läuft.

### Bekannte Lücken und mögliche nächste Schritte

- Energie ist an den Reaktor gekoppelt (stabil kalibriert hält/hebt, sonst fällt). Tiefere Wechselwirkungen (Energie als Ressource, die Stationen speist) sind noch offen.
- Weitere in `docs/GAME_DESIGN.md` genannte Stationen fehlen noch: Antrieb und Schilde. Der Reaktor ist als kooperative Station umgesetzt. Neue Stationen entstehen als Mini-Spiele über die Schnittstelle plus Eintrag in `STATIONS`.
- Echte Assets in den Slots unter `assets/`: das Cockpit der Brücke (`beamer-screen-overlay.png`) liegt vor; weitere Sprites und Samples je Cue (im Manifest eintragen) fehlen noch.
- Optional: mehrere Räume statt eines einzigen (der Server hält aktuell genau ein Spiel) und eine einfache Datenerfassung für die Reflexion.

### Projektstand (Git)

Die gesamte Arbeit liegt auf dem Branch `review/baseline-fixes` in kleinen, beschriebenen Commits. Sie ist noch nicht nach `main` gemerged und noch nicht zum Remote gepusht (in der Arbeitsumgebung war keine GitHub-Authentifizierung hinterlegt). Vor dem Weiterarbeiten den Branch sichten und nach Bedarf mergen oder pushen.

## Konventionen

- Bezeichner im Code auf Englisch, sichtbare Texte auf Deutsch. Kommentare auf Deutsch.
- Dateinamen klein geschrieben. Ein Modul, ein Zweck.
- Keine geheimen Zustände im Client. Was zählt, entscheidet der Server.
- Farben und Schriften nur über die Tokens.
- Kurze Funktionen, klare Namen, wenige Abhängigkeiten.
