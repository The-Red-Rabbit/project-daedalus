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

Der Host am Beamer zeigt das Schiff, die geteilten Werte (Hülle, Energie, Fortschritt), den Stationsstatus, den Beitritts-QR und den Leitstand der Lehrkraft. Jede Person am Smartphone übernimmt eine Station und löst dort ein Mini-Spiel:

- Bordcomputer: das passende logische Gatter wählen, bis die Wahrheitstabelle stimmt.
- Sensorik: R und C so einstellen, dass die Kante des Tiefpassfilters die Zielmarke trifft.

Eine Station bleibt nur stabil, solange sie betreut wird, sonst verfällt sie und die Hülle leidet. Der Fortschritt steigt nur, wenn die Mehrheit der Stationen stabil ist. Volle Fortschrittsleiste bringt das Schiff in den nächsten Sektor; nach dem letzten Sektor folgt der Sieg, bei leerer Hülle die Niederlage. Über den Leitstand löst die Lehrkraft Asteroidenwellen aus, setzt die Grundschwierigkeit und startet nach dem Ende einen neuen Anlauf.

## Orientierung

- `CLAUDE.md`: Architektur, Konventionen und nächste Schritte. Erste Anlaufstelle.
- `docs/GAME_DESIGN.md`: Spielmechanik im Detail.
- `docs/VISUAL_DESIGN.md`: verbindlicher Kunststil.
- `docs/mockups/`: statische Mock-ups von Host und Controller.

Der Code ist bewusst schlank: Node mit `ws` als Server, reines JavaScript mit ES-Modulen im Browser, Canvas für die Host-Szene, Web Audio für den Ton. Kein Build-Schritt.
