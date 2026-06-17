# MVP-Backlog

Abgegrenzte Aufgaben für Claude Code. Das Grundgerüst steht und läuft (Server, Host, Controller, Mini-Spiel-Schnittstelle, Bordcomputer, Audio-Engine, Designtokens). Diese Tickets führen zu einem runden MVP.

Reihenfolge: T1 bis T4 und T6 bilden das MVP. T5 ist ein späterer Schritt. Jedes Ticket nennt Ziel, betroffene Dateien, Vorgehen und ein Abnahmekriterium. Bezeichner im Code auf Englisch, sichtbare Texte auf Deutsch, generate und validate bleiben ohne DOM.

## T1: Sichtbarer QR-Code auf der Host-Seite

Ziel: Der Host zeigt den Beitritts-Code groß auf der Beamer-Seite, nicht nur im Terminal.

Dateien: `server/index.js`, `client/host/index.html`, `client/host/host.js`.

Vorgehen: Einen Endpunkt `/qr` ergänzen, der die Controller-URL über `qrcode` als SVG liefert. Die URL aus der LAN-Adresse bilden. Im Join-Panel des Hosts ein Bild oder Inline-SVG anzeigen.

Fertig, wenn: Ein Smartphone den Code scannt und der Controller im selben WLAN lädt.

## T2: Leitstand an den Server verdrahten

Ziel: Ereignis und Grundschwierigkeit wirken serverseitig statt nur lokal.

Dateien: `shared/protocol.js`, `client/host/host.js`, `server/index.js`, `server/game.js`.

Vorgehen: Neue Nachrichten für Ereignis und Schwierigkeit aufnehmen. Der Knopf löst eine Asteroidenwelle als Server-Ereignis aus, das an alle geht und die Hülle senkt. Der Regler setzt die Grundstufe, aus der neue Aufgaben erzeugt werden.

Fertig, wenn: Ein Knopfdruck eine Welle auslöst, die Hülle sinkt und der Host die Erschütterung zeigt. Der Regler ändert die Stufe der nächsten Aufgaben.

## T3: Statusverfall und Nachjustieren

Ziel: Eine Station bleibt nur stabil, wenn sie gehalten wird. Leerlauf wird spürbar.

Dateien: `server/game.js`.

Vorgehen: Im Tick den Stationsstatus über Zeit von stabil auf achtung absinken lassen, bis eine neue Aufgabe gelöst wird. Unbesetzte Stationen bleiben kritisch. Die geteilten Werte an diesen Verlauf koppeln.

Fertig, wenn: Ohne Eingriff fällt eine Station zurück und der Fortschritt stockt. Nach erneutem Lösen steigt sie wieder.

## T4: Sektorfluss und Spielende

Ziel: Fortschritt führt durch die Sektoren bis zum Ziel. Eine leere Hülle bedeutet Scheitern.

Dateien: `server/game.js`, `client/host/host.js`, `shared/protocol.js`.

Vorgehen: Bei Fortschritt 100 den Sektor erhöhen und den Fortschritt zurücksetzen. Nach dem letzten Sektor folgt der Sieg, bei Hülle 0 die Niederlage. Der Host zeigt das Ergebnis.

Fertig, wenn: Ein Durchlauf sichtbar endet, als Sieg oder als Niederlage.

## T5: Rollenrotation und Unterstützerrolle (später)

Ziel: Rollen wechseln zwischen Sektoren. Schnelle Lernende erhalten eine Unterstützerrolle statt Wartezeit.

Dateien: `server/game.js`, `client/controller/controller.js`.

Vorgehen: Beim Sektorwechsel die Stationen neu zuteilen. Wer schnell löst, bekommt eine Co-Pilot-Aufgabe aus einem Pool, etwa einer ausgelasteten Station zuarbeiten.

Fertig, wenn: Nach einem Sektor sitzt jede Person an einer anderen Station und schnelle Lösungen erzeugen keine Wartezeit.

## T6: Zweites Mini-Spiel Tiefpassfilter (Station Sensorik)

Ziel: Ein zweites, voll spielbares und zufälliges Mini-Spiel, das die Schnittstelle erfüllt. Es bringt fachliche Breite, da der Bordcomputer Themenfeld 3 abdeckt und der Filter Themenfeld 2.

Dateien: neu `client/minigames/tiefpassfilter.js`, Eintrag in `client/minigames/registry.js`, Station in `shared/protocol.js` ergänzen.

Spielidee: R und C so einstellen, dass die Grenzfrequenz die Zielfrequenz trifft. Es gilt f_c = 1 / (2 * pi * R * C). Live-Rückmeldung über eine Amplituden-Frequenz-Kurve mit einer Zielmarke. Das Ziel ist die Kante der Kurve auf die Marke zu schieben, was auch ohne Fachwissen sichtbar bleibt.

Einkleidung: „Stelle den Sensorfilter so ein, dass nur das tiefe Signal durchkommt.“

Schnittstelle:

- `generate(level, rng)`: zufällige Zielfrequenz aus einem sinnvollen Bereich. Die Stufe steuert die Toleranz und ob nur C oder R und C verstellbar sind. Bauteilwerte aus diskreten Reihen, damit die Zielfrequenz erreichbar ist.
- `mount(root, task, ctx)`: Kurve auf Canvas oder SVG zeichnen, Auswahl oder Schieberegler für R und C, die berechnete f_c und die Zielmarke anzeigen, Bestätigen über `ctx.submit`.
- `validate(task, input)`: f_c aus den gewählten Werten berechnen. Gelöst, wenn der Abstand zur Zielfrequenz innerhalb der Toleranz liegt. `teiltreffer` aus der Nähe ableiten.

Wichtig: generate und validate ohne DOM, nur mount nutzt das Document. Als Vorlage dient `client/minigames/_template.js`, als Vorbild `client/minigames/bordcomputer.js`.

Fertig, wenn: Die Station Sensorik wählbar ist, jede Runde eine andere Zielfrequenz zeigt und die Validierung serverseitig stimmt.

## Designhinweise für alle Tickets

- Farben und Schriften nur über `client/styles/tokens.css`.
- Stil und Stimmung nach `docs/VISUAL_DESIGN.md`: schwerer Stahl, knappes Licht, funktionale Warnakzente, analog-mechanische Bedienoptik.
- Klangereignisse über den Cue-Katalog in `client/audio.js` auslösen.
