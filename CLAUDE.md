# Daedalus

Daedalus ist zugleich der Name des Spiels und des Raumschiffs. Es ist ein kooperatives digitales Lernspiel für das Fach Medientechnik (Einführungsphase) und dient der Ergebnissicherung. Eine Klasse navigiert gemeinsam die Daedalus durch ein Asteroidenfeld und löst dabei Mini-Spiele, die Unterrichtsinhalte abbilden. Laptop und Beamer sind der Host, die Smartphones der Lernenden werden über einen QR-Code zu Steuerungsstationen.

Diese Datei ist die Arbeitsgrundlage für Claude Code. Sie beschreibt Architektur, Konventionen und die nächsten Schritte. Inhaltliche und gestalterische Details stehen in `docs/GAME_DESIGN.md` und `docs/VISUAL_DESIGN.md`. Beide sind verbindlich.

## Leitprinzipien für den Code

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
  shared/
    protocol.js             Nachrichtentypen, STATUS und STATIONS (Server und Client teilen sie)
    rng.js                  deterministischer Zufall aus Seed (mulberry32)
  client/
    net.js                  WebSocket-Hilfe mit automatischem Wiederverbinden (beide Clients)
    audio.js                Audio-Engine, Cue-Katalog, geschichtete Kulisse und Alarmbett
    host/
      index.html            Beamer-Ansicht (Szene, HUD, Werte, Stationen, Leitstand, QR, Ergebnis)
      host.js               bindet Renderer, HUD, Leitstand und Audio zusammen
      renderer.js           reaktive Canvas-Szene (Schiff, Parallaxe-Asteroiden, Funken, Notlicht)
    controller/
      index.html            Smartphone-Ansicht
      controller.js         Lobby, Rollenanzeige (Operator/Co-Pilot), lädt das Mini-Spiel, HUD
    minigames/
      registry.js           Mini-Spiele anmelden und nachschlagen
      _template.js          Vorlage für ein neues Mini-Spiel
      bordcomputer.js       logische Gatter (Themenfeld 3)
      tiefpassfilter.js     RC-Tiefpass, Grenzfrequenz treffen (Themenfeld 2)
      zahlensysteme.js      Dualsystem über Bit-Schalter (Themenfeld 3)
    styles/
      tokens.css            Designtokens der Grimdark-Palette
      controller.css        Panel- und Instrumentenoptik der Stationen
  assets/
    sprites/                Slot für spätere Grafiken
    audio/                  Slot für spätere Klänge, manifest.json listet vorhandene Samples
  test/
    rng.test.js             Determinismus und Wertebereiche des Zufalls
    bordcomputer.test.js    generate/validate des Bordcomputers
    tiefpassfilter.test.js  generate/validate des Tiefpassfilters
    zahlensysteme.test.js   generate/validate der Zahlensysteme
    game.test.js            Spielkern: Rollen, Rotation, Kopplung, Verfall, Spielende
  docs/
    GAME_DESIGN.md          Spielmechanik im Detail
    VISUAL_DESIGN.md        Kunststil, verbindlich
    mockups/                statische Mock-ups von Host und Controller
```

## Hauptkomponenten

1. Server (Spielkern). Verwaltet Räume, hält den autoritativen Zustand, taktet die Sektoren, prüft die Kopplung der geteilten Werte und bewertet Lösungsversuche.
2. Protokoll (shared). Ein einziger Ort für Nachrichtentypen und Konstanten, damit Server und Client nie auseinanderlaufen. Dazu der deterministische Zufall.
3. Host-Client. Rendert die Schiffsszene auf Canvas, zeigt das HUD mit geteilten Werten und Stationsstatus, enthält den Leitstand der Lehrkraft und spielt die Klangkulisse.
4. Controller-Client. Zeigt eine Station, lädt deren Mini-Spiel über die Registry und schickt Eingaben an den Server.
5. Mini-Spiele. Eigenständige Module hinter einer gemeinsamen Schnittstelle. Jedes erzeugt zufällige Aufgaben und prüft Eingaben. Der Bordcomputer ist das ausgearbeitete Beispiel.
6. Designsystem. Farbtokens, Material- und Lichtregeln aus `docs/VISUAL_DESIGN.md`, der Audio-Cue-Katalog und die Asset-Slots.

## Datenfluss und Protokoll

Der Server tickt mit fester Rate (Vorgabe 10 Hz), aktualisiert die geteilten Werte, prüft die Kopplung und sendet Zustandsupdates. Die Clients senden nur Eingaben.

Nachrichtentypen liegen in `shared/protocol.js`. Auszug:

- Client an Server: `join` (Host oder Controller, optional `label`), `solveAttempt`, `requestTask`, `triggerEvent`, `setDifficulty`, `resetGame`
- Server an Client: `joined`, `assignment`, `state`, `taskAssigned`, `result`, `event`

Der Server verteilt die Stationen selbst: Auf das `join` eines Controllers folgt ein `assignment` (Operator oder Co-Pilot samt Station) und eine erste Aufgabe, niemand wartet. `triggerEvent` (Asteroidenwelle), `setDifficulty` (Grundstufe) und `resetGame` (neuer Anlauf) nimmt der Server nur vom Host an (Leitstand). Beim Sektorwechsel rotiert er die Sitzordnung und schickt allen ein neues `assignment`. Der Host erhält im `state` die Gesamtansicht (Sektor, Phase, Crew, Stationen mit Operator und Co-Piloten), ein Controller seine Stationsansicht.

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
};
```

