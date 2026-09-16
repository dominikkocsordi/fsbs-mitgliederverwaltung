# Die Sicherheitsprüfung einrichten

Das Bewerbungsformular kann vor dem Absenden ein Captcha verlangen. Bis
das eingerichtet ist, bleibt es aus, und am Formular ändert sich nichts.

Dasselbe gilt für das Formular unter `portal.fsbs-hm.de/rechnung`. Es
braucht dafür keine eigenen Schlüssel — steht hier erst einmal ein
Widget, benutzt es dieselben. Wie es eingeschaltet wird, steht am Ende
dieser Seite unter [Das zweite Formular](#das-zweite-formular).

Geprüft wird das Token **in der Datenbank**, nicht im Browser:
`bewerbung_abgeben` fragt bei Cloudflare nach, ob es echt ist. Wer das
Formular umgeht und die Funktion selbst aufruft, kommt damit also genauso
wenig weiter — das Widget auf der Seite ist nur die Stelle, an der das
Token ausgestellt wird.

---

## Einmal: das SQL laufen lassen

Im Supabase-SQL-Editor, in dieser Reihenfolge:

1. `supabase/bewerbungen.sql`
2. `supabase/bewerbung-schutz.sql`

Beide Skripte sind wiederholbar, und die Reihenfolge eines späteren
zweiten Durchlaufs ist gleichgültig: Ein erneutes `bewerbungen.sql`
schaltet den Schutz nicht wieder ab.

Danach steht die Prüfung bereit, ist aber noch aus.

---

## Einmal: den Schlüssel bei Cloudflare holen

Cloudflare Turnstile ist kostenlos, zeigt in aller Regel kein Bilderrätsel
und setzt keine Cookies zur Wiedererkennung.

1. Auf [dash.cloudflare.com](https://dash.cloudflare.com) anmelden
   (ein kostenloses Konto genügt) und links **Turnstile** öffnen.
2. **Add widget**.
3. Als Domain **`portal.fsbs-hm.de`** eintragen — **nicht** die
   WordPress-Domain. Das Formular läuft auch eingebettet unter der
   Adresse des Portals.
4. Widget-Modus **Managed**.
5. Es erscheinen zwei Schlüssel: **Site Key** (öffentlich) und **Secret
   Key** (geheim).

---

## Einmal: eintragen und einschalten

Im Supabase-SQL-Editor, mit den beiden Schlüsseln von eben:

```sql
update public.bewerbung_schutz set
    captcha_anbieter = 'turnstile',
    captcha_site_key = '0x4AAAAAAA…',   -- Site Key
    captcha_secret   = '0x4AAAAAAA…',   -- Secret Key
    captcha_aktiv    = true
 where id;
```

Beim nächsten Aufruf von `portal.fsbs-hm.de/bewerbung` steht der Kasten
über dem Absenden-Knopf.

Der Secret Key verlässt die Datenbank nie: Auf die Tabelle hat weder das
Formular noch ein angemeldetes Vorstandsmitglied Zugriff, nach draußen
geht allein `captcha_aktiv`, `captcha_anbieter` und der öffentliche Site
Key.

### Wieder ausschalten

Wirkt sofort, ohne Änderung an der Seite:

```sql
update public.bewerbung_schutz set captcha_aktiv = false where id;
```

### hCaptcha statt Turnstile

Geht auch — `captcha_anbieter = 'hcaptcha'` und die Schlüssel von
[hcaptcha.com](https://www.hcaptcha.com) eintragen. Alles Weitere ist
gleich.

---

## Die zweite Hürde: die Bremse je IP-Adresse

Ein Captcha hilft nicht gegen jemanden, der die fünf Zeichen eines
Bewerbungscodes durchprobiert — dafür müsste man dem Bewerber bei jedem
Blick auf seinen Stand ein Rätsel vorlegen. Deshalb zählt die Datenbank
zusätzlich mit, und zwar je Adresse:

| Was                                     | Voreinstellung        |
| --------------------------------------- | --------------------- |
| Bewerbungen je Stunde                   | 20                    |
| **Unbekannte** Codes je zehn Minuten    | 12                    |

Beides ist absichtlich großzügig: Hinter einer Hochschul-Adresse sitzt ein
halber Rechnerraum. Gezählt wird nur, was zählen soll — eine erfolgreich
abgegebene Bewerbung und ein Code, den es nicht gibt. Wer sich beim
Ausfüllen vertut oder seinen richtigen Code zehnmal nachschlägt, stößt
nicht an die Grenze.

Ändern:

```sql
update public.bewerbung_schutz set abgeben_limit = 40, stand_limit = 20 where id;
```

Nachsehen, ob die Bremse gerade greift:

```sql
select * from public.bewerbung_versuche order by fenster desc;
```

Eine Adresse wieder freigeben:

```sql
delete from public.bewerbung_versuche where ip = '…';
```

---

## Was passiert, wenn Cloudflare ausfällt

Dann wird durchgelassen, und im Postgres-Log steht eine Warnung.

Das ist eine bewusste Entscheidung: Ein „nein“ vom Anbieter weist die
Bewerbung ab — das ist die Aussage, um die es geht. Bekommt die Datenbank
aber gar keine Antwort, soll nicht die Bewerbungsfrist daran hängen. Ein
Skript, das das Formular stürmt, kann unsere Leitung zu Cloudflare nicht
kappen; es kann nur ein falsches Token schicken, und das wird abgewiesen.

Ein fehlendes oder leeres Token ist übrigens keine ausgefallene Leitung,
sondern ein „nein“ — denn genau dieses Feld lässt weg, wer das Formular
umgeht.

---

## Was der Bewerber zu sehen bekommt

* **Nicht bestätigt:** „Bitte bestätige noch kurz, dass du kein Bot bist.“
  am Kasten, das Formular wird nicht abgeschickt.
* **Token abgelaufen** (das Formular lag lange offen): „Die
  Sicherheitsprüfung ist abgelaufen. Bitte bestätige noch einmal und sende
  dann erneut ab.“ Der Kasten setzt sich dabei von selbst zurück.
* **Bremse:** „Von dieser Verbindung kamen gerade schon mehrere
  Bewerbungen. Bitte versuch es später noch einmal — oder schreib uns
  kurz.“
* **Skript blockiert** (Adblocker): „Die Sicherheitsprüfung ließ sich
  nicht laden.“ — mit dem Hinweis, neu zu laden.

---

## Die Falle, die es schon gab

Das versteckte Feld „Webseite“ im Formular bleibt bestehen. Es kostet
nichts, fällt keinem Menschen auf, und schlichte Skripte füllen es aus.
Wer es ausfüllt, bekommt eine Bestätigung zu sehen — gespeichert wird
nichts.

---

## Das zweite Formular

`portal.fsbs-hm.de/rechnung` — Rechnungen und Auslagen — ist genauso
gebaut: Das Token prüft `rechnung_einreichen` in der Datenbank, und wer
das Formular umgeht, kommt damit nicht weiter.

Voraussetzung ist, dass `supabase/rechnungen.sql` und
`supabase/rechnung-schutz.sql` gelaufen sind. Dann genügt:

```sql
update public.rechnung_schutz set captcha_aktiv = true where id;
```

Eigene Schlüssel sind nicht nötig. `captcha_erben` steht auf `true`:
Solange in `rechnung_schutz` keine eingetragen sind, gelten die aus
`bewerbung_schutz`. Das darf so sein — beide Formulare stehen unter
derselben Adresse, und ein Turnstile-Schlüssel gilt für eine Domain,
nicht für eine Seite.

Eingeschaltet wird trotzdem eigens. Ein Kasten, der von selbst auf einer
Seite auftaucht, weil jemand an einer anderen etwas geändert hat, wäre
eine Überraschung an der falschen Stelle.

Eigene Schlüssel gehen auch; dann zieht das Erben nicht mehr:

```sql
update public.rechnung_schutz set
    captcha_anbieter = 'turnstile',
    captcha_site_key = '0x4AAAAAAA…',
    captcha_secret   = '0x4AAAAAAA…',
    captcha_aktiv    = true
 where id;
```

Nachsehen, was die Seite zu sehen bekommt:

```sql
select * from public.rechnung_schutz_info();
```

Die Bremse je IP-Adresse gibt es dort ebenfalls, mit eigenen Zahlen:
zwölf Einreichungen je Stunde, zwölf unbekannte Vorgangsnummern je zehn
Minuten. Sie steht in `public.rechnung_schutz`, gezählt wird in
`public.rechnung_versuche`. Mehr dazu in [rechnungen.md](rechnungen.md).
