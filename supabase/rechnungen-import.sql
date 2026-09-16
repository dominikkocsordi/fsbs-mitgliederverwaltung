-- =============================================================================
--  Rechnungen – die Einträge aus dem Google-Formular
-- =============================================================================
--  Einmal im Supabase SQL-Editor ausführen, nachdem supabase/rechnungen.sql
--  gelaufen ist. Das Skript ist wiederholbar: Erkannt wird jede Zeile an der
--  Datei-Kennung ihres Belegs bei Google Drive (`drive_id`), und was schon da
--  ist, bleibt unberührt. Ein zweiter Durchlauf trägt also nichts doppelt ein.
--
--  Übernommen werden die 34 Antworten des Formulars „Rechnungen und Auslagen“
--  vom 31.10.2025 bis zum 24.07.2026, zusammen 3.476,76 €.
--
--  Die Belege selbst kommen hier noch nicht mit — sie liegen in Google Drive
--  und wandern mit appsscript/belege-migration.gs hinterher. Bis dahin steht
--  in `drive_link` der Link, unter dem sie dort zu finden sind, und die
--  Finanzen-Seite zeigt ihn an.
--
--  ---- Was dabei geglättet wurde ---------------------------------------------
--
--  * **Projekt.** Im Formular war das ein freies Textfeld, entsprechend sah
--    die Auswertung aus. Jede Zeile bekommt hier ein Projekt aus der Liste in
--    Block 1 von rechnungen.sql; was ursprünglich dastand, bleibt daneben in
--    `projekt_roh` stehen. Zusammengelegt wurden:
--
--        Fs-We                              → FS Wochenende
--        Opening / Opening Party            → Semester Opening
--        Semester Opening WS 25/26          → Semester Opening
--        Semester closing                   → Semester Closing
--        Software / Events                  → Software
--        Blumen                             → Blumen & Geschenke
--        Internes FS Treffen                → Interne Events
--        Interne und Externe Events         → Interne Events
--        Internes Event Englischer Garten   → Interne Events
--        Webseite/Shop                      → Webseite / Shop
--
--  * **IBAN.** Leerzeichen fallen weg, Buchstaben werden groß. Drei Zeilen
--    hatten keine brauchbare Angabe („00000“, zweimal „-“); dort steht statt
--    einer falschen Bankverbindung nichts, und in der Notiz, was dastand.
--
--  * **Stand.** „Bezahlt“ → `bezahlt`, „In Prüfung“ → `pruefung`. Wann genau
--    überwiesen wurde, sagt das Formular nicht; `bezahlt_am` bleibt deshalb
--    für diese Zeilen leer. Der Trigger füllt es nur bei allem, was ab jetzt
--    hier bezahlt wird.
--
--  * **Ein Datum**, das nicht stimmen kann (10.03.2001), bleibt stehen, wie
--    es eingetragen wurde — mit einem Vermerk in der Notiz. Wir wissen nicht,
--    was gemeint war, und Raten wäre schlechter als der Hinweis.
--
--  Nichts davon rührt an die Beträge: Was jemand ausgelegt hat, steht auf den
--  Cent so hier wie dort.
-- =============================================================================

