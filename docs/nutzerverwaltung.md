# Die Nutzerverwaltung einrichten

Auf **`/nutzer`** sieht der Vorstand, wer sich am Portal anmelden darf:
Name, Mailadresse, Rolle, Ressort und wann sich die Person zuletzt
angemeldet hat. Von dort aus werden Rollen vergeben, Konten angelegt und
Konten gelöscht. Andere Rollen kommen auf die Seite nicht — der Punkt
fehlt in der Navigation, und wer die Adresse trotzdem aufruft, landet
wieder auf dem Dashboard.

Zwei Dinge sind einmal einzurichten: das SQL und die Funktion, die
Konten anlegt.

---

## Warum eine Funktion nötig ist

Rolle und Ressort stehen in der Tabelle `profiles`. Die ändert die Seite
selbst — die Zugriffsregeln lassen den Vorstand daran, und sonst niemanden.

Ein **Konto** dagegen steht in `auth.users`, und daran kommt nur der
Dienstschlüssel des Projekts. Der gehört nicht in eine Seite, die jeder
Browser herunterlädt. Deshalb liegt er in einer Edge Function, die vorher
nachsieht, wer da ruft: gültige Anmeldung, Rolle `vorstand` — erst dann
wird angelegt oder gelöscht.

Ohne die Funktion funktioniert die Seite trotzdem: Liste, Rollen und
Ressorts gehen. Nur „+ Nutzer“ und „Löschen“ melden dann, dass die
Funktion fehlt.

---

## Einmal: das SQL laufen lassen

Im Supabase-SQL-Editor **`supabase/nutzer.sql`** ausführen, danach
**`supabase/rollen.sql`** und **`supabase/mitglieder-anwaerter.sql`**. Alle
drei Skripte sind wiederholbar; ein zweiter Durchlauf ändert nichts und
löscht nichts.

Es legt an:

* die fehlenden Spalten in `profiles` (`role`, `display_name`, `ressort`,
  `created_at`),
* die Zugriffsregeln: jede angemeldete Person liest ihre eigene Zeile,
  der Vorstand liest und ändert alle,
* `nutzer_liste()` — Profil und Konto zusammengelegt, damit die Seite die
  Mailadresse und die letzte Anmeldung zeigen kann,
* `nutzer_ohne_profil()` — Konten, die es in der Anmeldung gibt, denen aber
  die Rolle fehlt,
* eine Sperre für den letzten Vorstand: die letzte Vorstandszeile lässt
  sich weder herabstufen noch löschen. Sonst stünde das Portal ohne
  jemanden da, der Rollen vergeben kann.

`mitglieder-anwaerter.sql` setzt dazu die Regeln an `members` und
`anwaerter`: lesen darf Vorstand und Ressortleitung, schreiben nur der
Vorstand. Vorher stand das nur in den Seiten — und in der anderen Richtung
war es zu streng: Wo die Datenbank das Lesen auf den Vorstand begrenzt
hatte, blieben die beiden Listen für die Ressortleitung schlicht leer.

---

## Einmal: die Funktion veröffentlichen

Die Funktion liegt in `supabase/functions/nutzer-verwalten/`.

### Mit dem Supabase-CLI

```bash
npm install -g supabase          # falls noch nicht da
supabase login
supabase link --project-ref hdhueuihmxbskiusenpe
supabase functions deploy nutzer-verwalten
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` und `SUPABASE_SERVICE_ROLE_KEY` setzt
Supabase in Edge Functions selbst — nachzutragen ist nichts.

### Ohne CLI, über die Oberfläche

In Supabase **Edge Functions → Deploy a new function**, als Name
`nutzer-verwalten`, und den Inhalt von
`supabase/functions/nutzer-verwalten/index.ts` hineinkopieren.

Die Funktion prüft das Anmelde-Token selbst; die Voreinstellung
„Verify JWT“ kann anbleiben.

---

## Wie ein neues Konto entsteht

1. Auf `/nutzer` → **+ Nutzer**.
2. Wer schon in der Mitgliederliste steht, lässt sich oben auswählen —
   Mail, Name und Ressort stehen dann schon da.
3. Rolle wählen, speichern.

Es geht **keine Mail** hinaus. Das Portal meldet mit einem Code an, den
sich jeder auf `/login` selbst schicken lässt; das Konto muss dafür nur
bestehen. Der Person also einmal Bescheid geben: *portal.fsbs-hm.de
aufrufen, Mailadresse eintragen, Code aus dem Postfach eingeben.*

