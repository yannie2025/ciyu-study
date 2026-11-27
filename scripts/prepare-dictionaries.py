"""Build offline word packs from the ECDICT basic CSV (UTF-8)."""
import csv
import json
import re
import sys
from pathlib import Path

project = Path(__file__).resolve().parent.parent
directory = project / "dictionaries"
directory.mkdir(exist_ok=True)
TAG_PACKS = ("cet4", "cet6", "ky", "ielts", "toefl", "gre", "gk")
packs = {"common": {}, **{k: {} for k in TAG_PACKS}}
form_types = {"p", "d", "i", "3", "r", "t", "s", "0"}

with Path(sys.argv[1]).open(encoding="utf-8-sig", newline="") as file:
    for row in csv.DictReader(file):
        term = row["word"].strip().lower()
        gloss = row["translation"].replace(r"\n", "\n").strip()
        if not re.fullmatch(r"[a-z][a-z '\-]{0,64}", term) or not re.search(r"[\u3400-\u9fff]", gloss):
            continue
        tags = row["tag"].split()
        ranks = [int(rank) for rank in (row["frq"], row["bnc"]) if rank.isdigit() and int(rank)]
        targets = [key for key in TAG_PACKS if key in tags]
        if ranks and min(ranks) <= 24000:
            targets.append("common")
        if not targets:
            continue
        phonetic = row["phonetic"].strip()[:100]
        lines = [value.strip() for value in gloss.splitlines() if value.strip()]
        meanings = [line for line in lines if not line.startswith("[网络]")] or lines
        forms = {}
        for field in row["exchange"].split("/"):
            label, _, value = field.partition(":")
            if label in form_types and re.fullmatch(r"[a-z][a-z '\-]{0,64}", value.strip().lower()):
                forms[label] = value.strip().lower()
        entry = [phonetic, "\n".join(meanings[:5])[:450], forms]
        for key in targets:
            packs[key].setdefault(term, entry)

for name, entries in packs.items():
    assert entries, name
    path = directory / (name + ".json")
    path.write_text(json.dumps(entries, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")
    print(name, len(entries), path.stat().st_size)
