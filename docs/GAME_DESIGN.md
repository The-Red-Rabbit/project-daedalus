# Spieldesign Daedalus (Entwurf der Überarbeitung)

Stand: 25.06.2026. Dieser Entwurf ersetzt das bisherige `docs/GAME_DESIGN.md`. Er beschreibt die überarbeitete Fassung des kooperativen Lernspiels für die multimediale Modulprüfung Medientechnik (Einführungsphase). Sobald du ihn freigibst, installiert ihn das Prompt-Paket P1 als neue `docs/GAME_DESIGN.md`, und alle weiteren Prompts beziehen sich darauf.

Offene Zahlenwerte sind als „Vorschlag“ markiert. Sie sind Startwerte fürs Balancing (Paket P6) und noch keine Festlegung.

## 1. Überblick

Die Klasse navigiert gemeinsam das Raumschiff Daedalus durch ein Asteroidenfeld. Laptop und Beamer bilden den Host und zeigen Brücke und Leitstand, die Smartphones der Lernenden werden über einen QR-Code zu Stationen. Jede Station trägt ein Mini-Spiel, das einen Unterrichtsinhalt sichert. Das Spiel ersetzt die klassische Ergebnissicherung am Ende einer Unterrichtsreihe.

Die technische Grundlage bleibt: ein Node-Server hält den autoritativen Zustand, die Clients senden Eingaben und rendern. Architektur und Konventionen stehen in `CLAUDE.md`, der Kunststil in `docs/VISUAL_DESIGN.md`. Beide bleiben verbindlich.

## 2. Lernziel und Einordnung

Das Spiel sichert behandelten Stoff, es führt ihn nicht ein. Die Mini-Spiele liegen in der Einführungsphase: logische Gatter und Zahlensysteme in Themenfeld 3 (Digitaltechnik), Filter und Bauteilkunde in Themenfeld 2 (Filter und Verstärker). Die Lehrkraft (im Folgenden LK) spielt keine Station. Sie führt als Kommandant über den Leitstand: starten, takten, differenzieren, beobachten.

## 3. Die Designwende: von Zeitdruck zu Entscheidung

Der bisherige Stand setzte auf permanenten Zeitdruck. Jede Person wiederholte bis zum Sektorwechsel ein zugewiesenes Mini-Spiel, und der Verfall der Stationen erzeugte Hektik. Das wird ersetzt.

Neu trifft jede Person laufend eine Entscheidung. Sie bleibt an ihrer Station, löst aber nicht stumpf dieselbe Aufgabe, sondern wählt in einem kleinen Menü, wozu ihre Lösung dient. Der Druck kommt aus knappen Ressourcen und gemeinsamer Abwägung, nicht aus einer ablaufenden Uhr. Das senkt die Hektik und hebt das Gespräch in der Crew.

## 4. Das Stationsmenü (A, B, C)

Jede Person hat eine feste Station (die Rollen rotieren beim Sektorwechsel) und auf dem Smartphone ein Menü mit drei Wegen:

- (A) Lösen für Energie: Die Stationsaufgabe lösen lädt die geteilte Energie und zählt sichtbar auf das eigene Beitragskonto.
- (B) Lösen für die Sonderfunktion: Dieselbe Aufgabe lösen löst stattdessen die stationseigene Sonderfunktion aus (siehe Abschnitt 7).
- (C) Abstimmung starten: Eine Person ruft die Crew zur Abstimmung über den Team-Joker (siehe Abschnitt 9).

Die Aufgabe ist in (A) und (B) dieselbe. Der Unterschied liegt allein darin, wohin die Lösung wirkt. So entsteht eine fachlich gleiche, strategisch verschiedene Wahl.

## 5. Die drei Schiffswerte, neu definiert

Drei Werte gelten für die ganze Crew.

**Fortschritt** ist der zurückgelegte Weg durch den aktuellen Sektor. Er füllt sich fortlaufend, und zwar umso schneller, je höher die Energie steht. Bei 100 Prozent ist der Sektor geschafft. Das Schiff wartet dann, bis die LK den nächsten Sektor freigibt (Abschnitt 6).

**Hülle** ist die gemeinsame Gesundheit. Asteroiden schlagen über die Zeit zufällig ein und ziehen Hülle ab. Repariert wird sie beim Sektorwechsel automatisch ein Stück, durch den Team-Joker und durch die Sonderfunktion der Bordcomputer-Station. Erreicht die Hülle null, ist das Spiel verloren. Die Hülle ist die einzige Niederlagebedingung.

