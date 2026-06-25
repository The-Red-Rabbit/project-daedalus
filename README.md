# project-daedalus

Project Daedalus is a cooperative learning game for media science.

Daedalus ist ein kooperatives digitales Lernspiel für das Fach Medientechnik (Einführungsphase). Die Klasse navigiert gemeinsam ein Raumschiff durch ein Asteroidenfeld und löst dabei Mini-Spiele, die Unterrichtsinhalte sichern.

## Start

```bash
npm install
npm start
```

Danach im Browser öffnen:

- Start/Übersicht: http://localhost:3000/host (führt zu den beiden Host-Ansichten)
- Brücke (Beamer): http://localhost:3000/beamer
- Leitstand (Lehrkraft): http://localhost:3000/dashboard
- Controller (Smartphone): http://localhost:3000/controller

Im selben WLAN verbinden sich die Smartphones über den QR-Code, den die Brücke (und der Leitstand) anzeigt.

Tests laufen mit `npm test` (reine Logik, ohne zusätzliche Abhängigkeiten).

## Spielen

Der Host teilt sich in zwei Ansichten: die **Brücke** kommt auf den Beamer, der **Leitstand** bleibt bei der Lehrkraft.

- Die **Brücke** (`/beamer`) zeigt den Blick aus dem Cockpit ins Asteroidenfeld – Sterne und Brocken kommen aus der Tiefe auf die Crew zu und vermitteln die Fahrt des Schiffs. Dazu die geteilten Werte (Hülle, Energie, Fortschritt) und den Stationsstatus. Vor dem Start ist hier die Lobby mit großem Beitritts-QR und der schon anwesenden Crew.
- Der **Leitstand** (`/dashboard`) gehört der Lehrkraft: Spiel starten, Grundschwierigkeit setzen, Asteroidenwellen auslösen, neuen Anlauf beginnen sowie Stationen und Crew live verfolgen.

Wer beitritt, gibt im Smartphone einen Namen ein und wartet in der Lobby, bis die Lehrkraft startet. Die Wartelobby zeigt eine kurze Einsatzbesprechung, und vor jeder Station erscheint eine Anleitungskarte (Ziel und ein kleines Beispiel, dann „Los”). Der Server weist die Rolle selbst zu: Operator einer freien Station oder Co-Pilot, der einer Station zuarbeitet. So wartet niemand auf eine Aufgabe. Vier Stationen mit je einem Mini-Spiel:

- **Bordcomputer**: Kacheln auf einem 5×5-Feld drehen, bis das Signal von den Eingängen durch logische Gatter zum Ausgang fließt und der Zielwert stimmt. Rückmeldung erst nach dem Bestätigen.
- **Sensorik** (in Überarbeitung): aktuell Tiefpassfilter mit Kondensatorwahl; wird durch „Filter auswählen” ersetzt – Filtertyp (Hoch-, Tief- oder Bandpass) und Bauteilgröße zur Zielfrequenz bestimmen.
- **Navigation**: einen Zielcode (ab Stufe 2 hexadezimal) ohne mitlaufende Dezimalanzeige selbst in Bits umrechnen und über Bit-Schalter einstellen.
- **Reaktor** (in Überarbeitung): aktuell kooperative Reaktanz-Kalibrierung zu zweit; wird durch „Bauteile austauschen” ersetzt – das richtige Schaltsymbol aus einem Schaltbild heraussuchen (Einzelspiel).

Jede Person hat an ihrer Station ein Menü mit drei Wegen: Eine Lösung kann die geteilte **Energie** laden (A), die stationseigene **Sonderfunktion** auslösen – z. B. Hülle reparieren, Asteroid-Rate senken oder Fortschritt schubsen – (B) oder eine **Joker-Abstimmung** für die ganze Crew starten (C). Die drei Schiffswerte – Energie, Hülle, Fortschritt – gelten für alle. Asteroiden schlagen zufällig ein und ziehen Hülle ab; ausreichend Energie treibt den Fortschritt voran. Sinkt die Hülle auf null, ist das Spiel verloren. Ist ein Sektor geschafft, bestätigt jede Person „bereit”, dann startet die Lehrkraft den nächsten Sektor von Hand – das gibt Zeit zum Besprechen. Die Rollen rotieren beim Sektorwechsel. Nach dem letzten Sektor folgt der Sieg. Über den Leitstand löst die Lehrkraft Asteroidenwellen aus, setzt die Grundschwierigkeit und startet mit „Zurück zur Lobby” einen neuen Anlauf. Fällt ein Smartphone kurz aus dem WLAN, verbindet es sich von selbst wieder und tritt mit demselben Namen bei.

