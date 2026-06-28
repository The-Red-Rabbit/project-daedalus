# Review des Grundgerüsts

Stand: 17.06.2026. Branch: `review/baseline-fixes`. Ausgangsbasis: das von einer
anderen Instanz erzeugte Grundgerüst (Server, Shared, Client, Bordcomputer,
Audio-Engine, Designtokens).

Dieser Durchgang war ausdrücklich ein Prüf- und Überarbeitungsdurchgang, keine
neuen Features. Die offenen Tickets in `TASKS.md` (T1 bis T6) bleiben offen.

## 1. Was geprüft wurde

- Vollständig gelesen: `CLAUDE.md`, `docs/GAME_DESIGN.md`, `docs/VISUAL_DESIGN.md`,
  `TASKS.md`, `README.md` sowie jede Quelldatei unter `server/`, `shared/`, `client/`.
- Protokoll-Konsistenz zwischen `shared/protocol.js` und beiden Clients: alle
  genutzten Nachrichtentypen und Felder stimmen überein (`join`, `pickStation`,
  `solveAttempt`, `requestTask`; `joined`, `state`, `taskAssigned`, `result`, `event`).
- Querumgebung: der Server importiert das Mini-Spiel-Modul über die Registry, um
  Lösungen zu bewerten. `generate()` und `validate()` im Bordcomputer sind DOM-frei,
  nur `mount()` nutzt das Document. Die Modulpfade lösen in Node und im Browser
  gleich auf (relative Pfade in `registry.js` und `bordcomputer.js`; die absoluten
  `/...`-Pfade liegen nur in reinen Browser-Modulen).
- Statische Auslieferung: korrekte MIME-Typen geprüft, der Pfadausbruch-Schutz
  überarbeitet (siehe 2.1), und `/shared`, `/assets`, `/host`, `/controller`,
  `/styles`, `/minigames` lösen alle auf (per HTTP belegt).
- WebSocket-Lebenszyklus: Beitritt, Stationswahl, Freigabe bei Trennung und
  Verhalten bei fehlerhaften Nachrichten, unbekannter Stations-ID, bereits belegter
  Station und Wiederverbindung. Alle Fälle laufen ohne Absturz.
- Deterministischer Zufall: der Server baut aus demselben Seed dieselbe Aufgabe
  nach. Die Bewertung ist dadurch autoritativ und unabhängig von Client-Angaben.
- Ressourcen, Performance und Konsolen-Rauschen, insbesondere die Audio-Probe.
- Abgleich mit der verbindlichen `docs/VISUAL_DESIGN.md` (siehe 2.5): die Palette in
  `tokens.css` deckt sich vollständig mit der Vorgabe (alle Haupt- und Akzentfarben),
  und der Audio-Cue-Katalog passt zur beschriebenen Klangwelt.

## 2. Was geändert wurde und warum

Jede Änderung ist ein eigener, beschriebener Commit. Vorab wurde das Grundgerüst
unverändert als Basis-Commit festgehalten, weil der ursprüngliche `Initial commit`
nur eine README-Vorstufe enthielt. So sind die Korrekturen als kleine Diffs lesbar.

### 2.1 Pfadausbruch-Schutz gehärtet (`server/index.js`)

Der alte Schutz prüfte nur `filePath.startsWith(ROOT)`. Das ließ zwei Lücken zu:
ein Nachbarordner mit gleichem Namensanfang (etwa `project-daedalus-evil`) wurde
als „innerhalb" gewertet, und unter Windows konnten Backslashes als Trenner zum
Ausbruch dienen. Zudem erreichten Client-Anfragen über `..` auch `server/` und
`.git`. Jede Anfrage wird jetzt auf ihr Zielverzeichnis (`client/`, `shared/` oder
`assets/`) eingegrenzt, geprüft über `path.relative`. Kodierte Versuche wie
`/..%2fserver%2findex.js` liefern nun zuverlässig 403, die regulären Pfade weiter 200.

### 2.2 Audio-Probe ohne 404-Rauschen (`client/audio.js`, `assets/`)

