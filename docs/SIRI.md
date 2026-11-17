# Siri-snelkoppelingen

Met een snelkoppeling zeg je "Hé Siri, winkellijst" en daarna "melk en brood". Het gaat rechtstreeks naar de app, zonder Google Keep.

## Sleutel maken

In de app: **Meer → Siri en Google Home → Maak sleutel** (bv. "Siri Geert"). Kopieer de sleutel (`wl_...`). Je ziet hem maar één keer. Elk van jullie maakt best een eigen sleutel, dan zie je in de app wie iets toevoegde.

## Snelkoppeling 1: iets toevoegen

Open **Opdrachten** (Shortcuts) → **+** en voeg deze stappen toe:

1. **Vraag om invoer**: type *Tekst*, vraag *Wat moet er op de lijst?*
2. **Haal inhoud op van URL**:
   - URL: `https://JOUW-SITE.netlify.app/api/items`
   - Tik op het pijltje: **Methode** `POST`
   - **Headers**: `Authorization` = `Bearer wl_JOUW_SLEUTEL`
   - **Request body**: *JSON*, veld `text` (tekst) = *Gevraagde invoer*
3. **Haal woordenboekwaarde op**: *Waarde* voor sleutel `message` in *Inhoud van URL*
4. **Spreek tekst uit** (of **Toon melding**): *Woordenboekwaarde*

Noem de snelkoppeling **Winkellijst**. Zeg dan: "Hé Siri, winkellijst" → "twee melk en brood".

Wat werkt: meerdere items met komma of "en", aantallen ("2 melk", "500 gram gehakt") en een notitie tussen haakjes als je typt.

## Snelkoppeling 2: wat moet ik kopen?

1. **Haal inhoud op van URL**: `https://JOUW-SITE.netlify.app/api/list?format=text&token=wl_JOUW_SLEUTEL`
2. **Spreek tekst uit**: *Inhoud van URL*

Per winkel: voeg `&store=Colruyt` toe, of zet er een **Kies uit menu** met je winkels voor. Noem hem bv. "Wat moet ik kopen".

## API in het kort

| Wat | Aanroep |
| --- | --- |
| Toevoegen | `POST /api/items` met `{"text": "melk, 2 brood"}` |
| Lijst (JSON) | `GET /api/list` |
| Lijst (tekst) | `GET /api/list?format=text` |
| Eén winkel | `GET /api/list?format=text&store=Aldi` |
| Afvinken | `POST /api/check` met `{"ids": ["..."]}` |

De sleutel gaat mee als header `Authorization: Bearer wl_...` of als `?token=wl_...`.