**Energie** ist das Tempo des Schiffs. Sie sinkt langsam über die Zeit und zusätzlich bei Fehlversuchen in den Mini-Spielen. Sie steigt, wenn Stationen über Weg (A) gelöst werden. Wenig Energie heißt langsames Schiff. Ein langsames Schiff braucht länger durch den Sektor und ist damit länger den Asteroiden ausgesetzt. So koppelt die Energie indirekt an das Überleben, ohne selbst eine Niederlagebedingung zu sein.

### Warum die ganze Crew gebraucht wird (gegen Trittbrettfahren)

Der Mechanismus arbeitet mit positiver Verstärkung statt mit Strafe. Jede gelöste Aufgabe füllt die geteilte Energie und erscheint zusätzlich als Plus auf dem persönlichen Beitragskonto, das die Brücke je Crewmitglied anzeigt. Sichtbarer Beitrag motiviert, ohne dass Untätigkeit unmittelbar bestraft wird.

Scheitern kann die Crew trotzdem gemeinsam. Die Asteroiden sind eine äußere Uhr. Nur genügend Reparaturen (über Weg B und den Joker) und genügend Tempo (über Energie aus Weg A) halten die Hülle über null. Sitzen zu viele zurück, fehlt beides: das Schiff bleibt langsam, die Belastung dauert länger, die Hülle verliert das Rennen. Geht das Spiel so verloren, zeigt die Brücke die Ursache deutlich: die leere Hülle und ein Beitragsbild, in dem die Schieflage ablesbar ist. Die Niederlage ist damit nie willkürlich, sondern als Folge zu geringer gemeinsamer Arbeit erkennbar.

## 6. Sektorablauf

Ein Sektor läuft, bis der Fortschritt 100 Prozent erreicht. Dann hält das Schiff an einer Sektorgrenze. Jede Person bestätigt am Smartphone „bereit“. Die LK sieht am Leitstand, wer schon bereit ist, und startet den nächsten Sektor von Hand. Mit dem Start beginnt der Fortschritt wieder bei 0, die Hülle erhält ihre automatische Teil-Reparatur, und die Rollen rotieren, damit niemand dauerhaft an derselben Station bleibt. Nach dem letzten Sektor folgt der Sieg.

Der manuelle Start gibt der LK die Taktung zurück. Sie kann eine Pause zum Besprechen einlegen, langsame Lernende abholen oder zügig weiterziehen.

## 7. Stationen und Mini-Spiele

Vier Stationen, jede mit drei Schwierigkeitsstufen. Die LK setzt eine Grundstufe, das System justiert pro Person nach dem Tempo nach.

**Bleiben unverändert:**

- **Bordcomputer** (Themenfeld 3, logische Gatter): Auf einem Feld mit 5 x 5 Kacheln rotiert der Spieler Kacheln mit Leitungen bis der richtige Signalfluss von den Einhängen zum Ausgang hergestellt ist. Rückmeldung erst nach dem Bestätigen, ein Fehlversuch kostet Energie. Das blockt blindes Probieren.
- **Navigation** (Themenfeld 3, Zahlensysteme): einen Zielcode (ab Stufe 2 hexadezimal) ohne Live-Dezimalanzeige in Bits umrechnen und über Bit-Schalter einstellen. Die im Klassentest als zu schwer gemeldeten Hex-Aufgaben fängt jetzt der Hilfe-Button ab (Abschnitt 8).

**Werden ersetzt:**

- **Sensorik**, neu „Filter auswählen“ (Themenfeld 2, ersetzt den alten Tiefpassfilter): Ein Asteroid sendet auf einer zufälligen Frequenz (niedrig, mittel oder hoch). Die Person wählt den passenden Filtertyp, um diese Frequenz zu isolieren: Hochpass, Tiefpass oder Bandpass. Die Bauteilgrößen ergeben sich aus der Grenzfrequenz und sollen im Kopf lösbar sein.
  - Konstruktionshinweis fürs Kopfrechnen: Die exakte Formel `fc = 1 / (2·π·R·C)` ist mit dem 2·π unhandlich. Das Mini-Spiel nutzt die Faustformel `fc ≈ 0,16 / (R·C)` und bietet Bauteile in Zehnerstufen an (zum Beispiel R = 1 kΩ und C = 1 µF ergeben rund 160 Hz). So bleibt die Rechnung eine saubere Kopfrechnung.
  - Stufen (Vorschlag): Stufe 1 nur den Filtertyp zur Frequenz wählen. Stufe 2 zusätzlich ein Bauteil so wählen, dass die Grenzfrequenz passt. Stufe 3 Bandpass mit unterer und oberer Grenze.