Jede erfolgreiche Lösung (Einzel-Mini-Spiel oder Reaktor-Einrastung) zählt einen Punkt. Die Brücke zeigt den Punktestand groß oben mittig während des Einsatzes. Nach dem Spielende – Sieg oder Niederlage – zeigt die Brücke eine Highscore-Liste mit den zehn besten Läufen. Bei einem Sieg wird der neue Eintrag (Punkte, Crewnamen, Datum) gespeichert und in der Liste hervorgehoben; bei einer Niederlage bleibt die Liste unverändert. Die Smartphones zeigen einen kurzen Hinweis, auf die Brücke zu schauen. Die Highscore-Datei liegt unter `data/highscores.json` auf dem Server.

## Im Unterricht einsetzen

1. Laptop und Beamer ins Klassen-WLAN bringen, `npm start` ausführen und `/host` öffnen. Die Brücke (`/beamer`) auf den Beamer (Vollbild) ziehen, den Leitstand (`/dashboard`) auf dem Laptop behalten.
2. Auf der Brücke einmal auf „Ton an“ tippen (Browser geben Audio erst nach einer Eingabe frei).
3. Die Lernenden scannen den QR-Code, geben ihren Namen ein und treten bei. Mehr Personen als Stationen sind erwünscht, die zusätzlichen werden Co-Piloten. Wer beigetreten ist, erscheint in der Lobby.
4. Am Leitstand die Grundschwierigkeit wählen und, sobald alle bereit sind, „Spiel starten“. Während des Spiels justiert sich die Stufe pro Person nach dem Tempo.
5. Mit „Asteroidenwelle“ Druck erzeugen, mit „Zurück zur Lobby“ einen frischen Durchlauf starten.

Hinweis: alles läuft im lokalen WLAN, ohne Internet und ohne Konten. Es genügt ein Raum (ein Server) für eine Klasse.

## Solo testen mit Bots (Entwicklung)

Zum Ausprobieren ohne mehrere Smartphones gibt es serverseitige Testspieler (Bots). Sie sind ein reines Entwicklerwerkzeug und nur sichtbar, wenn der Server mit der Umgebungsvariable `DAEDALUS_DEBUG` läuft, damit sie nie versehentlich im Unterricht auftauchen.

```bash
DAEDALUS_DEBUG=1 npm start      # bash
$env:DAEDALUS_DEBUG=1; npm start  # PowerShell
```

Im Leitstand (`/dashboard`) erscheint dann ein abgesetzter Debug-Bereich „Simulierte Spieler“: eine Anzahl wählen, „Bots hinzufügen“, dann wie gewohnt „Spiel starten“. Die Bots treten über denselben Weg bei wie echte Lernende, bekommen Rollen, rotieren mit und lösen ihre Aufgaben automatisch (meist richtig, manchmal daneben); an der Reaktor-Station kalibrieren zwei Bots gemeinsam. Im Roster sind sie mit „🤖“ markiert. So lässt sich der ganze Ablauf bis zum Sieg oder zur Niederlage allein an Brücke und Leitstand beobachten (für ein voll besetztes Reaktor-Paar etwa acht Bots spawnen).

## Ein einzelnes Mini-Spiel testen (Entwicklung)

Damit man ein Mini-Spiel nicht über Lobby und Rotation „erspielen“ muss, gibt es einen Teststand unter `/dev`. Auch er ist nur erreichbar, wenn der Server mit `DAEDALUS_DEBUG` läuft (ohne die Variable liefert `/dev` einen 404, die Seite existiert dann schlicht nicht). Im Leitstand führt ein Link aus dem Debug-Bereich dorthin.

Die Seite listet jede Station mit den Stufen 1 bis 3. Ein Klick öffnet den Controller in einem neuen Tab, der sich sofort als Operator auf diese Station setzt und das Mini-Spiel direkt mountet – ohne Beitritt, ohne Warten. Im Teststand bleibt die Hülle voll und der Sektorfluss ruht, sodass man beliebig lange ausprobieren kann. Bei der Koop-Station **Reaktor** kommt automatisch ein Bot als Partner dazu, damit der Match-Wert lebt und der Koop-Pfad allein testbar ist. Ein echtes Spiel beginnt erst wieder über „Spiel starten“ oder „Zurück zur Lobby“ am Leitstand.

## Orientierung

- `CLAUDE.md`: Architektur, Konventionen und nächste Schritte. Erste Anlaufstelle.
- `docs/GAME_DESIGN.md`: Spielmechanik im Detail.
- `docs/VISUAL_DESIGN.md`: verbindlicher Kunststil.
- `docs/mockups/`: statische Mock-ups von Host und Controller.

Der Code ist bewusst schlank: Node mit `ws` als Server, reines JavaScript mit ES-Modulen im Browser, Canvas für die Host-Szene, Web Audio für den Ton. Kein Build-Schritt.