Gibt es das Konto schon, wird keins angelegt — dann wird nur die Rolle
hinterlegt, die bisher gefehlt hat.

---

## Die Rollen

| Rolle | Sieht | Ändert |
|---|---|---|
| `vorstand` | alles — Dashboard, Mitglieder, Anwärter, Bewerbungen, Finanzen, Protokoll, Schreiben, Zutritte, Nutzer | alles |
| `ressortleiter` | Dashboard (eigenes Ressort), Mitglieder, Anwärter, Bewerbungen | nichts — überall nur Leserechte |
| `protokollfuehrer` | ausschließlich das Protokoll | das Protokoll |

Die **Ressortleitung liest, und dabei bleibt es.** Auf `/members` und
`/anwaerter` sind die Knöpfe zum Anlegen, Bearbeiten und Löschen aus; auf
`/bewerbungen` fehlt die ganze Fußzeile der Detailansicht — „Speichern“,
„Anwärter übernehmen“, „Ablehnen“ und „Löschen“ sieht dort nur der
Vorstand. Die Datenbank sagt dasselbe noch einmal: Wer an den Seiten vorbei
schreiben will, kommt an den Zugriffsregeln nicht vorbei.

Ändern geht auf `/nutzer` mit einem Klick auf die Zeile. Die neue Rolle
gilt, sobald die Person die Seite neu lädt.

Mehr als diese drei gibt es nicht. Jede Seite und die Datenbank
vergleichen die Rolle Zeichen für Zeichen mit genau diesen Wörtern.

---

## „Kein Zugriff“, obwohl die Rolle stimmt

Steht in der Spalte `role` etwas anderes als eines der drei Wörter —
`Admin`, `Vorsitz`, `Protokollführer` mit ü, ein Tippfehler, ein alter
Import —, dann ist das für das Portal keine bekannte Rolle. Die Person
sieht überall „Kein Zugriff“, obwohl auf `/nutzer` etwas Vernünftiges
steht. Am deutlichsten fällt das bei den **Finanzen** auf: Die Seite
steht allein dem Vorstand offen und nennt darum unter „Kein Zugriff“
auch die Rolle, die sie gelesen hat.

Nachsehen lässt sich das im SQL-Editor:

```sql
select u.email, p.role
  from public.profiles p
  left join auth.users u on u.id = p.id
 order by p.role, u.email;
```

Geradeziehen tut es **`supabase/rollen.sql`**: Das Skript gleicht jeden
vorhandenen Wert auf eine der drei Rollen an, schreibt in die Meldungen,
welche Zeile wohin gewandert ist, und verriegelt die Spalte — über den
Trigger und eine Prüfregel an der Tabelle — gegen jede vierte Rolle.

Zum Vorstand macht das Skript niemanden: Nur was schon mit `vorstand`
beginnt, bleibt Vorstand, alles Unbekannte landet bei `ressortleiter`.
Wer Vorstand sein soll, bekommt die Rolle danach auf `/nutzer` mit einem
Klick.

---

## Löschen

Löschen entfernt das **Konto** aus der Anmeldung — die Person kommt danach
nicht mehr ins Portal. Ihr Eintrag in der **Mitgliederliste** bleibt davon
unberührt; das sind zwei verschiedene Dinge.

Zwei Fälle gehen nicht, und zwar bewusst:

* das eigene Konto,
* der letzte Vorstand. Erst einen zweiten ernennen, dann geht auch das.

---

## Konten ohne Profil

Wer ein Konto hat, aber keine Rolle, kommt auf keine Seite — überall
steht „Kein Zugriff“. Das passiert etwa, wenn ein Konto direkt in der
Supabase-Oberfläche angelegt wurde.

Solche Konten zählt `/nutzer` über der Liste auf und bietet beides an:
Rolle nachtragen oder Konto löschen.

---

## Und wenn jemand den Code leid ist

Wer drin ist, kann sich im Konto-Menü einen **Passkey** hinterlegen und
meldet sich danach mit Face ID, Fingerabdruck oder Windows Hello an —
ohne Umweg über das Postfach. Am Freischalten ändert das nichts: Der
Passkey hängt an einem Konto, das hier angelegt wurde, und wer keins hat,
hat auch nichts, woran ein Passkey hängen könnte.

Einzurichten ist das einmal, siehe [passkeys.md](passkeys.md).