- **Reaktor**, neu „Bauteile austauschen“ (ersetzt die alte kooperative Reaktanz-Kalibrierung): Ein offenes Panel zeigt mehrere verdrahtete Schaltsymbole. Eine Meldung nennt das defekte Bauteil, zum Beispiel „Tausche den defekten WIDERSTAND aus“. Die Person erkennt das richtige Schaltsymbol und tauscht es. Diese Station ist jetzt ein Einzelspiel.
  - Stufen (Vorschlag): Stufe 1 aus vier deutlich verschiedenen Symbolen das genannte wählen. Stufe 2 aus mehr und ähnlicheren Symbolen (etwa Widerstand, Kondensator, Spule, Diode, Transistor). Stufe 3 ist statt des Bauteils eine Funktion oder ein Defektbild genannt, aus dem das Bauteil zu erschließen ist.

Hinweis zur Kooperation: Mit dem Wegfall der alten Reaktor-Station gibt es keine Station mehr, die zwei Personen technisch zum Reden zwingt. Die Kooperation trägt jetzt der Hilfe-Button, die Joker-Abstimmung und das geteilte Hüllenziel mit Zuruf (so abgestimmt).

### Sonderfunktionen je Station (Menü B), Vorschlag

Jede Station besitzt genau einen strategischen Hebel. So lohnt es sich, an jeder Station gelegentlich (B) statt (A) zu wählen.

| Station | Sonderfunktion (B) | Wirkung |
| --- | --- | --- |
| Reaktor (Bauteile austauschen) | Energieschub | Sofort-Plus auf die geteilte Energie über den normalen Ladewert hinaus |
| Sensorik (Filter auswählen) | Asteroiden filtern | Für kurze Zeit schlagen weniger Asteroiden ein |
| Navigation (Zahlensysteme) | Kurskorrektur | Sofort-Schub auf den Fortschritt |
| Bordcomputer (logische Gatter) | Schadenskontrolle | Repariert ein Stück Hülle |

Damit deckt jede Station einen der vier Hebel ab: Energie, Asteroidenrate, Fortschritt, Hülle. Die Crew muss abwägen, welcher Hebel gerade fehlt.

## 8. Kooperation: der Hilfe-Button

Jede Station hat einen Hilfe-Button. Drückt eine Person ihn, wählt der Server zufällig eine andere gerade aktive Person aus. Diese bekommt auf ihrem Smartphone einen Hinweis eingeblendet, den sie der hilfesuchenden Person laut zuruft. Der Hinweis ist auf das Mini-Spiel der hilfesuchenden Person zugeschnitten, denn der Server kennt deren Aufgabe und Lösung.

Beispiele für Hinweise je Mini-Spiel (Vorschlag):

- Zahlensysteme: die ersten drei korrekten Bits der Lösung, oder bei einer Hex-Zahl deren Dezimalwert.
- Bauteile austauschen: das Schaltsymbol des gesuchten Bauteils in Worten (z. B. Beim Widerstand: "Leeres Rechteck").
- Filter auswählen: die Faustformel und die Zielfrequenz nennen.
- Bordcomputer: Erkläung des aktuell vorliegenden logischen Gatters (z. B. Beim AND-Gatter: "Beide Eingänge müssen an sein, damit der Ausgang an ist").

Gegen Dauergebrauch greift allein ein Cooldown (so abgestimmt): Nach einer Hilfe ist der Button für eine kurze Zeit gesperrt (Vorschlag: 20 Sekunden). Es kostet nichts, der Schritt bleibt also positiv besetzt. Der Hinweis geht bewusst über Zuruf von Mensch zu Mensch, nicht über den Bildschirm, weil das Reden in der Crew gewollt ist.

## 9. Joker-System

Über Menü (C) ruft eine Person die Crew zur Abstimmung. Jeder Spieler kann im gesamten Spiel maximal einmal zur Abstimmung aufrufen. Alle stimmen kurz am Smartphone innerhalb von 10 Sekunden  ab. Bei einfacher Mehrheit löst der Joker aus und repariert die Hülle ein Stück (Vorschlag: plus 25 Prozentpunkte). Die Abstimmung und das Abstimmungsergebnis wird live auf dem Beamer angezeigt. Die Zahl der Joker pro Spiel ist begrenzt (Vorschlag: 3 für einen vollen Lauf).

