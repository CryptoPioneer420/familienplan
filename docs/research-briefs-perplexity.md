# Hand-off Phase 2: Perplexity-Briefs und Interview (Paphos)

Stand: 2026-10-04 · gehört zu `prd-v3-hosted-pwa.md` (Anhang A/B) · Region: Paphos, Zypern

## So gehst du vor
1. Pro Brief einen **eigenen Deep-Research-Lauf** in Perplexity starten. Brief-Text 1:1 aus dem Codeblock kopieren (Vorspann ist schon enthalten).
2. Ergebnis als Markdown exportieren oder den Text samt JSON-Block kopieren. Dann hier im Chat anhängen/einfügen und den Briefnamen dazuschreiben (z. B. „A3 Ergebnis").
3. Reihenfolge nach Nutzen: **A1a → A3 → A5 → A2 → A1b → A4**. Die ersten drei reichen für den Pilot mit 20 Komponenten.
4. Zahlen ohne Quelle werfe ich beim Import weg. Dass Perplexity „nicht gefunden" schreibt, ist ein gutes Ergebnis, kein Fehler.

Geschätzter Aufwand: ca. 10 Min pro Lauf für dich, plus Wartezeit [Vermutung].

---

## Vorspann (steckt in jedem Brief, nur zur Info)
```
Antworte auf Deutsch. Region: Zypern, Stadt: Paphos. Liefere jede Aussage mit Quellen-URL und Abrufdatum. Wenn du etwas nicht findest, schreibe „nicht gefunden" statt zu schätzen. Keine Nährwerte aus dem Gedächtnis; Nährwerte nur mit Quelle (Hersteller, Etikett, USDA, nationale Datenbank). Gib am Ende zusätzlich einen JSON-Block im genannten Format aus. Maximal 40 Zeilen pro Lauf.
```

---

## A1a Händlerlandschaft Paphos und Verfügbarkeit Proteinquellen
```
Antworte auf Deutsch. Region: Zypern, Stadt: Paphos. Liefere jede Aussage mit Quellen-URL und Abrufdatum. Wenn du etwas nicht findest, schreibe „nicht gefunden" statt zu schätzen. Keine Nährwerte aus dem Gedächtnis; Nährwerte nur mit Quelle (Hersteller, Etikett, USDA, nationale Datenbank). Gib am Ende zusätzlich einen JSON-Block im genannten Format aus. Maximal 40 Zeilen pro Lauf.

Aufgabe: (1) Welche Supermarktketten, Metzgereien, Fischhändler und Wochenmärkte gibt es in Paphos und Umgebung (Kato Paphos, Chloraka, Geroskipou, Peyia, Universal)? Nenne Name, Ort/Stadtteil, Art, Besonderheiten (z. B. Frischfisch-Theke, Bio, Lieferservice), Quelle. (2) Prüfe für diese Proteinquellen, ob sie in Paphos verfügbar sind (ja/nein/saisonal), wo, lokaler Produktname, griechische Bezeichnung und Preisband in €/kg: Anari, Halloumi (auch fettreduziert), Schafjoghurt, Ziegenjoghurt, Skyr, Magerquark, Hüttenkäse, Hähnchenbrust, Pute, mageres Rinderhack, Lamm, Ziege, Lavraki (Wolfsbarsch), Tsipoura (Dorade), Oktopus, Thunfisch in Dosen, Sardinen, Eier, Tofu, Whey- und Casein-Pulver (Marken, Verfügbarkeit vor Ort oder Onlineversand nach Zypern).

JSON-Format: {"ingredient": "", "available": "yes|no|seasonal", "where": "", "productNameLocal": "", "nameEl": "", "priceBandEurPerKg": "", "sourceUrl": "", "retrievedAt": ""}
Für Händler: {"name": "", "area": "", "type": "supermarket|butcher|fishmonger|market|other", "notes": "", "sourceUrl": "", "retrievedAt": ""}
```

## A1b Verfügbarkeit Kohlenhydrate, Gemüse, Sonstiges
```
Antworte auf Deutsch. Region: Zypern, Stadt: Paphos. Liefere jede Aussage mit Quellen-URL und Abrufdatum. Wenn du etwas nicht findest, schreibe „nicht gefunden" statt zu schätzen. Keine Nährwerte aus dem Gedächtnis; Nährwerte nur mit Quelle (Hersteller, Etikett, USDA, nationale Datenbank). Gib am Ende zusätzlich einen JSON-Block im genannten Format aus. Maximal 40 Zeilen pro Lauf.

Aufgabe: Prüfe für diese Zutaten in Paphos, ob sie verfügbar sind (ja/nein/saisonal), wo (Kette oder Markt), lokaler Produktname, griechische Bezeichnung, Preisband in €/kg: Haferflocken, Vollkornreis, Basmatireis, Bulgur, Quinoa, Vollkornnudeln, Kartoffeln, Süßkartoffeln, Kolokasi (Taro), Kichererbsen (Dose und trocken), Linsen, schwarze Bohnen, Frischkornmischungen/Müsli ohne Zucker, Walnüsse, Mandeln, Tahini, Olivenöl (lokale Marken), TK-Beeren, Spinat, Brokkoli, Zucchini, Aubergine, Tomaten, Gurken, Avocado, Zitronen, Orangen, Bananen, Datteln.

JSON-Format: {"ingredient": "", "available": "yes|no|seasonal", "where": "", "productNameLocal": "", "nameEl": "", "priceBandEurPerKg": "", "sourceUrl": "", "retrievedAt": ""}
```

## A2 Saisonkalender Obst, Gemüse, Kräuter, Fisch
```
Antworte auf Deutsch. Region: Zypern, Stadt: Paphos. Liefere jede Aussage mit Quellen-URL und Abrufdatum. Wenn du etwas nicht findest, schreibe „nicht gefunden" statt zu schätzen. Keine Nährwerte aus dem Gedächtnis; Nährwerte nur mit Quelle (Hersteller, Etikett, USDA, nationale Datenbank). Gib am Ende zusätzlich einen JSON-Block im genannten Format aus. Maximal 40 Zeilen pro Lauf.

Aufgabe: Saisonkalender für Obst, Gemüse, Kräuter und Fisch auf Zypern (Monate 1–12) mit lokalen Namen auf Deutsch, Englisch und Griechisch. Bei Fisch zusätzlich: Zucht oder Wildfang, bekannte Schonzeiten oder Fangbeschränkungen auf Zypern. Priorität: Zutaten, die für eiweißreiche, kindgerechte Familiengerichte relevant sind. Bei mehr als 40 Einträgen in zwei Läufe teilen (Obst/Gemüse, dann Fisch/Kräuter).

JSON-Format: {"item": "", "nameEl": "", "months": [1,2,3], "farmedOrWild": "", "note": "", "sourceUrl": "", "retrievedAt": ""}
```

## A3 Traditionelle zypriotische Gerichte als Kandidaten
```
Antworte auf Deutsch. Region: Zypern, Stadt: Paphos. Liefere jede Aussage mit Quellen-URL und Abrufdatum. Wenn du etwas nicht findest, schreibe „nicht gefunden" statt zu schätzen. Keine Nährwerte aus dem Gedächtnis; Nährwerte nur mit Quelle (Hersteller, Etikett, USDA, nationale Datenbank). Gib am Ende zusätzlich einen JSON-Block im genannten Format aus. Maximal 40 Zeilen pro Lauf.

Aufgabe: Nenne 30 traditionelle zypriotische Gerichte, die sich für eine eiweißreiche, ausgewogene Familienküche eignen (Beispiele: Souvla, Kleftiko, Afelia, Fasolada, Louvi, Koupepia, Kolokasi-Gerichte mit Schwein oder Huhn, Fisch vom Grill, Meze-Komponenten, Halloumi- und Anari-Gerichte). Pro Gericht: typische Zutatenliste mit Mengen pro Portion in Gramm, Zubereitungsart (Grill, Ofen, Schmoren, Kochen), typische Eiweiß-/Fettstruktur (qualitativ: hoch/mittel/niedrig, keine erfundenen Zahlen), Anpassbarkeit (eiweißreicher machen, fettärmer machen, kindgerecht ohne Schärfe, Thermomix/Varoma-tauglich), Quelle. Wichtig: KEINE Anleitungstexte wörtlich übernehmen, nur Zutaten und Eckdaten.

JSON-Format: {"dish": "", "nameEl": "", "ingredientsPerPortion": [{"name": "", "grams": 0}], "method": "", "proteinFat": "high|medium|low", "adaptNotes": "", "sourceUrl": "", "retrievedAt": ""}
```

## A4 Einkaufsvokabular Griechisch
```
Antworte auf Deutsch. Region: Zypern, Stadt: Paphos. Liefere jede Aussage mit Quellen-URL und Abrufdatum. Wenn du etwas nicht findest, schreibe „nicht gefunden" statt zu schätzen. Keine Nährwerte aus dem Gedächtnis; Nährwerte nur mit Quelle (Hersteller, Etikett, USDA, nationale Datenbank). Gib am Ende zusätzlich einen JSON-Block im genannten Format aus. Maximal 40 Zeilen pro Lauf.

Aufgabe: Metzger- und Fischhändler-Vokabular auf Griechisch (zypriotischer Gebrauch, wo er abweicht), damit eine deutschsprachige Käuferin präzise bestellen kann: Fleischschnitte (Lamm, Ziege, Schwein, Huhn, Rind), Teilstücke für Souvla, Kleftiko und Grill, Fischarten (Lavraki, Tsipoura, Sargos, Barbounia, Oktopus, Kalamari, Garides), Zubereitungswünsche (entgrätet, ausgenommen, in Scheiben, durchgedreht), Mengenangaben (Kilo, Okka falls noch üblich). Pro Eintrag: Griechisch, Transliteration, Deutsch, Verwendung.

JSON-Format: {"termEl": "", "transliteration": "", "de": "", "usage": "", "sourceUrl": ""}
```

## A5 Etiketten lokaler Produkte
```
Antworte auf Deutsch. Region: Zypern, Stadt: Paphos. Liefere jede Aussage mit Quellen-URL und Abrufdatum. Wenn du etwas nicht findest, schreibe „nicht gefunden" statt zu schätzen. Keine Nährwerte aus dem Gedächtnis; Nährwerte nur mit Quelle (Hersteller, Etikett, USDA, nationale Datenbank). Gib am Ende zusätzlich einen JSON-Block im genannten Format aus. Maximal 40 Zeilen pro Lauf.

Aufgabe: Nährwertangaben pro 100 g (kcal, Eiweiß, Fett, Kohlenhydrate, Ballaststoffe) für lokal erhältliche Produkte, direkt von Herstellerseiten oder Online-Shops der Händler in Zypern: Anari, Halloumi (normal, light), Schafjoghurt, Ziegenjoghurt, Griechischer Joghurt (Marken im Handel), Skyr- und Quark-Marken, Protein-Joghurts, Hüttenkäse, Frischkornmischungen, Proteinriegel nur falls im Handel gängig. Pro Eintrag Marke, Produktname, Verpackungsgröße, Werte und die exakte Quellen-URL. Nur Angaben, die auf einem Etikett oder einer Herstellerseite stehen.

JSON-Format: {"product": "", "brand": "", "packSizeG": 0, "per100g": {"kcal": 0, "proteinG": 0, "fatG": 0, "carbsG": 0, "fiberG": 0}, "sourceUrl": "", "retrievedAt": ""}
```

---

## Interview mit deiner Frau (30 Min)
Stell die Fragen offen, ohne die App vorab zu erklären, und schick mir die Antworten stichpunktartig. Es gibt keine falschen Antworten; „würde ich nie nutzen" ist die wertvollste.

1. Welches Smartphone hat sie, und wie viel nutzt sie WhatsApp? Würde sie eine App auf den Home-Bildschirm legen?
2. Wie plant und kauft sie heute ein (Zettel, Notizen-App, andere Apps)? Wie oft pro Woche, wo?
3. Was nervt am aktuellen Ablauf am meisten?
4. Soll sie in der App nur lesen und abhaken, oder auch Gerichte tauschen und vorschlagen dürfen?
5. Was isst die Tochter gern, was nie? Gibt es Allergien oder No-Gos? Wie läuft „dekonstruiert" im Alltag?
6. Welches Thermomix-Modell (TM5/TM6/TM7)? Nutzt sie Cookidoo aktiv? Lieblingsgerichte? Wie viel Zeit hat sie werktags zum Kochen? Gibt es einen Meal-Prep-Tag?
7. Wo kauft sie Fisch und Fleisch, und was ist dort regelmäßig nicht verfügbar?
8. Was würde sie an so einer App nie nutzen?

## Parallel für dich (Phase 1)
- Privates GitHub-Repo `familienplan` anlegen (leer, ohne README) und GitHub mit Claude verbinden, damit ich pushen kann.
- Den alten Cloudflare-API-Token widerrufen (Dashboard → My Profile → API Tokens → Token löschen).
