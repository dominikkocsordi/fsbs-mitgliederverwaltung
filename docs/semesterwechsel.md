# Semesterwechsel: die Listen leeren

Jedes Semester kommen neue Bewerber. Die Bewerbungen des letzten Durchgangs
und die Anwärter, die daraus geworden sind, haben dann ihren Zweck erfüllt —
und die Einwilligung, die jeder Bewerber unterschrieben hat, sagt ohnehin,
dass die Angaben nach dem Verfahren verschwinden.

Zeile für Zeile wäre das eine halbe Stunde Klickarbeit. Auf `/anwaerter` und
`/bewerbungen` steht dafür ein **Alle löschen** in der Leiste — sichtbar nur
für den Vorstand.

---

## Einmal: das SQL laufen lassen

Im Supabase-SQL-Editor **`supabase/semester-zuruecksetzen.sql`** ausführen.
Das Skript ist wiederholbar und löscht selbst nichts: Es legt die beiden
Funktionen an, die das Portal aufruft.

Ohne das Skript bleiben die Seiten benutzbar; nur „Alle löschen“ meldet
dann, dass die Datenbank es noch nicht kennt.

---

## Die Kette

Hinter „Alle löschen“ steht kein „Wirklich?“, sondern drei Schritte:

1. **Sichern.** Die ganze Tabelle geht als CSV-Datei herunter — bei den
   Anwärtern mit allen Spalten, bei den Bewerbungen mit jeder Frage als
   eigener Spalte. Vorher lässt sich der Satz darunter gar nicht eintippen.
2. **Abtippen.** `ALLE ANWÄRTER LÖSCHEN` beziehungsweise
   `ALLE BEWERBUNGEN LÖSCHEN`, wortgleich. Ein Satz, der nicht aus Versehen
   entsteht.
3. **Löschen.** Erst jetzt lässt sich der rote Knopf anfassen.

Dieselben Bedingungen prüft die Datenbank noch einmal, denn ein Browser ist
kein Riegel:

* Es ruft der Vorstand. Sonst niemand.
* Der Satz stimmt wortgleich.
* Die Anzahl stimmt. Wer die Liste eben gesichert hat und dann löscht,
  löscht genau die Liste, die er gesichert hat — kommt in der Zwischenzeit
  eine Bewerbung herein, bricht es ab, und die Kette beginnt von vorn.

Zurückholen lässt sich nichts. **Die CSV-Datei ist die Sicherung.**

---

## Die Reihenfolge

Ein übernommener Bewerber steht mit seiner Kennung in der Anwärterliste.
Solange er dort steht, lässt sich seine Bewerbung nicht löschen — weder
einzeln noch im Ganzen. Am Semesterende geht deshalb zuerst `/anwaerter`,
danach `/bewerbungen`. Andersherum bricht das Löschen mit einem Hinweis ab
und ändert nichts.

Die **Fotos** liegen nicht in der Tabelle, sondern im Ordner `bewerbungen`.
Das Portal räumt sie beim Leeren mit weg. Bleibt dabei etwas liegen — weil
der Ordner gerade nicht erreichbar war —, steht es in der Konsole; die
Bewerbungen selbst sind dann trotzdem gelöscht.

---

## Nur exportieren, nicht löschen

Der Knopf **CSV** daneben tut genau das: Er schreibt die Liste, die gerade
zu sehen ist, in eine Datei — mit den Filtern, die eingestellt sind. Ihn
sieht auch die Ressortleitung. Er fragt nichts und löscht nichts, und er
lässt sich so oft drücken, wie jemand mag.

Der Unterschied zur Datei aus Schritt 1: Die hier folgt der Ansicht, jene
nimmt die ganze Tabelle — auch die Zeilen, die die Liste ausblendet.

---

## Was das Leeren nicht anfasst

* Die **Mitgliederliste** auf `/members`. Wer Vollmitglied geworden ist,
  steht dort in einer eigenen Zeile und bleibt davon unberührt.
* Die **Konten** auf `/nutzer`. Anwärter haben in aller Regel gar keines.
* Das **Formular** selbst — Fragen, Ressorts, Einwilligung, Frist. Es steht
  nach dem Leeren so da, wie es vorher stand, und kann sofort wieder
  aufmachen.
