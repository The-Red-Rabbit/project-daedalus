# project-daedalus

Project Daedalus is a cooperative learning game for media science.

Daedalus ist ein kooperatives digitales Lernspiel für das Fach Medientechnik (Einführungsphase). Die Klasse navigiert gemeinsam ein Raumschiff durch ein Asteroidenfeld und löst dabei Mini-Spiele, die Unterrichtsinhalte sichern.

## Start

```bash
npm install
npm start
```

Danach im Browser öffnen:

- Host (Laptop am Beamer): http://localhost:3000/host
- Controller (Smartphone): http://localhost:3000/controller

Im selben WLAN verbinden sich die Smartphones über den QR-Code, den der Host anzeigt.

Tests laufen mit `npm test` (reine Logik, ohne zusätzliche Abhängigkeiten).

## Spielen

Der Host am Beamer zeigt das Schiff, die geteilten Werte (Hülle, Energie, Fortschritt), den Stationsstatus mit Besatzung, den Beitritts-QR und den Leitstand der Lehrkraft. Wer beitritt, gibt im Smartphone einen Namen ein. Der Server weist die Rolle selbst zu: Operator einer freien Station oder, wenn alle besetzt sind, Co-Pilot, der einer Station zuarbeitet. So wartet niemand. Drei Stationen mit je einem Mini-Spiel:

- Bordcomputer: das passende logische Gatter wählen, bis die Wahrheitstabelle stimmt.
- Sensorik: R und C so einstellen, dass die Kante des Tiefpassfilters die Zielmarke trifft.
- Navigation: einen Zielcode über Bit-Schalter im Dualsystem nachbauen.

Eine Station bleibt nur stabil, solange sie betreut wird, sonst verfällt sie und die Hülle leidet. Der Fortschritt steigt nur, wenn die Mehrheit der besetzten Stationen stabil ist. Volle Fortschrittsleiste bringt das Schiff in den nächsten Sektor und lässt die Rollen rotieren; nach dem letzten Sektor folgt der Sieg, bei leerer Hülle die Niederlage. Über den Leitstand löst die Lehrkraft Asteroidenwellen aus, setzt die Grundschwierigkeit, schaltet den Ton ein und startet mit „Runde neu“ einen neuen Anlauf. Fällt ein Smartphone kurz aus dem WLAN, verbindet es sich von selbst wieder und tritt mit demselben Namen bei.

## Im Unterricht einsetzen

1. Laptop und Beamer ins Klassen-WLAN bringen, `npm start` ausführen und `/host` am Beamer öffnen.
2. Einmal auf „Ton an“ tippen (Browser geben Audio erst nach einer Eingabe frei).
3. Die Lernenden scannen den QR-Code, geben ihren Namen ein und treten bei. Mehr Personen als Stationen sind erwünscht, die zusätzlichen werden Co-Piloten.
4. Grundschwierigkeit am Leitstand wählen. Während des Spiels justiert sich die Stufe pro Person nach dem Tempo.
5. Mit „Asteroidenwelle“ Druck erzeugen, mit „Runde neu“ einen frischen Durchlauf starten.

Hinweis: alles läuft im lokalen WLAN, ohne Internet und ohne Konten. Es genügt ein Raum (ein Server) für eine Klasse.

## Orientierung

- `CLAUDE.md`: Architektur, Konventionen und nächste Schritte. Erste Anlaufstelle.
- `docs/GAME_DESIGN.md`: Spielmechanik im Detail.
- `docs/VISUAL_DESIGN.md`: verbindlicher Kunststil.
- `docs/mockups/`: statische Mock-ups von Host und Controller.

Der Code ist bewusst schlank: Node mit `ws` als Server, reines JavaScript mit ES-Modulen im Browser, Canvas für die Host-Szene, Web Audio für den Ton. Kein Build-Schritt.
