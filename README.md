# SterrenRekenen

Een zelfstandige rekentrainer/PWA voor kinderen van ongeveer 7–9 jaar. De app werkt zonder account, backend, tracking of externe libraries.

## Bestanden

- `index.html` – schermen en HTML-structuur
- `style.css` – tabletvriendelijke vormgeving en animaties
- `math.js` – zuivere somgeneratoren
- `app.js` – sterren, voortgang, geluid, antwoordcontrole en navigatie
- `games.js` – vijf minigames
- `manifest.json` – PWA-instellingen
- `service-worker.js` – offline-cache
- `icons/` – app-iconen voor Android/PWA
- `.nojekyll` – laat GitHub Pages de bestanden rechtstreeks publiceren

## Lokaal testen

Dubbelklikken op `index.html` is genoeg om de basisapp te openen, maar een service worker/PWA-installatie werkt alleen via HTTP(S).

Aanbevolen test:

```bash
cd rekentrainer
python3 -m http.server 8000
```

Open daarna `http://localhost:8000` in Chrome of Firefox.

## Android-tablet

1. Publiceer de map via HTTPS, bijvoorbeeld met GitHub Pages.
2. Open de site in Chrome op de Android-tablet.
3. Open het Chrome-menu en kies **App installeren** of **Toevoegen aan startscherm** (de precieze tekst kan per Chrome-versie verschillen).
4. Start SterrenRekenen daarna via het nieuwe pictogram op het beginscherm.
5. Open de app eenmaal terwijl internet beschikbaar is. Daarna staan de appbestanden in de offline-cache.

## GitHub Pages

1. Maak op GitHub een nieuwe repository, bijvoorbeeld `sterrenrekenen`.
2. Upload **de inhoud van deze map** naar de hoofdmap van de repository.
3. Open in de repository **Settings → Pages**.
4. Kies bij **Build and deployment → Source**: **Deploy from a branch**.
5. Kies branch **main** en map **/(root)** en sla op.
6. Wacht tot GitHub de Pages-site heeft gepubliceerd; de URL verschijnt bij Pages.
7. Zet **Enforce HTTPS** aan als die optie wordt getoond.
8. Open de gepubliceerde URL op de tablet en installeer de PWA via Chrome.

## Opmerking over updates

De service worker gebruikt een cachenaam (`sterrenrekenen-v1.0.0`). Als je later bestanden sterk wijzigt en een nieuwe versie direct wilt forceren, verander dan die naam bijvoorbeeld in `sterrenrekenen-v1.0.1`.
