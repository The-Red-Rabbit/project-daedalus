# MVP-Backlog

Abgegrenzte Aufgaben für Claude Code. Das Grundgerüst steht und läuft (Server, Host, Controller, Mini-Spiel-Schnittstelle, Bordcomputer, Audio-Engine, Designtokens). Diese Tickets führen zu einem runden MVP.

Reihenfolge: T1 bis T4 und T6 bilden das MVP. T5 ist ein späterer Schritt. Jedes Ticket nennt Ziel, betroffene Dateien, Vorgehen und ein Abnahmekriterium. Bezeichner im Code auf Englisch, sichtbare Texte auf Deutsch, generate und validate bleiben ohne DOM.

Stand 17.06.2026: Alle Tickets sind umgesetzt. T1, T2, T3, T4, T5 und T6 sind erledigt und durch automatische Tests sowie Durchlaeufe mit mehreren Controllern (Sieg- und Niederlage-Pfad) belegt. Zusaetzlich gibt es ein drittes Mini-Spiel (Zahlensysteme, Station Navigation) und einen Qualitaetsschliff bei Bild und Ton.

Stand 18.06.2026 (Runde 2): Phase 1, 2 und 3 sind erledigt (siehe unten „Runde 2“). Debug-Bots fuers Solo-Testen, eine ruhigere Taktung, die kooperative Reaktor-Station und der Umbau des Bordcomputers zum Schaltungsbau sind umgesetzt und durch Tests (63 gruen) sowie Komplettdurchlaeufe mit Bots belegt.

## T1: Sichtbarer QR-Code auf der Host-Seite (erledigt)

Ziel: Der Host zeigt den Beitritts-Code groß auf der Beamer-Seite, nicht nur im Terminal.

Dateien: `server/index.js`, `client/host/index.html`, `client/host/host.js`.

Vorgehen: Einen Endpunkt `/qr` ergänzen, der die Controller-URL über `qrcode` als SVG liefert. Die URL aus der LAN-Adresse bilden. Im Join-Panel des Hosts ein Bild oder Inline-SVG anzeigen.

Fertig, wenn: Ein Smartphone den Code scannt und der Controller im selben WLAN lädt.

Erledigt: Der Endpunkt `/qr` liefert den QR-Code als SVG aus der LAN-URL (zusätzlich im Header `X-Join-URL`). Der Host zeigt ihn im Join-Panel samt URL.

## T2: Leitstand an den Server verdrahten (erledigt)

Ziel: Ereignis und Grundschwierigkeit wirken serverseitig statt nur lokal.

Dateien: `shared/protocol.js`, `client/host/host.js`, `server/index.js`, `server/game.js`.

Vorgehen: Neue Nachrichten für Ereignis und Schwierigkeit aufnehmen. Der Knopf löst eine Asteroidenwelle als Server-Ereignis aus, das an alle geht und die Hülle senkt. Der Regler setzt die Grundstufe, aus der neue Aufgaben erzeugt werden.

Fertig, wenn: Ein Knopfdruck eine Welle auslöst, die Hülle sinkt und der Host die Erschütterung zeigt. Der Regler ändert die Stufe der nächsten Aufgaben.

Erledigt: Neue, nur vom Host akzeptierte Nachrichten `triggerEvent` und `setDifficulty`. Die Welle senkt serverseitig die Hülle und wird als `event` an alle gemeldet; der Host spielt Alarm und Einschlag und schüttelt die Szene. Der Regler setzt die Grundstufe für neue Aufgaben.

## T3: Statusverfall und Nachjustieren (erledigt)

Ziel: Eine Station bleibt nur stabil, wenn sie gehalten wird. Leerlauf wird spürbar.

Dateien: `server/game.js`.

Vorgehen: Im Tick den Stationsstatus über Zeit von stabil auf achtung absinken lassen, bis eine neue Aufgabe gelöst wird. Unbesetzte Stationen bleiben kritisch. Die geteilten Werte an diesen Verlauf koppeln.

Fertig, wenn: Ohne Eingriff fällt eine Station zurück und der Fortschritt stockt. Nach erneutem Lösen steigt sie wieder.

Erledigt: Jede Station trägt einen Stabilitätswert (1 nach dem Lösen), der im Tick fällt; nach rund acht Sekunden ohne neue Lösung wird sie wieder „achtung“. Der Huellenverlust ist an die Vernachlässigung gekoppelt (unbesetzt am stärksten, besetzt aber instabil weniger, stabil gar nicht). Fortschritt braucht die Mehrheit der Stationen stabil. Host und Controller zeigen die Stabilität.

## T4: Sektorfluss und Spielende (erledigt)

Ziel: Fortschritt führt durch die Sektoren bis zum Ziel. Eine leere Hülle bedeutet Scheitern.

Dateien: `server/game.js`, `client/host/host.js`, `shared/protocol.js`.

Vorgehen: Bei Fortschritt 100 den Sektor erhöhen und den Fortschritt zurücksetzen. Nach dem letzten Sektor folgt der Sieg, bei Hülle 0 die Niederlage. Der Host zeigt das Ergebnis.

