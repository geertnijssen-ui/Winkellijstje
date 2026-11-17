# Winkellijstje

Een gedeelde boodschappenlijst voor twee iPhones en Google Home, automatisch gesorteerd per winkel.

- Alles wat je toevoegt komt eerst in **Algemeen**. Kies je één keer een winkel, dan komt dat product er **voortaan altijd** onder. Aanpassen kan altijd.
- Jullie maken zelf de winkels aan, met eigen kleur en volgorde.
- Wat de een toevoegt, ziet de ander **meteen**.

## Functies

1. **Slim invoeren**: autocomplete op wat jullie eerder kochten. "2 melk", "500g gehakt", "melk (lactosevrij)" worden netjes herkend.
2. **Geen dubbels**: staat melk er al op, dan gaat het aantal omhoog.
3. **Winkelmodus**: alleen de items van die winkel, grote vinkjes, afgevinkte items zakken naar "In je kar", met **Ongedaan maken**. Het scherm blijft aan.
4. **Afdelingen**: per winkel afdelingen in looprichting (groenten, zuivel, diepvries...), zodat je in één ronde klaar bent.
5. **Favorieten en vaste sets**: met één tik de "Weekboodschappen" op de lijst.
6. **Notitie per item**: "lactosevrij", "het blauwe pak".
7. **Wie heeft wat toegevoegd**: ook "via Siri" of "via Google Home".
8. **Melding**: staat je partner in de winkelmodus en jij voegt iets toe, dan krijgt die een push-melding.
9. **Werkt offline**: slecht bereik in de winkel? Alles werkt, wijzigingen worden later verstuurd.
10. **Meerdere winkels per product**: melk bij Colruyt én Aldi staat bij allebei, tot je het ergens afvinkt.

Plus: **Siri-snelkoppelingen** (toevoegen en voorlezen per winkel), **Google Home** via Google Keep, en een **Update-knopje** in de app zodat Netlify alleen bouwt als jij dat wilt.

## Hoe het in elkaar zit

```
iPhone (PWA, SvelteKit)  ──realtime──  Supabase (Postgres + login + live sync)
        │                                   │ trigger bij nieuw item (pg_net)
        └── /api/* op Netlify ◄─────────────┘ → web push naar wie in de winkel staat
              ▲            ▲
   Siri-snelkoppeling   keep-sync (Python) ◄── Google Keep ◄── "Hey Google, zet melk op..."
```

| Map | Wat |
| --- | --- |
| `src/routes` | schermen: lijst, winkelmodus, winkels, producten, favorieten, meer |
| `src/routes/api` | Siri/Keep-API, push-webhook, update-knop |
| `src/lib/app.svelte.ts` | app-status, offline wachtrij en realtime sync |
| `src/lib/parse.ts` | "2 melk" → aantal + naam (met tests) |
| `supabase/migrations` | volledig databaseschema met beveiliging per huishouden |
| `keep-sync/` | Google Keep-koppeling |
| `docs/` | installatie en uitleg |

## Aan de slag

1. [Installatie: Supabase, Netlify en de iPhones](docs/SETUP.md)
2. [Siri-snelkoppelingen](docs/SIRI.md)
3. [Google Home koppelen](docs/GOOGLE-HOME.md)
