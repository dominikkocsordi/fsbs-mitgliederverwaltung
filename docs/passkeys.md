# Passkeys einrichten

Neben dem Code aus der Mail gibt es einen zweiten Weg ins Portal: den
**Passkey**. Das ist Face ID, Fingerabdruck oder Windows Hello — dasselbe,
womit das Gerät sich ohnehin entsperrt. Kein Postfach, kein Warten, kein
achtstelliger Code.

Wer hineindarf, ändert sich dadurch **nicht**. Ein Passkey hängt immer an
einem Konto, das es schon gibt, und Konten legt weiterhin allein der
Vorstand auf `/nutzer` an. Hinterlegen kann ihn nur, wer bereits angemeldet
ist — im Konto-Menü oben rechts, dort, wo auch „Abmelden“ steht.

Zwei Dinge sind einmal einzurichten: das SQL und die Funktion, die die
Passkeys prüft.

---

## Wie das zusammenhängt

Ein Passkey ist ein Schlüsselpaar. Der geheime Teil entsteht auf dem Gerät
und verlässt es nie — er ist durch Gesicht, Finger oder PIN gesperrt. Der
öffentliche Teil liegt in der Tabelle `passkeys` und ist für sich genommen
wertlos.

Beim Anmelden stellt der Server eine Zufallsaufgabe, das Gerät unterschreibt
sie, der Server prüft die Unterschrift gegen den öffentlichen Teil. Passt
sie, lässt sich die Funktion von Supabase **dieselbe einmalige Anmeldemarke**
geben, die sonst in der Mail stünde, und reicht sie an die Seite weiter. Die
Seite löst sie ein und hat danach eine ganz gewöhnliche Sitzung — für alles
Weitere ist es einerlei, auf welchem Weg man hereingekommen ist.

Zwei Dinge fallen dabei nebenbei ab:

* Der Schlüssel gilt nur für `portal.fsbs-hm.de`. Eine nachgebaute Seite
  unter anderer Adresse bekommt vom Gerät nichts — Phishing läuft ins Leere.
* Es geht keine Mail hinaus. Wer kein Postfach zur Hand hat, kommt trotzdem
  hinein.

Der Code aus der Mail bleibt daneben bestehen. Ein verlorenes Gerät sperrt
damit niemanden aus.

---

## Einmal: das SQL laufen lassen

Im Supabase-SQL-Editor **`supabase/passkeys.sql`** ausführen. Das Skript ist
wiederholbar; ein zweiter Durchlauf ändert nichts und löscht nichts.

Es legt an:

* `passkeys` — eine Zeile je Gerät: öffentlicher Schlüssel, Zähler, Name,
  wann angelegt, wann zuletzt benutzt,
* `passkey_aufgaben` — die Zufallsaufgaben, bis sie eingelöst oder alt sind,
* die Zugriffsregeln: Die eigenen Passkeys darf jede angemeldete Person sehen
  und löschen. Anlegen geht aus dem Browser nicht — dafür muss vorher eine
  Unterschrift geprüft sein, und das kann nur die Funktion. An die Aufgaben
  kommt aus dem Browser überhaupt niemand,
* `passkey_aufgaben_aufraeumen()` — wirft weg, was älter als eine
  Viertelstunde ist. Die Funktion ruft das bei jedem Durchgang auf;
  einen eingeplanten Auftrag braucht es dafür nicht.

---

## Einmal: die Funktion veröffentlichen

Die Funktion liegt in `supabase/functions/passkey/`.

### Mit dem Supabase-CLI

```bash
supabase link --project-ref hdhueuihmxbskiusenpe
supabase functions deploy passkey --no-verify-jwt
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` und `SUPABASE_SERVICE_ROLE_KEY` setzt
Supabase in Edge Functions selbst — nachzutragen ist nichts.

### Ohne CLI, über die Oberfläche

In Supabase **Edge Functions → Deploy a new function**, als Name `passkey`,
den Inhalt von `supabase/functions/passkey/index.ts` hineinkopieren und
**„Verify JWT“ ausschalten**.