Bisher fragte der erste `play()`-Aufruf jedes Cues `/<cue>.mp3` ab, was in der
Browser-Konsole einen 404 erzeugte, solange keine Datei vorliegt. Die Engine liest
nun einmalig `assets/audio/manifest.json` (eine Liste vorhandener Cues, leer
ausgeliefert) und fragt nur gelistete Cues als Datei ab. Das Verhalten „Datei
gewinnt über Synthese" bleibt erhalten: Cue ins Manifest eintragen und Datei ablegen.

### 2.3 Rückmeldung bei fehlgeschlagener Stationswahl (`server/index.js`)

Die Wahl einer unbekannten oder bereits belegten Station erzeugte keine Antwort,
der Controller blieb hängen. Der Server schickt jetzt die aktuelle Stationsliste
als `joined` zurück, sodass der Controller seine Auswahl auffrischt (und bei voller
Belegung „Alle Stationen sind besetzt." zeigt). Kein neuer Nachrichtentyp nötig.

### 2.4 Automatische Tests (`test/`, `package.json`)

Reine Logik mit dem eingebauten `node:test`-Runner, ohne neue Abhängigkeiten,
abrufbar über `npm test`. Abgedeckt: RNG-Determinismus und Wertebereiche,
Bordcomputer (`generate`-Determinismus, Stufen-Gatter, Wahrheitstabelle,
`validate`) und die Kopplungs-Mathematik in `server/game.js` (Huellen-Verfall im
Leerlauf, Fortschritt erst ab genug stabilen Stationen). 19 Tests, alle grün.

### 2.5 Farben durchgängig aus den Tokens (`renderer.js`, `controller.css`)

Nachdem `docs/VISUAL_DESIGN.md` gefüllt und damit verbindlich wurde („alle Farben
aus tokens.css"): der Canvas-Rückfallwert für `--steel-dark` im Renderer war veraltet
(`#2b2e31`, das ist der `--edge`-Wert) und entspricht nun dem Token (`#232a30`). Die
Zeilen-Markierungen der Bordcomputer-Tabelle nutzten handgeschriebene RGBA-Werte und
leiten sich jetzt über `color-mix` aus `--status-stable` und `--status-critical` ab
(optisch identisch).

## 3. Verifiziert

- `npm install`: 0 Schwachstellen.
- `npm test`: 19 von 19 grün.
- `npm start`: Server startet, zeigt QR im Terminal, liefert Host und Controller aus.
- Voller Ablauf per Skript belegt: Host verbindet, Controller tritt bei, wählt den
  Bordcomputer, erhält eine Zufallsaufgabe, löst sie richtig (Status `stabil`,
  Fortschritt steigt) und falsch (Teiltreffer 0,5), geteilte Werte und Stationsstatus
  aktualisieren sich, Trennung gibt die Station frei. Keine Fehler im Server-Log.

## 4. Bewusst zurückgestellt

- (Erledigt) `docs/VISUAL_DESIGN.md` war zunächst leer, ist aber inzwischen von der
  Projektleitung mit der verbindlichen Stilvorgabe gefüllt worden. Der Abgleich mit
  dem Code ist erfolgt (siehe 1. und 2.5).
- Tickets T1 bis T6 aus `TASKS.md` (sichtbarer QR auf dem Host, Leitstand an den
  Server, Statusverfall, Sektorfluss und Spielende, Rollenrotation, Tiefpassfilter)
  sind Features und damit nicht Teil dieses Durchgangs.
- `energie` bleibt konstant, bis der Reaktor existiert (Teil künftiger Tickets).
- `renderer.setState()` ist ein bewusster Platzhalter für reaktive Effekte.
- `client/minigames/_template.js` importiert `randomInt` ungenutzt. Als Vorlage
  unkritisch, bewusst unverändert gelassen.
- Zeilenenden: Git meldet beim Hinzufügen LF zu CRLF. Bewusst keine `.gitattributes`
  ergänzt, da das den Rahmen dieses Durchgangs überschreitet.

## 5. Aktuelle Basis

Das Grundgerüst läuft sauber. Der Bordcomputer ist über die Schnittstelle voll
spielbar, die Bewertung ist serverseitig und autoritativ, der WebSocket-Lebenszyklus
ist robust gegen die geprüften Fehlerfälle, und die reine Spiellogik ist durch Tests
abgesichert. Architektur und Konventionen sind unverändert: modular, server-autoritativ,
ohne Build-Schritt, vanilla ES-Module, Farben nur über `tokens.css`, Audio über den
Cue-Katalog.