Fertig, wenn: Ein Durchlauf sichtbar endet, als Sieg oder als Niederlage.

Erledigt: Voller Fortschritt führt in den nächsten Sektor (drei insgesamt), nach dem letzten folgt der Sieg, leere Hülle die Niederlage. Die Phase liegt im Zustand; nach dem Ende ruht die Simulation. Der Host zeigt ein Ergebnisfenster mit dem Knopf „Neuer Anlauf“ (`resetGame`), der Server setzt zurück und vergibt frische Aufgaben.

## T5: Rollenrotation und Unterstützerrolle (erledigt)

Ziel: Rollen wechseln zwischen Sektoren. Schnelle Lernende erhalten eine Unterstützerrolle statt Wartezeit.

Dateien: `server/game.js`, `server/index.js`, `client/controller/controller.js`, `shared/protocol.js`.

Vorgehen: Beim Sektorwechsel die Stationen neu zuteilen. Wer schnell löst, bekommt eine Co-Pilot-Aufgabe aus einem Pool, etwa einer ausgelasteten Station zuarbeiten.

Fertig, wenn: Nach einem Sektor sitzt jede Person an einer anderen Station und schnelle Lösungen erzeugen keine Wartezeit.

Erledigt: Der Server verteilt die Rollen selbst. Wer beitritt, wird Operator einer freien Station oder, wenn alle besetzt sind, Co-Pilot der am wenigsten unterstützten Station, also kein Warten. Eine Co-Pilot-Lösung hebt die Stabilität der Station. Beim Sektorwechsel rotiert die Sitzordnung, jede Person wechselt die Station. Fällt ein Operator aus, rückt ein Co-Pilot nach. Die Schwierigkeit justiert pro Person nach dem Tempo.

## T6: Zweites Mini-Spiel Tiefpassfilter (Station Sensorik) (erledigt)

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

Erledigt: `client/minigames/tiefpassfilter.js` erfüllt die Schnittstelle DOM-frei in generate und validate. Diskrete R- und C-Reihen machen die Zielfrequenz exakt erreichbar; die Stufe steuert Toleranz und ob nur C oder R und C verstellbar sind. mount zeichnet den Amplitudengang auf Canvas mit Zielmarke und Toleranzband, der Start liegt bewusst daneben. Modul ist in der Registry, Station Sensorik im Protokoll.

## Runde 2

Weiterentwicklung nach dem ersten klassenfertigen Stand, getrieben von `docs/CLAUDE_CODE_PROMPTS_RUNDE2.md`. Phasenweise, mit bewusstem Stopp nach jeder Phase.

### Runde 2 · Phase 1: Debug-Bots und Entschärfung des Tempos (erledigt)

Ziel: Ein Werkzeug zum Solo-Testen und eine ruhigere Taktung. Kein neuer Spielinhalt.

Teil A, simulierte Spieler (Bots). Neu `server/bots.js`: Bots treten über dieselbe `addParticipant`-Logik bei wie echte Lernende, bekommen Rollen, rotieren mit und lösen ihre Aufgaben über den echten `solve`-Pfad (meist richtig, gelegentlich daneben). Steuerung nur vom Host über die neue, nur mit `DAEDALUS_DEBUG` aktive Nachricht `debugBots` (`spawn`/`clear`). Im Leitstand ein abgesetzter Debug-Bereich „Simulierte Spieler“, im Roster mit „🤖“ markiert. Damit das Lösungswissen nicht doppelt liegt, hat jedes Mini-Spiel eine optionale, DOM-freie Methode `solve(task)`; die Tests nutzen sie ebenfalls.

Teil B, ruhigere Taktung (Profil „mittel“). Werte oben in `server/game.js`: `STABLE_DECAY_PER_SEC` von 0,12 auf 0,0625 (Station hält ~16 s statt ~8 s), `HULL_DRAIN_CRITICAL` von 1,5 auf 1,0, `HULL_DRAIN_WARN` von 0,6 auf 0,35. Neu `GRACE_SEC = 6`: eine Schonzeit nach Start und nach jedem Sektorwechsel, in der nichts verfällt und die Hülle hält (der Fortschritt darf laufen). Die Brücke zeigt sie als Anflug-Hinweis, der Host-`state` trägt das Restfeld `grace`.

Fertig, wenn: Mit sechs Bots läuft ein voller Durchlauf allein an Brücke und Leitstand bis zum Sieg oder zur Niederlage, ein Sektor fühlt sich ruhiger an und kurze Vernachlässigung reißt die Hülle nicht sofort ein. Belegt durch `npm test` (48 Tests grün, inklusive `solve`- und Bot-Tests) und einen Komplettdurchlauf (sechs Bots, Sieg über drei Sektoren).

### Runde 2 · Phase 2: Kooperative Reaktor-Station (erledigt)

Ziel: Eine neue, kooperative Station, die zum Reden und zum Blick nach vorn auf die Brücke zwingt.

