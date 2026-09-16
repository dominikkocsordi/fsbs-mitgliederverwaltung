# Rechnungen & Auslagen

Bis jetzt lief das über ein Google-Formular: Die Antworten landeten in einer
Tabelle, die Belege in einem Drive-Ordner, und `/rechnungen` im Portal holte
sich beides über ein Apps Script. Das ist vorbei. Alles liegt in Supabase —
die Zahlen in `public.rechnungen`, die Belege im Ordner `belege`, unmittelbar
an ihrer Zeile.

Was sich dadurch ändert:

|                        | vorher                      | jetzt                                    |
| ---------------------- | --------------------------- | ---------------------------------------- |
| Formular               | Google Forms                | `portal.fsbs-hm.de/rechnung`             |
| Schutz vor Bots        | keiner                      | Captcha + Bremse je IP-Adresse           |
| Beleg                  | Google Drive                | Supabase, im Portal ansehbar             |
| Projekt                | freies Textfeld             | freies Feld mit ein paar Vorschlägen     |
| IBAN                   | ungeprüft                   | Prüfziffer wird geprüft                  |
| Stand für den Einreicher | nicht einsehbar           | Vorgangsnummer → Stand abrufbar          |
| Auszahlen              | Zeile für Zeile abtippen    | nach Konto gebündelt, zum Kopieren       |

---

## Einrichten

Vier Schritte, einer davon freiwillig. Zwischendurch bleibt alles benutzbar:
Solange das Formular nicht bekannt gemacht wird, kommt darüber nichts herein.

### 1. Die Tabellen anlegen

Im Supabase-SQL-Editor, in dieser Reihenfolge:

1. `supabase/rechnungen.sql` — Tabellen, Projektliste, Belege-Ordner, Regeln
2. `supabase/rechnung-schutz.sql` — Captcha und die Bremse je IP-Adresse

