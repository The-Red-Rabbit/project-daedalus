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

## Orientierung

- `CLAUDE.md`: Architektur, Konventionen und nächste Schritte. Erste Anlaufstelle.
- `docs/GAME_DESIGN.md`: Spielmechanik im Detail.
- `docs/VISUAL_DESIGN.md`: verbindlicher Kunststil.
- `docs/mockups/`: statische Mock-ups von Host und Controller.

Der Code ist bewusst schlank: Node mit `ws` als Server, reines JavaScript mit ES-Modulen im Browser, Canvas für die Host-Szene, Web Audio für den Ton. Kein Build-Schritt.