with quelle (
    drive_id, vorname, nachname, beschreibung, projekt_roh, projekt_name,
    betrag, beleg_datum, iban, status, eingegangen, notiz
) as (
  values
    ('1YAMF7DBCGXNyGuZo4d-vt5O3RBQy6HrU', 'Florian', 'Bayer',
     'Master Stadrallye',
     'Stadtrallye', 'Stadtrallye',
     98.78, date '2025-10-14', '', 'pruefung',
     timestamp '2025-10-31 19:02:43', 'Im Google-Formular stand als IBAN „00000“ — keine gültige Bankverbindung. Bitte beim Einreicher nachfragen.'),
    ('1EsGcnMcZ5MIMJOyq61hiAt6jDgpnYy14', 'Dominik', 'Kocsordi',
     'Anwärter Kennenlernevent Namensschilder',
     'Onboarding', 'Onboarding',
     12.99, date '2025-10-21', 'DE41100123450291270101', 'bezahlt',
     timestamp '2025-11-06 16:29:34', ''),
    ('1JRqGHQ0-6HaZxvxlCLkZbhCpWjmdq84t', 'Sarah', 'Huber',
     'Einkauf Anwärterprojekt Glühwein',
     'Anwärterprojekt', 'Anwärterprojekt',
     21.75, date '2025-11-22', 'DE24733500000515056851', 'bezahlt',
     timestamp '2025-12-02 14:16:09', ''),
    ('1XcyeL0ihOHfpgBE2wY2j2NTjbFIzvkxB', 'Sarah', 'Huber',
     'Anwärterprojekt Lidl 1',
     'Anwärterprojekt', 'Anwärterprojekt',
     46.39, date '2025-11-27', 'DE24733500000515056851', 'bezahlt',
     timestamp '2025-12-02 14:17:41', ''),
    ('15y5EHPTbUoyufStbcTVPmt4cjEHp89j1', 'Sarah', 'Huber',
     'Anwärterprojekt Lidl 2',
     'Anwärterprojekt', 'Anwärterprojekt',
     3.38, date '2025-11-28', 'DE24733500000515056851', 'bezahlt',
     timestamp '2025-12-02 14:19:05', ''),
    ('1osweZcywNZZlb6e0Sw83e_3ctbPrEm8c', 'Sarah', 'Huber',
     'Anwärterprojekt Lidl 3',
     'Anwärterprojekt', 'Anwärterprojekt',
     13.23, date '2025-11-27', 'DE24733500000515056851', 'bezahlt',
     timestamp '2025-12-02 14:20:06', ''),
    ('1-c9b3oAc8XIysJvjI4Yyh6zUyVPbzK80', 'Sarah', 'Huber',
     'Anwärterprojekt Rewe 1',
     'Anwärterprojekt', 'Anwärterprojekt',
     66.88, date '2025-11-27', 'DE24733500000515056851', 'bezahlt',
     timestamp '2025-12-02 14:21:15', ''),
    ('11PSsSf4akJ4low66DnAdUqpeg5iPK22w', 'Sarah', 'Huber',
     'Anwärterprojekt Rewe 2',
     'Anwärterprojekt', 'Anwärterprojekt',
     45.43, date '2025-11-22', 'DE24733500000515056851', 'bezahlt',
     timestamp '2025-12-02 14:22:28', ''),
    ('1O8gFsy5_RaFxg-AktREwB4SlLRNXXpx0', 'Yaroslav', 'Yaroshenko',
     '60x Nikoläuse für die Nikolausaktion',
     'Nikolausaktion', 'Nikolausaktion',
     109.39, date '2025-12-08', 'DE31200411330103404000', 'bezahlt',
     timestamp '2025-12-08 14:10:26', ''),
    ('1W0SJ_oomhuGbEr9tELoGh6ClrJ9peVeO', 'Noah', 'Scheibler',
     'Rewe Einkauf',
     'Weihnachtsfeier', 'Weihnachtsfeier',
     32.58, date '2025-12-08', 'DE44500105175444422484', 'bezahlt',
     timestamp '2025-12-10 22:39:08', ''),
    ('1I37nsoRd9q8pE5PzUlw8oAnnsoNXeXL1', 'Noah', 'Scheibler',
     'Bob‘s & Bowl, 3 Bowling Bahnen',
     'Weihnachtsfeier', 'Weihnachtsfeier',
     243.9, date '2025-12-09', 'DE44500105175444422484', 'bezahlt',
     timestamp '2025-12-10 22:41:25', ''),
    ('1DJzG8g4kyUO08TojZlNLKXnntGNVmZPG', 'Benjamin', 'Mustafic',
     '089 Tickets',
     'Party', 'Party',
     122, date '2026-02-20', 'DE51701500001005037591', 'bezahlt',
     timestamp '2026-02-20 11:10:23', ''),
    ('1-RNp02K0qAhN6vRNRLE2it2OxxoO33g_', 'Letizia', 'John',
     'Bäckerteilchen fürs Ersti-Tüten Packen',
     'Ersti-Tüten', 'Ersti-Tüten',
     20.9, date '2026-03-13', 'DE67701694640000098744', 'bezahlt',
     timestamp '2026-03-15 12:21:24', ''),
    ('1gFqwkA3tcTC6RvuPfY-UFampxnCzOnEI', 'Dominik', 'Kocsordi',
     'Slido Pro Version',
     'Software / Events', 'Software',
     107.1, date '2026-03-26', '', 'bezahlt',
     timestamp '2026-03-27 10:12:44', 'Im Google-Formular stand als IBAN „-“ — keine gültige Bankverbindung. Bitte beim Einreicher nachfragen.'),
    ('17P6SWds-cXQP1gLSBIW1Ru1FkUMm1Opz', 'Benjamin', 'Mustafic',
     'Semester Opening Party',
     'Opening Party', 'Semester Opening',
     109, date '2026-03-25', 'DE51701500001005037591', 'bezahlt',
     timestamp '2026-03-29 22:19:51', ''),
    ('1EgEz_NVXgmMvXcW2kXj_AQt-yoHK_Tqx', 'Benjamin', 'Mustafic',
     'Opening Party',
     'Opening', 'Semester Opening',
     48, date '2026-03-25', 'DE51701500001005037591', 'bezahlt',
     timestamp '2026-03-29 22:21:09', ''),
    ('1BfokzrrPhYaq4ClnVDM8nW2OoA92qXi6', 'Benjamin', 'Mustafic',
     'Blumen Nana',
     'Blumen', 'Blumen & Geschenke',
     30, date '2026-03-26', 'DE51701500001005037591', 'bezahlt',
     timestamp '2026-03-29 22:24:19', ''),
    ('1nS_zjPUnEmoxgx-508asIPSYK_GUDlh0', 'Christopher', 'Pöhler',
     'Hallo Benny,   ich hoffe, dir geht es gut und die Prüfungsphase ist nicht zu stressig. 😊 Wie bereits abgesprochen habe ich bis heute meine Auslagen für das Fachschaftswochenende im Sommersemester 2024 noch nicht erhalten (17.05.2024 – 19.05.2024).   Ich bin nach dem Wochenende ein paar Mal auf Leon zugegangen. Leider ist das dann immer wieder untergegangen. Kurz bevor Leon seinen Posten abgegeben hat, hatte er aufgrund technischer Probleme keinen Zugang mehr zum Konto.   Giuseppe hat den Posten von Leon dann übernommen und auch die Information erhalten, dass die Rechnungen noch offen sind. Auch er hatte am Anfang keinen Zugang zum Konto, und dann ging es erneut unter.   Nach der langen Zeit habe ich leider nur noch eine Rechnung gefunden (ich hatte Leon damals alle über Slack geschickt, aber der Verlauf ist nicht mehr ersichtlich). Ich habe jedoch die dazugehörige Kreditkartenabrechnung mit den entsprechenden Posten.   Ich war am 16.05.2024 im Kaufland einkaufen und habe dort die meisten Dinge gekauft. Am 17.05.2024 war ich auf der Fahrt zum FS-Wochenende noch bei Aldi und Penny einkaufen, um die restlichen Dinge zu besorgen (Tiefkühlsemmeln, Brezen usw.). An diesem Tag waren auch Dominik und Maresa dabei.   Am 18.05.2024 war ich am Vormittag (ich glaube mit Leon und Maresa) bei Billa, um noch Kleinigkeiten zu kaufen, und am Nachmittag bei einer Tankstelle zusammen mit Leon, da der Alkohol plötzlich leer war.   Entschuldige, dass ich erst jetzt auf dich zukomme, aber ich bin in den letzten Wochen wegen Bachelorarbeit und Co. nicht dazu gekommen. Insgesamt sind es also 216,64€.     Meine Kontodaten: Name:Christopher Pöhler DE40500240246119695901 BIC: DEFFDEFFXXX  Viele Grüße Chris ☺️',
     'FS Wochenende', 'FS Wochenende',
     216.64, date '2024-05-16', 'DE40500240246119695901', 'bezahlt',
     timestamp '2026-04-01 14:15:37', ''),
    ('1EdBHtJzLwo_sccP4ONdWOeNO6XH2DaBc', 'Lisa', 'Alt',
     'Pizza',
     'Anwärter Kennenlernen', 'Anwärter Kennenlernen',
     77.98, date '2026-05-11', 'DE79590501010610324345', 'bezahlt',
     timestamp '2026-05-11 19:35:52', ''),
    ('1RSaS9ZyGP8-NF9qLtGUWILYuy8PZDWhd', 'Jasmin', 'Süssig',
     'Obazda für das Frühlingsfest 2025',
     'Internes FS Treffen', 'Interne Events',
     14.59, date '2025-04-25', 'DE68701500001005336530', 'bezahlt',
     timestamp '2026-05-12 13:49:05', ''),
    ('1u6pwbrMO0EYBnL0L9kD6dNm3Go6elIsf', 'Kevin', 'Pausch',
     'Getränkeeinkauf in der Metro',
     'FS Wochenende', 'FS Wochenende',
     448.29, date '2026-05-13', 'DE82701696140005771153', 'bezahlt',
     timestamp '2026-05-14 10:39:35', ''),
    ('16-xIpq6yf1gCqJDHPKp0ePG2a1IZVlK4', 'Aaliyah', 'Klapp',
     'Getränkeeinkauf in der Metro',
     'FS Wochenende', 'FS Wochenende',
     190.27, date '2026-05-13', 'DE32120300001065554063', 'bezahlt',
     timestamp '2026-05-14 16:10:57', ''),
    ('1dKAZbY742iRiPEtjMRSbyGqOlP3Ipr_M', 'Luca', 'Heck',
     'Fachschaftswochenende',
     'Fs-We', 'FS Wochenende',
     311.8, date '2001-03-10', 'DE11100123450629624101', 'bezahlt',
     timestamp '2026-05-15 18:23:27', 'Belegdatum laut Formular 10.03.2001 — vermutlich ein Tippfehler.'),
    ('1p1PaPtXz1plG6dMw5GDzfxMxbScZp4sT', 'Aaliyah', 'Klapp',
     'Einkauf',
     'FS Wochenende', 'FS Wochenende',
     37.53, date '2026-05-16', 'DE32120300001065554063', 'bezahlt',
     timestamp '2026-05-18 10:53:58', ''),
    ('1XbKZPfwUkwyZhwDEY28T__i2Wqd_k2KB', 'Jule', 'Friedrich',
     'Fachschaftswochenende Lebensmittel',
     'FS Wochenende', 'FS Wochenende',
     97.57, date '2026-05-16', 'DE60701500001003147772', 'bezahlt',
     timestamp '2026-05-19 11:22:35', ''),
    ('1Pt9qXe6Pw8AWKgY3jY49_wuOyb5iCHI9', 'Daniel', 'Liashenko',
     'Volleyballnetz plus zwei Bälle',
     'Interne und Externe Events', 'Interne Events',
     154.97, date '2026-05-11', 'DE16700700240941194300', 'bezahlt',
     timestamp '2026-05-27 11:33:00', ''),
    ('1pX28k3sQNp8bj0IJZIqyFjrwwKD2Ozmp', 'Mubaraz Ahmed', 'Rana',
     'Einkauf für die Sommerbar whärend des Kickerturniers',
     'Sommerbar Kickerturnier', 'Sommerbar Kickerturnier',
     118.17, date '2026-05-19', 'DE72100123450779074201', 'bezahlt',
     timestamp '2026-06-03 14:30:26', ''),
    ('1DX8a4CF1iQ4iw-HxRsQTeZQUiXMXMVvV', 'Dominik', 'Kocsordi',
     'FS Webseite/Merchshop',
     'Webseite/Shop', 'Webseite / Shop',
     99, date '2026-06-15', '', 'bezahlt',
     timestamp '2026-06-15 09:11:04', 'Im Google-Formular stand als IBAN „-“ — keine gültige Bankverbindung. Bitte beim Einreicher nachfragen.'),
    ('18AwPP22oY52VcP4_HJnIssLReS9cNlKm', 'Jule', 'Friedrich',
     'Fahrtkosten Bierpong Turnier',
     'Bierpongturnier', 'Bierpongturnier',
     42.56, date '2026-06-14', 'DE60701500001003147772', 'bezahlt',
     timestamp '2026-06-27 11:17:16', ''),
    ('1m5otbbWhEOKI6n9OzR-9diUtWtEVo09R', 'Saya', 'Sümer',
     'Einkaufsbeleg',
     'Semester Opening WS 25/26', 'Semester Opening',
     46.65, date '2025-11-14', 'DE75500105175454259472', 'bezahlt',
     timestamp '2026-06-30 09:59:46', ''),
    ('1ZIJDseVxpRbnjwzje4gs9OiBaNVdV4xl', 'Saya', 'Sümer',
     'Einkaufsbeleg',
     'Semester Opening WS 25/26', 'Semester Opening',
     14, date '2025-11-14', 'DE75500105175454259472', 'bezahlt',
     timestamp '2026-06-30 10:01:06', ''),
    ('1nxFRQft41Gh1kPUFYU32OqAFqELOG0Qc', 'Fabio', 'Grossi',
     'Kasten Bier für das "Englischer Garten Internernes Fachschafts Event am 13.06.2026',
     'Internes Event Englischer Garten', 'Interne Events',
     30.64, date '2026-06-13', 'DE80200411330601857600', 'bezahlt',
     timestamp '2026-06-30 13:02:41', ''),
    ('1t1Ahuze5UH2Wb3-DYx8spJDBDejoUPhI', 'Jule', 'Friedrich',
     'Semester Closing',
     'Semester Closing', 'Semester Closing',
     222.2, date '2026-07-24', 'DE60701500001003147772', 'bezahlt',
     timestamp '2026-07-24 10:50:28', ''),
    ('1MGozCR_n2miLmV45FbXjt4eqhncPRHAH', 'Benjamin', 'Mustafic',
     'Semester closing',
     'Semester closing', 'Semester Closing',
     222.2, date '2026-07-24', 'DE51701500001005037591', 'bezahlt',
     timestamp '2026-07-24 20:56:47', ''))