Der Joker lohnt sich nur, weil die Hülle beim Sektorwechsel ohnehin ein Stück repariert wird (Vorschlag: plus 15 Prozentpunkte). Daraus entsteht eine echte Abwägung für die Crew, wann der beste Zeitpunkt gekommen ist einen Joker einzusetzen.

## 10. Audio

Zwei Bereiche kommen dazu.

Erstens der **Zustand der Hülle**, über die schon vorhandenen Voice-Lines im Asset-Ordner. Heute liegen sie als `.wav` vor, sind aber nirgends eingebunden (das Manifest ist leer, und die Engine erwartet bisher cue-benannte `.mp3`). Sie werden als Cues verdrahtet:

- `AI_welcome`: beim Eintreffen in der Lobby oder beim Start.
- `AI_hull_low`: wenn die Hülle in den Warnbereich fällt (< 50%).
- `AI_hull_crit`: wenn die Hülle kritisch wird (< 10%).
- `AI_external_damage`: bei einem schweren Asteroidentreffer.

Dafür liest die Engine künftig auch `.wav`, das Manifest wird gepflegt, und die Stimmen werden gedrosselt, damit sie sich nicht überlagern oder zu oft auslösen.

Zweitens der **Fortschritt im Sektor**, über neue Cues: ein kurzer Ton bei Meilensteinen (Vorschlag: 50 Prozent und 95 Prozent) macht hörbar, wie weit der Sektor ist.

## 11. Lernerfolg sichtbar machen

Die Prüfungsaufgabe verlangt, den Lernerfolg sichtbar zu machen. Das Spiel zeigt ihn auf mehreren Ebenen, die ohne zusätzliche Datenerfassung auskommen: den Stationsstatus auf der Brücke, das persönliche Beitragskonto je Crewmitglied, den Punktestand und die Highscore-Liste am Ende. Die LK liest am Leitstand live mit, wer welche Station wie sicher löst.

Eine tiefere Datenerfassung (etwa Fehlerquoten je Themenfeld und Person für die Nachbesprechung) ist möglich, aber bewusst nicht Teil dieser Überarbeitung. Sie steht als optionaler späterer Schritt unter den offenen Punkten. Die schriftliche Reflexion zur Aufgabenstellung entsteht separat.

## 12. Stellschrauben (Vorschlagswerte)

Die folgenden Startwerte gehören gebündelt nach oben in `server/game.js` und werden in Paket P6 am Spiel justiert. Sie sind hier nur Ausgangspunkt.

- Asteroidenschaden je Treffer und Trefferrate
- Energie: Ladewert je Lösung (A), langsamer Schwund über die Zeit, Abzug je Fehlversuch
- Fortschritt: Tempo je Energiestufe
- Hülle: automatische Reparatur beim Sektorwechsel (plus 15), Joker-Reparatur (plus 25)
- Sonderfunktionen: Höhe des Energieschubs, Dauer der gesenkten Asteroidenrate, Höhe des Fortschritt-Schubs, Hüllen-Reparatur per Bordcomputer
- Joker: Anzahl je Spiel (3), Mehrheit (einfach)
- Hilfe-Button: Cooldown (20 Sekunden)
- Sektoren je Lauf

## 13. Was sich gegenüber dem alten Stand ändert

- Der Timer und der dauernde Stabilitätsverfall entfallen. An ihre Stelle tritt das Menü mit Energie, Hülle und Fortschritt.
- Die alte kooperative Reaktor-Kalibrierung entfällt. Der Reaktor wird zum Einzelspiel „Bauteile austauschen“.
- Der alte Tiefpassfilter entfällt. Die Sensorik wird zu „Filter auswählen“.
- Energie hängt nicht mehr an einer Reaktor-Kalibrierung, sondern an Weg (A) aller Stationen.
- Der Sektorwechsel ist nicht mehr automatisch, sondern wird von der LK ausgelöst.
- Die Hülle ist die einzige Niederlagebedingung, mit lesbarer Ursache.

Diese Änderungen brechen einen Teil der bestehenden Tests. Jedes Umsetzungspaket aktualisiert die betroffenen Tests mit.

## 14. Offene Punkte

- Genaue Zahlenbalance (Paket P6), geprüft über Komplettdurchläufe mit Bots für Sieg und Niederlage.
- Optionale Datenerfassung je Themenfeld und Person für die Nachbesprechung.
- Barrierearmut: Farbe nie als alleinige Information, ausreichend große Schrift auf dem Smartphone.