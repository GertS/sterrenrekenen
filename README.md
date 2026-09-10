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

## Mijn sterrenstad

Via **Mijn sterrenstad** in het hoofdmenu bouw je met dezelfde sterren die je met sommen verdient. Elke speler krijgt één startwoning; bestaande sterren en rekenvoortgang blijven behouden.

- Acht soorten tegels: woning (30), flat (60), park (20), politie (80), boerderij (50), akker (15), school (70) en bloementuin (25 sterren).
- Kies een tegel, tik op een vrij aangrenzend vak en bevestig met **Bouw voor …**. Pas bij bevestigen worden sterren afgeschreven en wordt de stad opgeslagen.
- Tik op een bestaande tegel en kies **Verplaatsen**. Dit is gratis; alle tegels moeten verbonden blijven. De wereld biedt 49 plekken.
- Wegen ontstaan vanzelf. Meer tegels brengen meer auto's en voetgangers. Met de pauzeknop zet je het verkeer stil; bij een voorkeur voor minder beweging begint het gepauzeerd.
- Sleep de wereld om rond te kijken. Gebruik +/− of het muiswiel om te zoomen, en ⌖ om de hele wereld te zien. Met pijltjestoetsen en Enter kun je ook een vak kiezen.
- Stad en sterren worden samen lokaal opgeslagen. Als opslaan niet lukt, wordt de aankoop niet uitgevoerd. **Voortgang wissen** wist ook de stad, na bevestiging.
- De nieuwe bestanden en gebouwillustraties zitten in de offlinecache. Bij een bestaande installatie kan een tweede keer openen nodig zijn om een beschikbare update te zien.

`city-model.js` bevat de bouwregels, `city.js` de winkel en geanimeerde wereld, en `assets/city-atlas.png` de gebouwillustraties. Er zijn geen externe runtimebibliotheken of online accounts nodig.

### Controles voor de stad

```bash
node tests/city-model.test.cjs
node tests/city-wallet.test.cjs
```

Dit controleert onder andere alle tegelprijzen, dubbele aankopen, onvoldoende saldo, verbonden wegen, gratis verplaatsen, een volle stad, laden van oudere voortgang en opslagfouten.

Voor browsercontroles kun je `tests/browser-city.html` openen via **localhost** op een lokale server. Die testpagina zet bewust testvoortgang klaar en is daarom gescheiden van de preview op **127.0.0.1**. Gebruik hem niet op een origin met voortgang die je wilt houden. De testpagina wordt niet vooraf offline opgeslagen.