Beide Skripte sind wiederholbar: Ein zweiter Durchlauf ändert nichts und
löscht nichts — bis auf die Vorschläge im Projektfeld, siehe unten unter
[Projekte](#projekte). Auch die Reihenfolge eines späteren zweiten Durchlaufs
ist gleichgültig — ein erneutes `rechnungen.sql` schaltet den Schutz nicht
wieder ab.

> Läuft das Portal schon: `rechnungen.sql` muss noch einmal durch, sonst
> nimmt das Formular nichts mehr an. Das Projekt ist jetzt ein freies Feld,
> und `rechnung_einreichen()` bekommt es als Text statt als Kennung — die
> Seite ruft die Funktion also anders auf, als die Datenbank sie kennt.

Danach steht `/rechnungen` im Portal auf den neuen Daten, und
`portal.fsbs-hm.de/rechnung` nimmt Belege entgegen.

### 2. Die bisherigen Einträge übernehmen

```
supabase/rechnungen-import.sql
```

Trägt die 34 Antworten des Google-Formulars ein (31.10.2025 bis 24.07.2026,
zusammen 3.476,76 €). Auch dieses Skript ist wiederholbar: Erkannt wird jede
Zeile an der Datei-Kennung ihres Belegs bei Drive, und was schon da ist,
bleibt unberührt.

Was dabei geglättet wurde — zusammengelegte Projektnamen, drei unbrauchbare
IBANs, ein Datum aus dem Jahr 2001 —, steht oben im Skript und in den Notizen
der betroffenen Zeilen. An den Beträgen ändert sich nichts.

Nachsehen, ob alles angekommen ist:

```sql
select count(*), sum(betrag) from public.rechnungen where quelle = 'import';
-- 34 und 3476.76
```

### 3. Das Captcha einschalten

Steht für die Bewerbung schon ein Turnstile-Widget (siehe
[captcha-einrichten.md](captcha-einrichten.md)), genügt eine Zeile:

```sql
update public.rechnung_schutz set captcha_aktiv = true where id;
```

Eigene Schlüssel braucht es nicht: `captcha_erben` steht auf `true`, und
solange hier keine eintragen sind, gelten die aus `bewerbung_schutz`. Das darf
so sein — beide Formulare stehen unter derselben Adresse, und ein
Turnstile-Schlüssel gilt für eine Domain, nicht für eine Seite.

Ist noch gar kein Turnstile eingerichtet, steht in
[captcha-einrichten.md](captcha-einrichten.md), wie das geht; die Schlüssel
lassen sich dort oder hier eintragen.

Wieder ausschalten wirkt sofort, ohne Änderung an der Seite:

```sql
update public.rechnung_schutz set captcha_aktiv = false where id;
```

Ohne Captcha bleiben zwei Hürden: das versteckte Feld im Formular, auf das
schlichte Skripte hereinfallen, und die Bremse je IP-Adresse.

### 4. Die Belege aus Drive holen

Die übernommenen Zeilen zeigen im Portal zunächst „Beleg noch bei Drive“ und
einen Link dorthin. `appsscript/belege-migration.gs` holt die Dateien ins
Portal — wie, steht ausführlich oben in der Datei. Kurz:

1. script.google.com → neues Projekt → den Inhalt der Datei einfügen.
   Es muss das Google-Konto sein, das die Belege in Drive sehen darf.
2. In den Skripteigenschaften `SUPABASE_URL` und `SUPABASE_SERVICE_KEY`
   hinterlegen (der `service_role`-Schlüssel aus den Supabase-Einstellungen).
3. `probelauf` ausführen — ändert nichts, sagt nur, was es vorhat.
4. `belegeHolen` ausführen. Läuft die Zeit ab, sagt das Protokoll es, und ein
   zweiter Lauf macht dort weiter.
5. Danach den `service_role`-Schlüssel wieder aus den Skripteigenschaften
   löschen. Er hebelt alle Zugriffsregeln aus und gehört nirgendwo dauerhaft
   hin.

Zugeordnet wird über `drive_id`, die Kennung aus der Antwort des Formulars.
Eine Verwechslung ist damit ausgeschlossen. Jede Datei landet als
`drive/<Vorgangsnummer>.<Endung>` im Ordner — wer in Supabase in den Ordner
sieht, erkennt ohne Umweg, wozu eine Datei gehört.

Die Dateien in Drive bleiben liegen; das Skript kopiert nur. Aufräumen lässt
sich dort später von Hand, wenn alles drüben ist.

### Was danach wegkann

* Das Google-Formular „Rechnungen und Auslagen“ — am besten schließen, statt
  es zu löschen, damit die alten Antworten erhalten bleiben.
* Das Apps Script hinter der bisherigen Belegliste.
* Der Eintrag in `app_secrets`:

  ```sql
  delete from public.app_secrets where key = 'finance_sheet_token';
  ```

  Weder `/rechnungen` noch das Dashboard fragen ihn noch ab.

---

## Der Alltag

### Für alle, die etwas ausgelegt haben

`portal.fsbs-hm.de/rechnung` — ohne Konto, ohne Passwort. Name, Projekt, was
gekauft wurde, Betrag, Belegdatum, ein Foto oder PDF und die IBAN. Am Ende
steht eine **Vorgangsnummer** aus fünf Zeichen. Mit ihr sieht man unter
derselben Adresse jederzeit nach, wie weit die Erstattung ist:
eingegangen → wird geprüft → überwiesen.

Der Link lässt sich auch gleich mit Nummer verschicken:
`portal.fsbs-hm.de/rechnung?code=ABC12`.

Die IBAN wird beim Tippen auf ihre Prüfziffer geprüft. Das fängt den
Zahlendreher ab, der sonst erst auffiele, wenn die Überweisung zurückkommt —
und das dauert Wochen.

### Für den Vorstand

`portal.fsbs-hm.de/rechnungen`, wie bisher nur für die Rolle `vorstand`.

**Vorgänge** ist die Liste. Eine Zeile anklicken öffnet den Vorgang: der
Beleg gleich sichtbar, daneben die Angaben, darunter eine Notiz, die nur
intern steht. Oben stellt man den Stand um:

| Stand          | heißt                                                  |
| -------------- | ------------------------------------------------------ |
| **Offen**      | eingegangen, noch nicht angesehen                      |
| **In Prüfung** | liegt beim Vorstand                                    |
| **Bezahlt**    | überwiesen — das Datum trägt die Datenbank selbst ein   |
| **Abgelehnt**  | wird nicht erstattet; warum, gehört in die Notiz        |

**Auszahlungen** ist die Ansicht fürs Überweisen. Gebündelt wird nach Konto,
nicht nach Namen: Wer dreimal eingereicht hat, bekommt eine Überweisung. Zu
jeder Gruppe gibt es IBAN, Verwendungszweck und Betrag zum Kopieren und einen
Knopf, der alle Posten auf einmal als bezahlt einträgt. Fehlt die IBAN, steht
es in Rot — dann ist ohnehin nachzufragen.

**Projekte** zeigt, wohin das Geld geht: eine Zeile je Projekt, der hellere
Teil des Balkens ist das, was noch offen ist. Eine Zeile anklicken filtert die
Liste auf dieses Projekt.

Die Filterleiste gilt für alle drei Ansichten; ein Filter, der greift, ist
blau umrandet. **CSV** gibt aus, was gerade zu sehen ist — mit Semikolon und
BOM, damit Excel die Datei ohne Import-Dialog richtig öffnet.

**+ Beleg erfassen** ist für alles, was nicht über das Formular hereinkommt:
die Rechnung, die per Mail kam, die Abbuchung von der Vereinskarte. Dasselbe
Formular dient auch zum Nachbessern eines bestehenden Vorgangs
(**Bearbeiten** im Dialog).

---

## Pflegen

### Projekte

Das Projekt ist ein freies Feld — im Formular wie im Portal. Wer einen Beleg
für etwas einreicht, das es so noch nie gab, tippt es einfach hin; niemand
muss vorher eine Liste ergänzen.

Was in `public.rechnung_projekte` auf `active = true` steht, erscheint im Feld
als Vorschlag, in der Reihenfolge von `sort_order`. Nach `rechnungen.sql` sind
das fünf: Anwärterprojekt, FS Wochenende, Semester Closing, Semester Opening,
Stadtrallye. Die übrigen Namen bleiben in der Tabelle stehen und sind im
Portal weiter Filter, sie stehen nur nicht mehr im Feld.

```sql
-- einen Vorschlag hinzufügen
insert into public.rechnung_projekte (name, sort_order) values ('Sommerfest', 125);

-- einen aus den Vorschlägen nehmen
update public.rechnung_projekte set active = false where name = 'Stadtrallye';

-- nachsehen, was gerade vorgeschlagen wird
select name, sort_order from public.rechnung_projekte
 where active order by sort_order, name;
```

Die Vorschläge sind das Einzige, was ein zweiter Durchlauf von
`rechnungen.sql` zurückdreht: Er stellt genau diese fünf wieder her. Wer
andere vorschlagen will, setzt `active` danach noch einmal.

Ein Projekt umzubenennen oder zu löschen ändert nichts an den schon
eingereichten Belegen: Deren Projekt steht als Klartext in ihrer eigenen
Zeile.

### Das Formular zumachen

```sql
update public.rechnung_formular set
    geschlossen = true,
    hinweis_zu  = 'Bis zum Kassenabschluss am 15.1. nehmen wir keine Belege mehr an.'
 where id;
```

Wirkt sofort: Die Seite zeigt statt des Formulars den Hinweis, und auch wer
das Formular umgeht, kommt nicht durch — `rechnung_einreichen` weist ab, und
in den Belege-Ordner darf dann ebenfalls niemand mehr hochladen.

Titel und Einleitungstext stehen in derselben Zeile (`titel`, `intro`).

### Die Einwilligung

Ihr Wortlaut steht in `public.rechnung_einwilligung`, und zu jeder Einreichung
ist gespeichert, welcher Fassung zugestimmt wurde. Ändern heißt: neue Zeile
einfügen, alte auf `active = false` setzen. Bereits gespeicherte Einreichungen
behalten ihre eigene.

### Die Bremse

Je IP-Adresse gilt: zwölf Einreichungen je Stunde, zwölf unbekannte
Vorgangsnummern je zehn Minuten. Beides ist großzügig — wer vom
Fachschaftswochenende zurückkommt, tippt sechs Kassenbons hintereinander ein.

```sql
-- ändern
update public.rechnung_schutz set einreichen_limit = 20, stand_limit = 20 where id;

-- nachsehen, ob sie gerade greift
select * from public.rechnung_versuche order by fenster desc;

-- eine Adresse wieder freigeben
delete from public.rechnung_versuche where ip = '…';
```

---

## Wenn etwas klemmt

**„Noch nicht eingerichtet“ auf `/rechnungen`.** `supabase/rechnungen.sql` ist
noch nicht gelaufen — oder PostgREST hat den Katalog noch nicht neu gelesen:

```sql
notify pgrst, 'reload schema';
```

**„Das Formular ist gerade nicht vollständig eingerichtet“** auf `/rechnung`.
Dasselbe: Die Funktion `rechnung_einreichen` fehlt. Erst `rechnungen.sql`
laufen lassen, dann der Befehl oben.

**Der Kasten des Captchas erscheint nicht.** Nachsehen, was die Datenbank
nach draußen gibt:

```sql
select * from public.rechnung_schutz_info();
```

Kommt `captcha_aktiv = false`, fehlt entweder das Einschalten oder ein
Schlüssel — auch beim Erben: Ohne Site-Key *und* Secret bleibt die Prüfung
aus. Der Schlüssel muss außerdem bei Cloudflare auf die Domain
`portal.fsbs-hm.de` ausgestellt sein.

**Ein Beleg lässt sich nicht öffnen.** Der Link in den Ordner gilt eine
Stunde; nach langem Offenstehen des Dialogs hilft ein Neuladen. Zeigt der
Browser ein Bild gar nicht an, ist es meist HEIC vom iPhone — dann
herunterladen, jedes Betriebssystem kann es öffnen.

**Ein Beleg fehlt ganz.** Welche Zeilen das betrifft:

```sql
select code, vorname, nachname, beschreibung, drive_link
  from public.rechnungen where beleg_pfad is null;
```

Steht dort ein `drive_link`, hat die Migration die Datei nicht geholt — das
Protokoll des Apps Scripts sagt, warum (meist: zu groß oder ein Format, das
der Ordner nicht annimmt).

**Eine Datei liegt im Ordner, aber an keiner Zeile.** Das passiert, wenn das
Hochladen im Formular klappt und das Speichern danach nicht. Aufzuräumen ist
das in Supabase unter Storage → `belege` → `eingang/`; verglichen wird mit:

```sql
select beleg_pfad from public.rechnungen where beleg_pfad is not null;
```

---

## Wer was sehen darf

* **Jeder** (auch ohne Anmeldung): die Projektliste, den Text der Einwilligung,
  den Zustand des Formulars. Und die vier Angaben, die `rechnung_stand` zu
  einer Vorgangsnummer herausgibt — Vorname, Betrag, Projekt, Stand.
* **Jeder** darf in den Ordner `belege` hochladen, solange das Formular offen
  ist. Herauslesen kann dort niemand.
* **Vorstand**: alles. Die Tabelle `rechnungen` selbst steht keiner anderen
  Rolle offen — dort stehen Bankverbindungen.
* **Niemand von außen** kommt an `rechnung_schutz` (dort liegt das Secret des
  Captchas) oder an `rechnung_versuche`.

Geprüft wird das in der Datenbank, nicht im Browser: Wer eine Seite umgeht und
die Funktionen selbst aufruft, kommt damit keinen Schritt weiter.