### Warum „Verify JWT“ hier aus muss

Anders als bei `nutzer-verwalten`: Wer sich gerade anmelden will, hat noch
keine Anmeldung. Die beiden Schritte `anmelden-start` und `anmelden-fertig`
müssen also ohne Token erreichbar sein.

Offen ist damit nur die Tür, nicht das Haus. Die Funktion prüft selbst:

* die Herkunft der Anfrage — alles ausser den Adressen in `ERLAUBTE_HERKUNFT`
  wird abgewiesen,
* die Aufgabe — jede gilt genau einmal und nur fünf Minuten,
* die Unterschrift — gegen den hinterlegten öffentlichen Schlüssel,
* die Rolle — ein Konto ohne Zeile in `profiles` bekommt keine Sitzung.

Für die beiden Schritte, die einen Passkey **hinterlegen**, verlangt die
Funktion weiterhin ein gültiges Token. Neue Konten entstehen an keiner
Stelle.

---

## Eine neue Adresse in Supabase eintragen

Kommt eine weitere Adresse dazu (Testumgebung, Vorschau), gehört sie an
zwei Stellen:

* in `ERLAUBTE_HERKUNFT` in `supabase/functions/passkey/index.ts`,
* in `ERLAUBTE_HERKUNFT` in `supabase/functions/nutzer-verwalten/index.ts`,
  falls dort auch gearbeitet wird.

Passkeys, die unter `portal.fsbs-hm.de` angelegt wurden, gelten auf einer
anderen Adresse **nicht**. Das ist keine Einstellung, sondern der Kern der
Sache: Der Schlüssel ist an den Namen der Seite gebunden.

---

## Einen Passkey hinterlegen

1. Ganz gewöhnlich mit dem Code aus der Mail anmelden.
2. Oben rechts auf den eigenen Namen, dann **Passkeys**.
   (Am Telefon: Menü → **Passkeys**.)
3. **Passkey hinzufügen**, einen Namen vergeben — das Gerät fragt nach
   Gesicht, Finger oder PIN, und fertig.

Ab dann steht auf `/login` oben **„Mit Passkey anmelden“**. Eine Mailadresse
muss dafür niemand eintippen: Das Gerät bietet von sich aus an, welcher
Schlüssel zu dieser Seite passt.

Mehrere Geräte gehen — Telefon, Laptop, Tablet, jedes mit eigenem Eintrag.
In derselben Liste steht auch **Entfernen**: Ein verlorenes Gerät fliegt
damit sofort hinaus, und der Zugang über den Code bleibt davon unberührt.

Der Knopf auf `/login` erscheint überall dort, wo der Browser Passkeys
kennt. Auf einem Rechner ohne eigenen Schlüssel bietet er an, den vom
Telefon zu benutzen — das Telefon zeigt dann einen QR-Code. Auf einem alten
Browser ohne Passkeys bleibt alles beim Alten: Dort steht der Knopf nicht,
und der Code aus der Mail geht weiterhin.

---

## Die E-Mail-Adresse ändern

Im selben Menü steht **E-Mail ändern**. Das betrifft nur das eigene Konto:

1. Neue Adresse eintragen, **Bestätigung senden**.
2. Supabase schickt einen Link an die neue Adresse.
3. Erst wenn der Link geklickt ist, gilt sie. Bis dahin meldet man sich mit
   der alten an.

Rolle und Ressort bleiben, wie sie sind — die vergibt weiterhin allein der
Vorstand auf `/nutzer`. Hinterlegte Passkeys bleiben ebenfalls: Sie hängen
am Konto, nicht an der Adresse.

Damit der Link ankommt, muss `https://portal.fsbs-hm.de/login` in Supabase
unter **Authentication → URL Configuration → Redirect URLs** stehen — dort
steht sie schon, weil der Login-Link aus der Mail denselben Weg nimmt.