Mechanik: Zwei Personen kalibrieren gemeinsam eine kapazitive Reaktanz `Xc = 1 / (2*pi*f*C)` auf einen Zielwert aus dem Seed. Der Operator stellt die Kapazität C (Parameter `a`), der Co-Pilot die Frequenz f (Parameter `b`). Niemand sieht den Wert der anderen Seite, beide sehen Ziel und Annäherung (Match). Gewertet wird über das Modell „beide bestätigen“ (Felix' Wahl): nur wenn beide bei einem Wert im Toleranzband bestätigen, rastet es ein, die Station wird stabil und ein neues Ziel erscheint. Solo-Fallback: eine Person bedient beide Regler und bestätigt allein. Bedienelement: großer Schieberegler (Felix' Wahl).

Architektur: Anders als die Einzelspiele hält den geteilten Zustand (beide Reglerwerte, Ziel, Bestätigungen) der Server in `server/game.js` je Koop-Station und rechnet die Reaktanz über `validate` autoritativ nach. Neues Modul `client/minigames/reaktor.js` (generate/validate/solve/solveFor DOM-frei), Eintrag in der Registry und in `STATIONS` mit `coop: true`. Neue Protokoll-Nachrichten `coopInput` und `coopConfirm`; `state` trägt für die Koop-Station `coopView` (Host) bzw. `coop` (Controller). Energie ist an den Reaktor gekoppelt (`ENERGIE_GAIN_PER_SEC`/`ENERGIE_DRAIN_PER_SEC` oben in `server/game.js`). Die Bots aus Phase 1 bedienen auch den Reaktor (schrittweise auf die Ziellinie, dann bestätigen). Brücke zeigt Ziel und Match groß; Controller hat den Schieber, eine Match-Leiste und einen Peilton `reaktor.tune`, der näher am Ziel dichter wird.

Fertig, wenn: Zwei Personen (oder zwei Bots) kalibrieren den Reaktor, das Ziel steht auf der Brücke, der Match steigt sichtbar, bei Treffer wird die Station stabil und die Energie reagiert; die drei bestehenden Stationen laufen unverändert. Belegt durch `npm test` (60 Tests grün, inkl. Reaktor-Modul, Koop-Spielkern, Bot-Kalibrierung) und einen Live-Durchlauf mit acht Bots (Reaktor-Paar kalibriert wiederholt über mehrere Sektoren, Energie gekoppelt).

### Runde 2 · Phase 3: Bordcomputer als Schaltungsbau (erledigt)

Ziel: Das bloße Durchklicken verschwindet. Statt ein Gatter aus vier zu wählen, baut man die Lösung aus mehreren Gattern.

Mechanik (Felix' Wahl: kleine Schaltung aus bis zu drei Gattern): Aus einer Ziel-Wahrheitstabelle baut man die Schaltung selbst, indem man je Slot ein Gatter wählt. Stufe 1 ist eine Reihe aus zwei Gattern (`out = Gout(G1(A,B), B)`), Stufe 2/3 die kleine Schaltung aus drei Gattern (`out = Gout(G1(A,B), G2(A,B))`); die Gatter-Auswahl wächst mit der Stufe (Stufe 1: UND/ODER/NAND, Stufe 2: + XOR, Stufe 3: + NOR/XNOR). Rückmeldung gibt es erst nach dem Bestätigen (keine Ist-Spalte mehr beim Bauen). Ein Fehlversuch kostet Stabilität (Felix' Wahl statt einer Sperre): `WRONG_SOLVE_PENALTY` oben in `server/game.js` senkt sie über den allgemeinen solve-Pfad (wirkt damit auch auf die anderen Einzelspiele und die Bots; Koop läuft über coopConfirm und bleibt unberührt).

Architektur: `generate`/`validate`/`solve` bleiben DOM-frei; die Aufgabe beschreibt die Verdrahtung generisch (`slots` mit Eingangs-Referenzen, `palette`, `target`, `solution`), sodass derselbe Code auf Server und Client die Schaltung auswertet. Der Server validiert autoritativ. `test/bordcomputer.test.js` ist auf die neue Mechanik umgestellt und prüft `validate` gegen eine unabhängige Schaltungsauswertung über alle möglichen Belegungen.

Fertig, wenn: Eine korrekte Lösung verlangt das Nachdenken über die Tabelle, blindes Probieren ist langsam und teuer, die Tests sind grün und der Spielablauf läuft ohne Regression. Belegt durch `npm test` (63 Tests grün) und einen Live-Durchlauf mit sechs Bots (Bordcomputer wird gebaut und stabil, Sieg über drei Sektoren, Fehlversuche senken sichtbar die Stabilität).

### Runde 2 · Phase 4 und folgende

Noch offen, bewusst erst nach Sichtung von Phase 3 und nur bei genügend Zeit vor dem Test: Vertiefung von Tiefpass und Zahlensysteme (Phase 4), Backlog (Phase 5). Details in `docs/CLAUDE_CODE_PROMPTS_RUNDE2.md`.

## Designhinweise für alle Tickets

- Farben und Schriften nur über `client/styles/tokens.css`.
- Stil und Stimmung nach `docs/VISUAL_DESIGN.md`: schwerer Stahl, knappes Licht, funktionale Warnakzente, analog-mechanische Bedienoptik.
- Klangereignisse über den Cue-Katalog in `client/audio.js` auslösen.
