# Google Home koppelen

Google laat geen eigen spraakapps meer toe op Google Home. Wat wel werkt: "Hey Google, zet melk op mijn boodschappenlijst" komt in een **Google Keep**-lijst terecht. Het script in [`keep-sync/`](../keep-sync) haalt die items op en zet ze in de app.

> **Let op:** het script gebruikt [gkeepapi](https://github.com/kiwiz/gkeepapi), een **onofficiële** bibliotheek. Er is geen officiële Keep-API voor gewone Google-accounts. Het werkt al jaren, maar Google kan het ooit breken. De app zelf blijft dan gewoon werken, alleen de spraak via Google Home niet.

## Hoe het werkt

1. Je zegt: "Hey Google, zet melk op mijn boodschappenlijst".
2. Google zet "melk" in de Keep-lijst **Boodschappenlijst**.
3. Het script ziet dat (elke minuut), zet "melk" in de app (met *via Google Home* erbij) en haalt het uit Keep.
4. In de app komt melk onder de winkel waar jullie het altijd kopen, of onder **Algemeen**.
5. Met `WRITE_BACK=true` schrijft het script de hele lijst terug naar Keep, gesorteerd per winkel:
   `Algemeen: kaas`, `Colruyt: 2 melk`, `Aldi: batterijen`.
   Vraag je "Hey Google, wat staat er op mijn boodschappenlijst?", dan leest Google alles per winkel voor.
6. Vink je in Keep iets af, dan wordt het ook in de app afgevinkt.

## 1. Google Home op Keep zetten

Google Home-app → je profiel → **Assistent-instellingen** → **Notities en lijsten** → kies **Google Keep**. Zeg één keer iets op je boodschappenlijst zodat de lijst bestaat. Kijk in Keep hoe de lijst heet (in het Nederlands meestal **Boodschappenlijst**) en zet die naam in `KEEP_LIST_TITLE`.

## 2. Master token ophalen

gkeepapi heeft een "master token" van je Google-account nodig. Dat is zo krachtig als je wachtwoord: deel het met niemand en zet het nooit in git.

1. Ga in een browser naar https://accounts.google.com/EmbeddedSetup en log in met het Google-account van Google Home.
2. Klik op **Ik ga akkoord**. De pagina blijft daarna hangen; dat is normaal.
3. Open de ontwikkelaarstools (F12) → **Application** (Chrome) of **Opslag** (Firefox) → **Cookies** → `accounts.google.com`, en kopieer de waarde van **oauth_token** (begint met `oauth2_4/`).
4. Wissel dat binnen enkele minuten om:

   ```bash
   cd keep-sync
   python3 -m venv .venv && . .venv/bin/activate
   pip install -r requirements.txt
   python get_master_token.py jij@gmail.com "oauth2_4/...."
   ```

5. Je krijgt een token dat begint met `aas_et/`. Dat is `GOOGLE_MASTER_TOKEN`.

Werkt dit niet meer (Google verandert dit soms), kijk dan in de [gkeepapi-documentatie](https://gkeepapi.readthedocs.io/) voor de actuele manier.

## 3. Instellen en testen

```bash
cd keep-sync
cp .env.example .env     # en vul in; APP_TOKEN maak je in de app bij Meer → Maak sleutel
python keep_sync.py --dry-run -v   # toont wat er zou gebeuren
python keep_sync.py                # één echte ronde
```

## 4. Laten draaien

Het script moet ergens elke minuut draaien. Opties, van best naar minst:

**Raspberry Pi, NAS of thuisserver** (aanrader, gratis en altijd aan):

```bash
# met systemd
sudo cp keep-sync.service /etc/systemd/system/   # pas pad en gebruiker aan
sudo systemctl enable --now keep-sync
journalctl -u keep-sync -f

# of met Docker
docker build -t keep-sync .
docker run -d --name keep-sync --restart=always --env-file .env -v keep-data:/data keep-sync
```

**Gratis cloud-VM**, bv. Google Cloud e2-micro (always free) of Oracle Cloud free tier: zelfde stappen als hierboven.

**GitHub Actions** kan ook, maar minstens om de 5 minuten en vaak met vertraging. Voor een privé-repo verbruikt dat bovendien snel je gratis minuten. Daarom niet aangeraden.

## Beperkingen

- Google kan niet "wat moet ik bij Colruyt kopen?" beantwoorden. Met `WRITE_BACK` leest hij wel alles netjes per winkel voor. Per winkel vragen kan wel via Siri (zie [SIRI.md](SIRI.md)).
- Het duurt tot een minuut voor een ingesproken item in de app staat.
