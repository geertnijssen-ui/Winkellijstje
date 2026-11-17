#!/usr/bin/env python3
"""
Hulpje om een Google master token te halen voor gkeepapi.

Werkwijze (zie ook docs/GOOGLE-HOME.md):
  1. Open in je browser https://accounts.google.com/EmbeddedSetup en log in.
  2. Klik "Ik ga akkoord". De pagina blijft laden; dat is normaal.
  3. Open de ontwikkelaarstools > Application/Opslag > Cookies en kopieer de waarde van "oauth_token"
     (begint met "oauth2_4/").
  4. Draai: python get_master_token.py jij@gmail.com "oauth2_4/...."
"""
import sys

import gpsoauth

if len(sys.argv) != 3:
    sys.exit(__doc__)

email, oauth_token = sys.argv[1], sys.argv[2]
android_id = "0123456789abcdef"
res = gpsoauth.exchange_token(email, oauth_token, android_id)
token = res.get("Token")
if not token:
    sys.exit(f"Mislukt: {res}")
print("\nJe master token (zet dit in .env als GOOGLE_MASTER_TOKEN):\n")
print(token)
