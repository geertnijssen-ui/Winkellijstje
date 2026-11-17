#!/usr/bin/env python3
"""
Google Keep <-> Winkellijstje

Google Home zet "Hey Google, zet melk op mijn boodschappenlijst" in een Google Keep-lijst.
Dit script:
  1. haalt nieuwe items uit die Keep-lijst en zet ze in de app (daar worden ze per winkel gesorteerd);
  2. vinkt in de app af wat je in Keep afvinkt;
  3. schrijft (optioneel) de lijst terug naar Keep, gesorteerd per winkel: "Colruyt: 2 melk",
     zodat Google Home de lijst per winkel voorleest.

LET OP: gkeepapi is een onofficiële bibliotheek. Google kan dit ooit breken.

Gebruik:
  python keep_sync.py            # één ronde
  python keep_sync.py --loop     # blijft draaien, elke INTERVAL seconden
  python keep_sync.py --dry-run  # alleen tonen wat er zou gebeuren
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from pathlib import Path

import gkeepapi
import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))
log = logging.getLogger("keep-sync")

STATE_FILE = Path(os.environ.get("STATE_FILE", Path(__file__).with_name(".keep_state.json")))
GENERAL = "Algemeen"


def env(name: str, default: str | None = None) -> str:
    value = os.environ.get(name, default)
    if not value:
        sys.exit(f"Ontbrekende instelling: {name} (zie .env.example)")
    return value


class App:
    def __init__(self, url: str, token: str):
        self.url = url.rstrip("/")
        self.s = requests.Session()
        self.s.headers["Authorization"] = f"Bearer {token}"

    def groups(self) -> tuple[list[dict], list[str]]:
        r = self.s.get(f"{self.url}/api/list", timeout=20)
        r.raise_for_status()
        data = r.json()
        return data["groups"], data["stores"]

    def add(self, text: str) -> None:
        r = self.s.post(f"{self.url}/api/items", json={"text": text, "source": "keep"}, timeout=20)
        r.raise_for_status()

    def check(self, ids: list[str]) -> None:
        if ids:
            r = self.s.post(f"{self.url}/api/check", json={"ids": ids}, timeout=20)
            r.raise_for_status()


def desired_lines(groups: list[dict]) -> list[tuple[str, str]]:
    """[(tekst, item_id)] in de volgorde waarin Google ze moet voorlezen."""
    lines = []
    for g in groups:
        for e in g["entries"]:
            text = f"{g['store']}: {e['label']}"
            if e.get("note"):
                text += f" ({e['note']})"
            lines.append((text, e["id"]))
    return lines


def is_ours(text: str, prefixes: set[str]) -> bool:
    head, sep, _ = text.partition(": ")
    return bool(sep) and head.strip().lower() in prefixes


def find_list(keep: gkeepapi.Keep, title: str):
    want = title.strip().lower()
    for node in keep.all():
        if isinstance(node, gkeepapi.node.List) and not node.trashed and not node.deleted:
            if (node.title or "").strip().lower() == want:
                return node
    return None


def sync_once(keep: gkeepapi.Keep, app: App, title: str, write_back: bool, dry: bool) -> None:
    keep.sync()
    glist = find_list(keep, title)
    if glist is None:
        log.warning("Geen Keep-lijst met titel %r gevonden. Zeg eerst eens iets tegen Google Home.", title)
        return

    groups, stores = app.groups()
    prefixes = {s.lower() for s in stores} | {GENERAL.lower()}
    current = {text: item_id for text, item_id in desired_lines(groups)}

    changed = False
    to_check: list[str] = []
    for item in list(glist.items):
        text = (item.text or "").strip()
        if not text:
            item.delete()
            changed = True
            continue
        if is_ours(text, prefixes):
            if item.checked and text in current:
                to_check.append(current[text])
                log.info("afgevinkt in Keep: %s", text)
            if item.checked or text not in current:
                if not dry:
                    item.delete()
                changed = True
            continue
        # nieuw, ingesproken via Google Home
        if not item.checked:
            log.info("nieuw via Google Home: %s", text)
            if not dry:
                app.add(text)
        if not dry:
            item.delete()
        changed = True

    if to_check and not dry:
        app.check(to_check)

    if write_back:
        if changed and not dry:
            groups, stores = app.groups()
        want = [text for text, _ in desired_lines(groups)]
        have = [i.text.strip() for i in glist.items if not i.checked and is_ours((i.text or "").strip(), prefixes)]
        if have != want:
            log.info("Keep-lijst herschrijven (%d regels)", len(want))
            if not dry:
                for i in list(glist.items):
                    if is_ours((i.text or "").strip(), prefixes):
                        i.delete()
                # hoogste sort-waarde staat bovenaan in Keep
                base = 10_000_000
                for n, text in enumerate(want):
                    glist.add(text, False, base - n * 1000)
            changed = True

    if changed and not dry:
        keep.sync()


def login() -> gkeepapi.Keep:
    keep = gkeepapi.Keep()
    state = None
    if STATE_FILE.exists():
        try:
            state = json.loads(STATE_FILE.read_text())
        except Exception:  # noqa: BLE001
            state = None
    keep.authenticate(env("GOOGLE_EMAIL"), env("GOOGLE_MASTER_TOKEN"), state=state, sync=False)
    return keep


def save_state(keep: gkeepapi.Keep) -> None:
    try:
        STATE_FILE.write_text(json.dumps(keep.dump()))
    except Exception as e:  # noqa: BLE001
        log.debug("state niet bewaard: %s", e)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--loop", action="store_true", help="blijf draaien")
    parser.add_argument("--dry-run", action="store_true", help="niets wijzigen, alleen tonen")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(asctime)s %(message)s")

    app = App(env("APP_URL"), env("APP_TOKEN"))
    title = os.environ.get("KEEP_LIST_TITLE", "Boodschappenlijst")
    write_back = os.environ.get("WRITE_BACK", "true").lower() in ("1", "true", "yes", "ja")
    interval = int(os.environ.get("INTERVAL", "60"))

    keep = login()
    while True:
        try:
            sync_once(keep, app, title, write_back, args.dry_run)
            save_state(keep)
        except gkeepapi.exception.ResyncRequiredException:
            log.warning("Keep vraagt een volledige resync")
            keep.sync(resync=True)
        except Exception as e:  # noqa: BLE001
            log.error("ronde mislukt: %s", e)
            if not args.loop:
                raise
            time.sleep(min(interval * 5, 600))
            try:
                keep = login()
            except Exception as e2:  # noqa: BLE001
                log.error("opnieuw inloggen mislukt: %s", e2)
        if not args.loop:
            break
        time.sleep(interval)


if __name__ == "__main__":
    main()