insert into public.rechnungen (
    drive_id, drive_link, vorname, nachname, beschreibung,
    projekt_roh, projekt_id, betrag, beleg_datum, iban,
    status, status_am, created_at, notiz, quelle
)
select q.drive_id,
       'https://drive.google.com/open?id=' || q.drive_id,
       q.vorname,
       q.nachname,
       q.beschreibung,
       q.projekt_roh,
       p.id,
       q.betrag,
       q.beleg_datum,
       nullif(q.iban, ''),
       q.status,
       -- Den Stand hat jemand irgendwann nach dem Eingang gesetzt; genauer
       -- weiß es das Formular nicht. Der Eingang ist die ehrlichste Angabe.
       q.eingegangen at time zone 'Europe/Berlin',
       q.eingegangen at time zone 'Europe/Berlin',
       nullif(q.notiz, ''),
       'import'
  from quelle q
  left join public.rechnung_projekte p on p.name = q.projekt_name
 on conflict (drive_id) where drive_id is not null do nothing;


-- ---- Nachsehen, ob alles angekommen ist -------------------------------------
--
--   select count(*), sum(betrag) from public.rechnungen where quelle = 'import';
--     → 34 und 3476.76
--
--   select projekt, count(*), sum(betrag) from public.rechnungen
--    group by projekt order by 3 desc;
--
--   select code, vorname, nachname, notiz from public.rechnungen
--    where notiz is not null;
--     → die drei Zeilen ohne IBAN und die eine mit dem seltsamen Datum
--
-- Und falls doch einmal alles zurückgenommen werden soll — das trifft nur die
-- übernommenen Zeilen, nichts, was seither über das Formular hereinkam:
--
--   delete from public.rechnungen where quelle = 'import';
-- =============================================================================
