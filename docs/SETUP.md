# Installatie

Reken op ongeveer 30 minuten. Je hebt nodig: een Supabase-account, een Netlify-account en deze GitHub-repo.

## 1. Supabase (database, login, live sync)

1. Maak op [supabase.com](https://supabase.com) een nieuw project. Kies als regio **Frankfurt (eu-central-1)**.
2. Ga naar **SQL Editor → New query**, plak de volledige inhoud van [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql) en klik **Run**.
3. Ga naar **Authentication → Sign In / Providers → Email**:
   - Laat **Email** aan.
   - Zet **Confirm email** uit als je geen bevestigingsmail wilt (makkelijker voor twee personen).
4. Noteer bij **Project Settings → API** (of **API Keys**):
   - de **Project URL** → `PUBLIC_SUPABASE_URL`
   - de **anon / publishable key** → `PUBLIC_SUPABASE_ANON_KEY`
   - de **service_role / secret key** → `SUPABASE_SERVICE_ROLE_KEY` (geheim, nooit in de app of in git!)

## 2. Sleutels voor push-meldingen

Op je eigen computer, in deze repo:

```bash
npm install
npx web-push generate-vapid-keys
```

- **Public Key** → `PUBLIC_VAPID_PUBLIC_KEY`
- **Private Key** → `VAPID_PRIVATE_KEY`
- Bedenk ook een lange willekeurige tekst voor `WEBHOOK_SECRET`, bv. met `openssl rand -hex 32`.

## 3. Netlify

1. **Add new project → Import an existing project → GitHub** en kies `winkellijstje`. De build-instellingen komen uit `netlify.toml`, je hoeft niets aan te passen.
2. Die eerste build wordt **overgeslagen**. Dat is de bedoeling: `netlify.toml` slaat elke build over die niet via de build hook komt. Zo kost een push naar GitHub je geen credits.
3. **Project configuration → Build & deploy → Continuous deployment → Build hooks → Add build hook**. Naam: `Update-knop`, branch: `main`. Kopieer de URL.
4. **Project configuration → Environment variables**, voeg toe:

   | Naam | Waarde |
   | --- | --- |
   | `PUBLIC_SUPABASE_URL` | uit stap 1 |
   | `PUBLIC_SUPABASE_ANON_KEY` | uit stap 1 |
   | `SUPABASE_SERVICE_ROLE_KEY` | uit stap 1 (geheim) |
   | `PUBLIC_VAPID_PUBLIC_KEY` | uit stap 2 |
   | `VAPID_PRIVATE_KEY` | uit stap 2 (geheim) |
   | `VAPID_SUBJECT` | `mailto:jouw@email.be` |
   | `WEBHOOK_SECRET` | uit stap 2 (geheim) |
   | `NETLIFY_BUILD_HOOK` | de build hook URL uit stap 3 |
   | `GITHUB_REPO` | `geertnijssen-ui/winkellijstje` |
   | `GITHUB_TOKEN` | zie hieronder (optioneel) |

   `GITHUB_TOKEN` laat het Update-knopje zien hoeveel nieuwe wijzigingen er op GitHub staan. Omdat de repo privé is, heb je een token nodig: GitHub → Settings → Developer settings → **Fine-grained tokens** → alleen deze repo → **Contents: Read-only**.

5. Start de eerste build met de build hook (terminal):

   ```bash
   curl -X POST -d '{}' "https://api.netlify.com/build_hooks/JOUW_HOOK_ID"
   ```

   Daarna doe je dit voortaan met het **Update**-knopje in de app (Meer → Update, onderaan).

> Let op: de `PUBLIC_...`-waarden worden tijdens de build in de app gezet. Pas je er een aan, dan moet je opnieuw bouwen.

## 4. Push-meldingen koppelen in Supabase

Supabase moet weten waar de app draait. Voer dit uit in de **SQL Editor** (vul je eigen site en geheim in):

```sql
insert into private.settings (key, value) values
  ('webhook_url', 'https://JOUW-SITE.netlify.app/api/hooks/item-added'),
  ('webhook_secret', 'DEZELFDE-WAARDE-ALS-WEBHOOK_SECRET')
on conflict (key) do update set value = excluded.value;
```

Er gaat alleen een melding uit als iemand anders op dat moment in de **winkelmodus** staat.

## 5. Op de iPhones zetten

1. Open je Netlify-adres in **Safari**.
2. Tik op **Deel** → **Zet op beginscherm**.
3. Open de app vanaf het beginscherm (niet in Safari, anders werken meldingen niet).
4. Jij: **Account maken** → **Nieuw huishouden**. Bij **Meer** zie je de uitnodigingscode.
5. Je vrouw: **Account maken** → **Meedoen met een code**.
6. Allebei: **Meer → Meldingen aanzetten**.
7. Daarna in Supabase: **Authentication → Sign In / Providers** → zet **Allow new users to sign up** uit. Dan kan niemand anders nog een account maken.

## 6. Extra's

- Siri: zie [SIRI.md](SIRI.md)
- Google Home: zie [GOOGLE-HOME.md](GOOGLE-HOME.md)

## Lokaal ontwikkelen

```bash
cp .env.example .env   # en vul in
npm install
npm run dev            # http://localhost:5173
npm test               # tests van de invoer-parser
npm run check          # typecheck
```

## Updates en Netlify-credits

- Een push naar GitHub start **geen** build (zie `ignore` in `netlify.toml`).
- In de app: **Meer → Update** (klein knopje onderaan). Je ziet welke wijzigingen er klaarstaan en kiest zelf of je bouwt.
- Is de build klaar, dan verschijnt bovenaan "Nieuwe versie klaar". Tik erop om te herladen.
- Wil je toch een push laten bouwen zonder knop: zet tijdelijk de omgevingsvariabele `FORCE_BUILD=true`.
