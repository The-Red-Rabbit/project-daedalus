# Assets

Slots für spätere echte Grafiken und Klänge. Solange hier nichts liegt, erzeugt das Spiel die Grafik prozedural und den Ton synthetisch.

## audio/

Dateien nach Cue benannt, als `<cue>.mp3`:

- `ui.toggle.mp3`
- `ui.confirm.mp3`
- `ui.error.mp3`
- `station.stabilize.mp3`
- `alarm.asteroid.mp3`
- `impact.hull.mp3`
- `ambient.engine.mp3`
- `ambient.hum.mp3`
- `progress.tick.mp3`

Liegt eine Datei vor, nutzt die Audio-Engine sie automatisch statt der Synthese (siehe `client/audio.js`).

Welche Cues als Datei vorliegen, steht in `audio/manifest.json` (eine Liste der Cue-Namen). Die Engine fragt nur gelistete Cues ab, damit fuer fehlende Samples keine 404-Anfragen entstehen. Ein neues Sample also ablegen und seinen Cue-Namen in das Manifest eintragen, etwa:

```json
["ui.confirm", "alarm.asteroid"]
```

## sprites/

Platz für spätere Grafiken wie Schiff, Asteroiden und Panel-Texturen. Den Lade- und Zeichenpfad ergänzt der Renderer (`client/host/renderer.js`).

## Lizenz

Nur Material mit klarer, passender Lizenz ablegen und die Quelle dokumentieren.