`mount` bekommt ein Wurzelelement, die Aufgabe und einen Kontext `ctx` mit `ctx.audio.play("ui.toggle")`, `ctx.submit(input)`, `ctx.station` (Anzeigename) und `ctx.role` (`"operator"` oder `"supporter"`). Es liefert ein Handle mit `unmount()` und optional `onResult(res)` zurück. `validate` gibt `{ geloest, teiltreffer, hinweis }` zurück, wobei `teiltreffer` zwischen 0 und 1 die Live-Rückmeldung speist.

Wichtig: `generate` und `validate` müssen DOM-frei bleiben, denn der Server ruft sie zur autoritativen Prüfung ebenfalls auf. Nur `mount` darf das Document benutzen. Registriert sind derzeit `bordcomputer`, `tiefpassfilter` und `zahlensysteme`.

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

Stand der Umsetzung: `play(cue)` synthetisiert die Einzelklänge `ui.toggle`, `ui.confirm`, `ui.error`, `station.stabilize`, `alarm.asteroid`, `impact.hull` und `progress.tick`. Die Schleifen `ambient.engine`/`ambient.hum` sind als geschichtete Kulisse in `startAmbient` realisiert, nicht als Einzel-Cues. Für jeden Cue kann unter `assets/audio/<cue>.mp3` ein Sample abgelegt und im Manifest eingetragen werden, dann gewinnt die Datei.

## Start und Entwicklung

```bash
npm install
npm start          # Server auf http://localhost:3000
npm run dev        # mit automatischem Neustart
npm test           # reine Logik-Tests (node:test)
```

Host öffnen unter `/host`, einen Controller testweise unter `/controller`. Im selben WLAN verbinden sich Smartphones über den QR-Code, den der Host anzeigt.

## Aufgaben für Claude Code

Das Spiel ist klassenfertig (Stand 17.06.2026). Lauffähig sind: Server mit autoritativer Logik, Host mit reaktiver Schiffsszene, HUD, Leitstand und sichtbarem Beitritts-QR, Controller mit Lobby und Rollenanzeige, drei voll spielbare Mini-Spiele (Bordcomputer, Themenfeld 3; Tiefpassfilter auf der Station Sensorik, Themenfeld 2; Zahlensysteme auf der Station Navigation, Themenfeld 3), die geschichtete Audio-Engine und die Designtokens.

Der Spielablauf: Der Server setzt jede Person als Operator einer Station oder als Co-Pilot ein. Stationen müssen durch wiederholtes Lösen stabil gehalten werden, sonst verfallen sie und die Hülle leidet. Der Fortschritt steigt nur, wenn die Mehrheit der besetzten Stationen stabil ist. Volle Fortschrittsleiste führt in den nächsten Sektor und rotiert die Rollen; nach dem letzten Sektor folgt der Sieg, bei leerer Hülle die Niederlage. Der Leitstand löst Asteroidenwellen aus, setzt die Grundschwierigkeit und startet einen neuen Anlauf.

Erledigt sind alle Tickets T1 bis T6 (siehe `TASKS.md`), abgesichert durch Logik-Tests (`npm test`) und Durchläufe mit mehreren Controllern für Sieg- und Niederlage-Pfad. Offen bleiben nur echte Assets in den Slots unter `assets/` (das Spiel läuft prozedural ohne sie).

### Spielkern-Stellschrauben

Die Abstimmwerte liegen gebündelt oben in `server/game.js`: `ASTEROID_DAMAGE`, `STABLE_DECAY_PER_SEC`, `HULL_DRAIN_CRITICAL`, `HULL_DRAIN_WARN`, `PROGRESS_PER_SEC`, `MAX_SECTORS`, `SUPPORTER_BOOST`, `FAST_SOLVE_SEC` und `SLOW_SOLVE_SEC`. Wer Tempo, Druck oder Spiellänge ändern will, justiert sie dort. Die Tickrate steht als `TICK_HZ` in `shared/protocol.js`.

### Bekannte Lücken und mögliche nächste Schritte

- Energie ist derzeit ein reiner Anzeigewert und bleibt konstant, weil es noch keinen Reaktor gibt. Ein Reaktor-Mini-Spiel könnte Energie verbrauchen und verteilen und sie an die Kopplung binden.
- Weitere in `docs/GAME_DESIGN.md` genannte Stationen fehlen noch: Antrieb, Schilde, Reaktor. Sie entstehen als neue Mini-Spiele über die Schnittstelle plus Eintrag in `STATIONS`.
- Echte Assets in den Slots unter `assets/`: Sprites für `renderer.js`, Samples je Cue (im Manifest eintragen).
- Optional: mehrere Räume statt eines einzigen (der Server hält aktuell genau ein Spiel) und eine einfache Datenerfassung für die Reflexion.

### Projektstand (Git)

Die gesamte Arbeit liegt auf dem Branch `review/baseline-fixes` in kleinen, beschriebenen Commits. Sie ist noch nicht nach `main` gemerged und noch nicht zum Remote gepusht (in der Arbeitsumgebung war keine GitHub-Authentifizierung hinterlegt). Vor dem Weiterarbeiten den Branch sichten und nach Bedarf mergen oder pushen.

## Konventionen

- Bezeichner im Code auf Englisch, sichtbare Texte auf Deutsch. Kommentare auf Deutsch.
- Dateinamen klein geschrieben. Ein Modul, ein Zweck.
- Keine geheimen Zustände im Client. Was zählt, entscheidet der Server.
- Farben und Schriften nur über die Tokens.
- Kurze Funktionen, klare Namen, wenige Abhängigkeiten.
