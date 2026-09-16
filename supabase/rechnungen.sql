-- =============================================================================
--  Rechnungen & Auslagen – Formular auf portal.fsbs-hm.de/rechnung
-- =============================================================================
--  Einmal komplett im Supabase SQL-Editor ausführen. Das Skript ist
--  wiederholbar: ein zweiter Durchlauf ändert nichts und löscht nichts.
--
--  Es löst das Google-Formular ab, mit dem die Fachschaft bisher Auslagen
--  eingesammelt hat. Was dort in einer Tabelle stand, steht jetzt hier – samt
--  Beleg, der nicht mehr in einem Google-Drive-Ordner liegt, sondern im
--  Supabase-Ordner `belege`, unmittelbar an seiner Zeile.
--
--  Drei Wege führen herein:
--
--    1. `portal.fsbs-hm.de/rechnung` – das öffentliche Formular für alle, die
--       keinen Zugang zum Portal haben. Es trägt über `rechnung_einreichen()`
--       ein, nicht unmittelbar in die Tabelle.
--    2. Der Vorstand auf `/rechnungen`, der eine Auslage selbst nachträgt.
--    3. supabase/rechnungen-import.sql – die Zeilen aus dem Google-Formular.
--
--  Danach gehört supabase/rechnung-schutz.sql an die Reihe: Es füllt die
--  Einhängepunkte aus Block 12 mit dem Captcha und der Bremse je IP-Adresse.
-- =============================================================================

create extension if not exists pgcrypto;


-- 1 -------------------------------------------------------------- Vorschläge
-- Wofür das Geld ausgegeben wurde. Das Feld im Formular ist frei: Was dort
-- steht, steht so in der Zeile – ein Projekt, das es vorher nicht gab,
-- braucht niemanden zu fragen.
--
-- Diese Tabelle ist deshalb keine Auswahl, sondern eine Handreichung: Ihre
-- aktiven Namen stehen als Vorschläge im Feld, damit „FS Wochenende“ nicht
-- wieder als „Fs-We“ und „FS Wochenende “ in der Auswertung landet.
--
-- `active = false` nimmt einen Namen aus den Vorschlägen, ohne die bereits
-- eingereichten Belege zu verlieren: Deren Projekt steht als Klartext in
-- ihrer eigenen Zeile und bleibt filterbar.

create table if not exists public.rechnung_projekte (
    id         uuid primary key default gen_random_uuid(),
    name       text        not null unique,
    sort_order integer     not null default 0,
    active     boolean     not null default true,
    created_at timestamptz not null default now(),

    constraint rechnung_projekte_name_laenge
        check (char_length(btrim(name)) between 1 and 120)
);

create index if not exists rechnung_projekte_sortierung_idx
    on public.rechnung_projekte (sort_order, name);

-- Die Projekte, die in den Einträgen des Google-Formulars vorkamen. Dieser
-- Block legt sie nur an, wenn sie noch fehlen; ab hier werden sie im Portal
-- gepflegt.
insert into public.rechnung_projekte (name, sort_order) values
    ('FS Wochenende',              10),
    ('Anwärterprojekt',            20),
    ('Onboarding',                 30),
    ('Anwärter Kennenlernen',      40),
    ('Semester Opening',           50),
    ('Semester Closing',           60),
    ('Weihnachtsfeier',            70),
    ('Nikolausaktion',             80),
    ('Stadtrallye',                90),
    ('Ersti-Tüten',               100),
    ('Bierpongturnier',           110),
    ('Sommerbar Kickerturnier',   120),
    ('Interne Events',            130),
    ('Externe Events',            140),
    ('Party',                     150),
    ('Blumen & Geschenke',        155),
    ('Merchandise',               160),
    ('Webseite / Shop',           170),
    ('Software',                  180),
    ('Sonstiges',                 999)
on conflict (name) do nothing;

-- Vorgeschlagen wird nur eine Handvoll: Eine Liste, die man erst lesen muss,
-- nimmt dem freien Feld seinen Sinn. Die übrigen Namen bleiben stehen – im
-- Portal sind sie weiter Filter –, sie stehen nur nicht mehr im Feld.
--
-- Das ist die eine Stelle, an der ein zweiter Durchlauf etwas zurückdreht:
-- Wer andere Vorschläge will, setzt `active` danach selbst.
with vorschlag (name) as (
    values ('Anwärterprojekt'), ('FS Wochenende'), ('Semester Closing'),
           ('Semester Opening'), ('Stadtrallye')
)
update public.rechnung_projekte p
   set active = (exists (select 1 from vorschlag v where v.name = p.name))
 where p.active is distinct from
       (exists (select 1 from vorschlag v where v.name = p.name));


-- 2 ------------------------------------------------------------- Einwilligung
-- Derselbe Bau wie bei den Bewerbungen: Der Wortlaut steht in der Datenbank,
-- die Seite lädt ihn und schickt beim Absenden dessen ID mit. Zu jeder
-- Einreichung ist damit belegt, welcher Fassung zugestimmt wurde – und das
-- ist hier nicht nebensächlich, denn eine IBAN ist eine Bankverbindung.
--
-- Wortlaut ändern heißt: neue Zeile einfügen, alte auf `active = false`.
-- Bereits gespeicherte Einreichungen behalten ihre eigene.

create table if not exists public.rechnung_einwilligung (
    id         uuid primary key default gen_random_uuid(),
    text       text        not null unique,
    active     boolean     not null default true,
    created_at timestamptz not null default now()
);

insert into public.rechnung_einwilligung (text) values
    ('Ich willige ein, dass die Fachschaft Business School e.V. die hier angegebenen Daten einschließlich meiner Bankverbindung zur Prüfung und Auszahlung dieser Auslage speichert und verarbeitet. Die Daten werden ausschließlich dafür und für die Buchhaltung des Vereins verwendet.')
on conflict (text) do nothing;


-- 3 ------------------------------------------------------- Zustand des Formulars
-- Eine Zeile, die sagt, ob das Formular gerade etwas entgegennimmt, dazu die
-- beiden Texte darüber. Zwischen Kassenabschluss und Jahreswechsel lässt sich
-- damit zumachen, ohne die Seite anzufassen.

create table if not exists public.rechnung_formular (
    id            boolean primary key default true check (id),
    titel         text        not null default 'Rechnung & Auslage einreichen',
    intro         text,
    geschlossen   boolean     not null default false,
    hinweis_zu    text        not null default 'Zurzeit nehmen wir keine Belege entgegen. Bitte wende dich an den Vorstand.',
    geaendert_am  timestamptz not null default now(),
    geaendert_von uuid
);

insert into public.rechnung_formular (id, intro)
values (true, 'Du hast für die Fachschaft etwas ausgelegt? Lade hier deinen Beleg hoch – wir erstatten dir den Betrag auf dein Konto.')
on conflict (id) do nothing;

create or replace function public.rechnung_offen()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce((select not geschlossen from public.rechnung_formular where id), true);
$$;

grant execute on function public.rechnung_offen() to anon, authenticated;

create or replace function public.rechnung_formular_notieren()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    new.id            := true;
    new.geaendert_am  := now();
    new.geaendert_von := auth.uid();
    return new;
end;
$$;

drop trigger if exists rechnung_formular_notieren on public.rechnung_formular;
create trigger rechnung_formular_notieren
    before update on public.rechnung_formular
    for each row execute function public.rechnung_formular_notieren();


-- 4 ------------------------------------------------------------ Die Belegzeile
-- `projekt` ist eine Klartext-Kopie, die der Trigger aus Block 6 setzt: Die
-- Tabelle bleibt im Supabase-Editor lesbar, und ein später umbenanntes
-- Projekt verändert nicht rückwirkend, was jemand eingereicht hat.
--
-- Die Stände:
--
--   offen      eingegangen, noch niemand hat hingesehen
--   pruefung   liegt beim Vorstand zur Prüfung
--   bezahlt    überwiesen
--   abgelehnt  wird nicht erstattet (`notiz` sagt, warum)
--
-- `drive_id` hält die Herkunft der übernommenen Zeilen fest. Sie ist das
-- Band, an dem supabase/rechnungen-import.sql ein zweites Mal laufen kann,
-- ohne alles doppelt einzutragen, und an dem die Belege-Migration später
-- jede Datei ihrer Zeile zuordnet.

create table if not exists public.rechnungen (
    id              uuid primary key default gen_random_uuid(),
    code            text,

    vorname         text        not null,
    nachname        text        not null,
    email           text,

    beschreibung    text        not null,
    projekt_id      uuid        references public.rechnung_projekte (id) on delete set null,
    projekt         text,
    -- Was im Google-Formular als Projekt getippt wurde. Dort war das ein
    -- freies Feld, und „FS Wochenende“, „Fs-We“ und „FS Wochenende “ waren
    -- drei Projekte. Der Import ordnet jede Zeile einem Projekt aus Block 1
    -- zu und hebt daneben auf, was ursprünglich dastand.
    projekt_roh     text,

    betrag          numeric(10,2) not null,
    beleg_datum     date        not null,
    iban            text,

    status          text        not null default 'offen',
    status_am       timestamptz not null default now(),
    status_von      uuid,
    bezahlt_am      date,
    notiz           text,

    beleg_pfad      text,
    beleg_name      text,
    beleg_typ       text,
    drive_id        text,
    drive_link      text,

    quelle          text        not null default 'formular',
    einwilligung_id uuid        references public.rechnung_einwilligung (id),
    einwilligung_text text,

    erfasst_von     uuid,
    created_at      timestamptz not null default now(),

    constraint rechnungen_status_bekannt
        check (status in ('offen', 'pruefung', 'bezahlt', 'abgelehnt')),

    constraint rechnungen_quelle_bekannt
        check (quelle in ('formular', 'portal', 'import')),

    -- Null Euro ist kein Beleg, und fünfstellig war noch keiner. Wo doch,
    -- trägt der Vorstand ihn im Portal ein – dort gilt dieselbe Grenze, und
    -- sie lässt sich hier ändern, ohne dass jemand daran vorbeikommt.
    constraint rechnungen_betrag_plausibel
        check (betrag > 0 and betrag <= 100000),

    -- Nur die untere Grenze steht hier: `current_date` darf in einer
    -- Check-Regel nicht vorkommen (sie muss unveränderlich sein, und das
    -- Heute ist es nicht). Dass kein Beleg aus der Zukunft kommt, prüft
    -- darum der Trigger aus Block 6.
    constraint rechnungen_datum_plausibel
        check (beleg_datum >= date '2000-01-01'),

    constraint rechnungen_beschreibung_laenge
        check (char_length(btrim(beschreibung)) between 3 and 4000),

    constraint rechnungen_name_da
        check (char_length(btrim(vorname)) between 1 and 80
           and char_length(btrim(nachname)) between 1 and 80)
);

-- Ältere Installationen ziehen nach.
alter table public.rechnungen add column if not exists email             text;
alter table public.rechnungen add column if not exists projekt_roh       text;
alter table public.rechnungen add column if not exists beleg_typ         text;
alter table public.rechnungen add column if not exists drive_link        text;
alter table public.rechnungen add column if not exists einwilligung_text text;
alter table public.rechnungen add column if not exists erfasst_von       uuid;

create index if not exists rechnungen_status_idx      on public.rechnungen (status, created_at desc);
create index if not exists rechnungen_projekt_idx     on public.rechnungen (projekt_id);
create index if not exists rechnungen_beleg_datum_idx on public.rechnungen (beleg_datum desc);
create index if not exists rechnungen_name_idx        on public.rechnungen (lower(nachname), lower(vorname));

-- Zweimal dieselbe Drive-Datei wäre zweimal dasselbe Geld. Der Index lässt
-- Zeilen ohne Herkunft (alle neuen) beliebig oft zu.
create unique index if not exists rechnungen_drive_id_eindeutig
    on public.rechnungen (drive_id) where drive_id is not null;

-- Ein Beleg liegt genau einmal im Ordner.
create unique index if not exists rechnungen_beleg_pfad_eindeutig
    on public.rechnungen (beleg_pfad) where beleg_pfad is not null;


-- 5 -------------------------------------------------------- Die Vorgangsnummer
-- Fünf Zeichen, die jede Einreichung mitbekommt. Damit sieht nach, wer
-- eingereicht hat, wie weit die Erstattung ist – ohne Konto, ohne Passwort.
-- Und der Vorstand hat etwas, das sich am Telefon nennen lässt.
--
-- Das Alphabet ist dasselbe wie bei den Bewerbungen: Crockfords Base32,
-- also Ziffern und Großbuchstaben ohne I, L, O und U.

create or replace function public.rechnung_code_norm(p_code text)
returns text
language sql
immutable
as $$
    select nullif(
        translate(upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g')),
                  'OIL', '011'),
        '');
$$;

grant execute on function public.rechnung_code_norm(text) to anon, authenticated;

create or replace function public.rechnung_code_neu()
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
    zeichen  constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    kandidat text;
    i        integer;
begin
    for versuch in 1..50 loop
        kandidat := '';
        for i in 1..5 loop
            kandidat := kandidat ||
                substr(zeichen, 1 + (get_byte(gen_random_bytes(1), 0) % 32), 1);
        end loop;

        if not exists (select 1 from public.rechnungen where code = kandidat) then
            return kandidat;
        end if;
    end loop;

    raise exception 'Es ließ sich keine freie Vorgangsnummer finden';
end;
$$;

-- Zeilen aus der Zeit davor bekommen ihre Nummer nachträglich; erst danach
-- lässt sich die Spalte verpflichtend machen.
update public.rechnungen set code = public.rechnung_code_neu() where code is null;

create unique index if not exists rechnungen_code_eindeutig on public.rechnungen (code);

alter table public.rechnungen alter column code set not null;

do $$
begin
    if not exists (select 1 from pg_constraint
                    where conrelid = 'public.rechnungen'::regclass
                      and conname  = 'rechnungen_code_form') then
        alter table public.rechnungen
            add constraint rechnungen_code_form
            check (code ~ '^[0-9A-HJKMNP-TV-Z]{5}$');
    end if;
end;
$$;

-- Eine Nummer zur Probe ziehen. Bei leerer Tabelle rührt die Nachrüstung
-- oben die Funktion nicht an – ohne diese Zeile fiele erst der ersten echten
-- Einreichung auf, wenn hier etwas fehlt.
do $$
declare probe text;
begin
    probe := public.rechnung_code_neu();
    if probe !~ '^[0-9A-HJKMNP-TV-Z]{5}$' then
        raise exception 'Die Vorgangsnummer kommt verformt heraus: %', probe;
    end if;
end;
$$;


-- 6 ----------------------------------------------------------------- Trigger
-- Räumt die Eingaben auf und füllt die Klartext-Spalten. Was gültig ist,
-- entscheidet die Datenbank – nicht der Browser.

-- Eine IBAN ohne Leerzeichen und in Großbuchstaben. Gespeichert wird sie so;
-- angezeigt wird sie in Vierergruppen, das macht die Seite.
create or replace function public.rechnung_iban_norm(p_iban text)
returns text
language sql
immutable
as $$
    select nullif(upper(regexp_replace(coalesce(p_iban, ''), '[^0-9A-Za-z]', '', 'g')), '');
$$;

grant execute on function public.rechnung_iban_norm(text) to anon, authenticated;

create or replace function public.rechnungen_normalisieren()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    new.vorname      := btrim(new.vorname);
    new.nachname     := btrim(new.nachname);
    new.email        := nullif(lower(btrim(coalesce(new.email, ''))), '');
    new.beschreibung := btrim(new.beschreibung);
    new.notiz        := nullif(btrim(coalesce(new.notiz, '')), '');

    -- „DE12 3456“, „de123456“ und „DE12-3456“ sind dieselbe Verbindung.
    -- Was gar keine ist – im Google-Formular stand auch schon mal „-“ –,
    -- wird zu nichts: eine falsche IBAN ist schlechter als keine.
    new.iban := public.rechnung_iban_norm(new.iban);
    if new.iban is not null and new.iban !~ '^[A-Z]{2}[0-9]{2}[0-9A-Z]{10,30}$' then
        new.iban := null;
    end if;

    if new.code is null then
        new.code := public.rechnung_code_neu();
    end if;

    -- Das Projekt ist Klartext. Der Import schickt statt des Namens eine
    -- Zuordnung mit – dann kommt der Name aus der Liste. Alles andere ist
    -- getippt und gilt, wie es getippt wurde.
    if new.projekt_id is not null then
        select name into new.projekt
          from public.rechnung_projekte
         where id = new.projekt_id;

        if new.projekt is null then
            raise exception 'Unbekanntes Projekt' using errcode = '23514';
        end if;
    else
        new.projekt := nullif(btrim(coalesce(new.projekt, '')), '');

        -- Ein Projektname, der länger ist als diese Zeile, ist keiner.
        if char_length(new.projekt) > 120 then
            raise exception 'Der Projektname ist zu lang' using errcode = '23514';
        end if;
    end if;

    new.projekt_roh := nullif(btrim(coalesce(new.projekt_roh, '')), '');

    if new.einwilligung_id is not null and new.einwilligung_text is null then
        select text into new.einwilligung_text
          from public.rechnung_einwilligung
         where id = new.einwilligung_id;
    end if;

    -- Wer als bezahlt eingetragen wird, ist heute bezahlt worden — außer
    -- bei den übernommenen Zeilen: Wann dort überwiesen wurde, stand im
    -- Google-Formular nicht, und das heutige Datum wäre schlicht falsch.
    if new.status = 'bezahlt' and new.bezahlt_am is null and new.quelle <> 'import' then
        new.bezahlt_am := current_date;
    end if;

    -- Ein Beleg von morgen gibt es nicht. Ein Tag Luft bleibt: Wer um
    -- Mitternacht einreicht, sitzt womöglich in einer anderen Zeitzone.
    if new.beleg_datum > current_date + 1 then
        raise exception 'Das Belegdatum liegt in der Zukunft' using errcode = '23514';
    end if;

    return new;
end;
$$;

drop trigger if exists rechnungen_normalisieren on public.rechnungen;
create trigger rechnungen_normalisieren
    before insert on public.rechnungen
    for each row execute function public.rechnungen_normalisieren();


-- Beim Ändern: Wer den Stand dreht und wann, hält die Datenbank selbst fest.
-- Die Seite schickt nur den neuen Stand.
create or replace function public.rechnungen_pflegen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    -- Die Nummer gehört zum Vorgang, nicht zum Aufruf: einmal vergeben,
    -- bleibt sie – sonst liefe der Zettel des Einreichers ins Leere.
    new.code       := old.code;
    new.created_at := old.created_at;

    new.vorname      := btrim(new.vorname);
    new.nachname     := btrim(new.nachname);
    new.email        := nullif(lower(btrim(coalesce(new.email, ''))), '');
    new.beschreibung := btrim(new.beschreibung);
    new.notiz        := nullif(btrim(coalesce(new.notiz, '')), '');

    new.iban := public.rechnung_iban_norm(new.iban);
    if new.iban is not null and new.iban !~ '^[A-Z]{2}[0-9]{2}[0-9A-Z]{10,30}$' then
        new.iban := null;
    end if;

    -- Das Projekt lässt sich im Portal frei überschreiben. Wer den Klartext
    -- ändert, löst ihn damit von der Vorschlagsliste: Eine Zuordnung, die auf
    -- einen anderen Namen zeigt, wäre nur noch eine falsche Fährte.
    if new.projekt_id is distinct from old.projekt_id then
        if new.projekt_id is null then
            new.projekt := null;
        else
            select name into new.projekt
              from public.rechnung_projekte
             where id = new.projekt_id;
            if new.projekt is null then
                raise exception 'Unbekanntes Projekt' using errcode = '23514';
            end if;
        end if;
    elsif new.projekt is distinct from old.projekt then
        new.projekt    := nullif(btrim(coalesce(new.projekt, '')), '');
        new.projekt_id := null;

        if char_length(new.projekt) > 120 then
            raise exception 'Der Projektname ist zu lang' using errcode = '23514';
        end if;
    end if;

    -- Auch beim Nachbessern im Portal: Ein Beleg von morgen gibt es nicht.
    if new.beleg_datum > current_date + 1 then
        raise exception 'Das Belegdatum liegt in der Zukunft' using errcode = '23514';
    end if;

    if new.status is distinct from old.status then
        new.status_am  := now();
        new.status_von := auth.uid();

        -- „Bezahlt“ ohne Tag wäre eine Buchung ohne Datum.
        if new.status = 'bezahlt' and new.bezahlt_am is null then
            new.bezahlt_am := current_date;
        end if;
        -- Und zurückgedreht fällt der Tag wieder weg, sonst stünde er
        -- neben einem Vorgang, der gar nicht bezahlt ist.
        if new.status <> 'bezahlt' and old.status = 'bezahlt' then
            new.bezahlt_am := null;
        end if;
    end if;

    return new;
end;
$$;

drop trigger if exists rechnungen_pflegen on public.rechnungen;
create trigger rechnungen_pflegen
    before update on public.rechnungen
    for each row execute function public.rechnungen_pflegen();


-- 7 ------------------------------------------------------------ Wer darf was
-- `ist_vorstand()` gibt es im Projekt schon; hier steht sie noch einmal,
-- damit dieses Skript für sich allein läuft. Sie ist wortgleich, ein zweiter
-- Durchlauf ändert also nichts.

create or replace function public.ist_vorstand()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
          from public.profiles
         where id = auth.uid()
           and lower(btrim(role)) = 'vorstand'
    );
$$;

grant execute on function public.ist_vorstand() to anon, authenticated;


-- 8 -------------------------------------------------------------- Die Belege
-- Ein nicht-öffentlicher Ordner: Hochladen darf jeder, der das Formular
-- ausfüllt, ansehen nur der Vorstand – die Seite holt sich dafür einen
-- zeitlich begrenzten Link. Ohne diesen Block nimmt das Formular keinen
-- Beleg an, alles andere funktioniert weiter.
--
-- Kassenbons kommen als Foto, Rechnungen als PDF. Fünfzehn Megabyte reichen
-- für beides und für das, was ein Telefon ungefragt daraus macht.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('belege', 'belege', false, 15728640,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
              'image/gif', 'application/pdf'])
on conflict (id) do update
   set "public"           = false,
       file_size_limit    = 15728640,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic',
                                  'image/heif', 'image/gif', 'application/pdf'];

drop policy if exists "beleg hochladen" on storage.objects;
create policy "beleg hochladen" on storage.objects
    for insert to anon, authenticated
    with check (bucket_id = 'belege' and public.rechnung_offen());

drop policy if exists "beleg ansehen" on storage.objects;
create policy "beleg ansehen" on storage.objects
    for select to authenticated
    using (bucket_id = 'belege' and public.ist_vorstand());

drop policy if exists "beleg entfernen" on storage.objects;
create policy "beleg entfernen" on storage.objects
    for delete to authenticated
    using (bucket_id = 'belege' and public.ist_vorstand());


-- 9 -------------------------------------------------------------------- RLS
-- Das Formular läuft mit dem öffentlichen Schlüssel. Es darf die Projektliste
-- und die Einwilligung lesen – die eingegangenen Belege nicht. Dort stehen
-- Bankverbindungen.

alter table public.rechnung_projekte     enable row level security;
alter table public.rechnung_einwilligung enable row level security;
alter table public.rechnung_formular     enable row level security;
alter table public.rechnungen            enable row level security;

drop policy if exists "projekte lesen" on public.rechnung_projekte;
create policy "projekte lesen" on public.rechnung_projekte
    for select to anon, authenticated
    using (active or public.ist_vorstand());

drop policy if exists "projekte pflegen" on public.rechnung_projekte;
create policy "projekte pflegen" on public.rechnung_projekte
    for all to authenticated
    using (public.ist_vorstand())
    with check (public.ist_vorstand());

drop policy if exists "rechnung einwilligung lesen" on public.rechnung_einwilligung;
create policy "rechnung einwilligung lesen" on public.rechnung_einwilligung
    for select to anon, authenticated
    using (active);

drop policy if exists "rechnung einwilligung pflegen" on public.rechnung_einwilligung;
create policy "rechnung einwilligung pflegen" on public.rechnung_einwilligung
    for all to authenticated
    using (public.ist_vorstand())
    with check (public.ist_vorstand());

drop policy if exists "rechnung formular lesen" on public.rechnung_formular;
create policy "rechnung formular lesen" on public.rechnung_formular
    for select to anon, authenticated
    using (true);

drop policy if exists "rechnung formular pflegen" on public.rechnung_formular;
create policy "rechnung formular pflegen" on public.rechnung_formular
    for update to authenticated
    using (public.ist_vorstand())
    with check (public.ist_vorstand());

-- Die Belege selbst: Sache des Vorstands. Eingetragen wird von außen nur
-- über `rechnung_einreichen()` (Block 12), und die Funktion läuft mit den
-- Rechten ihres Eigentümers.
drop policy if exists "rechnungen lesen" on public.rechnungen;
create policy "rechnungen lesen" on public.rechnungen
    for select to authenticated
    using (public.ist_vorstand());

drop policy if exists "rechnungen anlegen" on public.rechnungen;
create policy "rechnungen anlegen" on public.rechnungen
    for insert to authenticated
    with check (public.ist_vorstand());

drop policy if exists "rechnungen aendern" on public.rechnungen;
create policy "rechnungen aendern" on public.rechnungen
    for update to authenticated
    using (public.ist_vorstand())
    with check (public.ist_vorstand());

drop policy if exists "rechnungen loeschen" on public.rechnungen;
create policy "rechnungen loeschen" on public.rechnungen
    for delete to authenticated
    using (public.ist_vorstand());


-- 10 ---------------------------------------------------------------- Rechte
-- RLS entscheidet über die Zeilen, diese Rechte über die Spalten. Beides muss
-- zusammenpassen: Was hier nicht steht, kommt von außen nicht herein.

grant select on public.rechnung_projekte     to anon, authenticated;
grant select on public.rechnung_einwilligung to anon, authenticated;
grant select on public.rechnung_formular     to anon, authenticated;

grant insert, update, delete on public.rechnung_projekte     to authenticated;
grant insert, update, delete on public.rechnung_einwilligung to authenticated;

revoke insert, update, delete on public.rechnung_formular from anon, authenticated;
grant update (titel, intro, geschlossen, hinweis_zu) on public.rechnung_formular to authenticated;

revoke insert, update, delete on public.rechnungen from anon, authenticated;
grant select, insert, delete on public.rechnungen to authenticated;
grant update (status, notiz, bezahlt_am, projekt_id, projekt, betrag, beleg_datum,
              beschreibung, iban, vorname, nachname, email,
              beleg_pfad, beleg_name, beleg_typ) on public.rechnungen to authenticated;


-- 11 ------------------------------------------------- Einhängepunkte für den Schutz
-- Zwei Funktionen, die hier nichts tun. supabase/rechnung-schutz.sql ersetzt
-- sie durch die Captcha-Prüfung und die Bremse je IP-Adresse.
--
-- Der Umweg hat einen Grund: Beide Skripte sind wiederholbar, und wer dieses
-- hier ein zweites Mal laufen lässt, soll den Schutz nicht wieder abschalten.
--
-- `create or replace` wäre darum falsch – es setzte die echte Prüfung bei
-- jedem weiteren Durchlauf wieder auf „tut nichts“ zurück. Angelegt wird nur,
-- was noch fehlt.

do $anlegen$
begin
    if to_regprocedure('public.rechnung_schutz_pruefen(text)') is null then
        create function public.rechnung_schutz_pruefen(p_captcha_token text)
        returns void
        language plpgsql
        volatile
        security definer
        set search_path = public
        as $huelle$ begin return; end; $huelle$;

        revoke execute on function public.rechnung_schutz_pruefen(text) from public;
    end if;

    if to_regprocedure('public.rechnung_stand_pruefen()') is null then
        create function public.rechnung_stand_pruefen()
        returns void
        language plpgsql
        volatile
        security definer
        set search_path = public
        as $huelle$ begin return; end; $huelle$;

        revoke execute on function public.rechnung_stand_pruefen() from public;
    end if;

    if to_regprocedure('public.rechnung_stand_fehlschlag()') is null then
        create function public.rechnung_stand_fehlschlag()
        returns void
        language plpgsql
        volatile
        security definer
        set search_path = public
        as $huelle$ begin return; end; $huelle$;

        revoke execute on function public.rechnung_stand_fehlschlag() from public;
    end if;
end
$anlegen$;


-- 12 ------------------------------------------------ Einreichen und nachschauen
-- Zwei Funktionen, die das Formular aufruft. Beide laufen mit den Rechten
-- ihres Eigentümers: Die Tabelle selbst bleibt für anon verschlossen, und
-- nach außen geht nur, was hier ausdrücklich zurückgegeben wird.

-- ---- Einreichen -------------------------------------------------------------
-- Trägt die Auslage ein und liefert die Vorgangsnummer zurück. Eine
-- gewöhnliche INSERT-Anweisung könnte das nicht, ohne zugleich die ganze
-- Zeile zum Lesen freizugeben.

-- Das Projekt kam früher als Kennung aus der Auswahlliste. Jetzt ist es
-- Klartext, und damit ändert sich die Unterschrift der Funktion: Die alte
-- muss weg, sonst stünden zwei nebeneinander und PostgREST wüsste bei einem
-- Aufruf nicht, welche gemeint ist.
drop function if exists public.rechnung_einreichen(
    text, text, text, text, uuid, numeric, date, text, text, text, text, uuid, text);

create or replace function public.rechnung_einreichen(
    p_vorname         text,
    p_nachname        text,
    p_email           text,
    p_beschreibung    text,
    p_projekt         text,
    p_betrag          numeric,
    p_beleg_datum     date,
    p_iban            text,
    p_beleg_pfad      text default null,
    p_beleg_name      text default null,
    p_beleg_typ       text default null,
    p_einwilligung_id uuid default null,
    p_captcha_token   text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
    v_code text;
begin
    if not public.rechnung_offen() then
        -- Derselbe Fehlercode, den die RLS-Regel geliefert hätte: Die Seite
        -- zeigt daraufhin „Zurzeit geschlossen“.
        raise exception 'Zurzeit nehmen wir keine Belege entgegen'
            using errcode = '42501';
    end if;

    -- Captcha und Bremse. Ohne rechnung-schutz.sql ein Aufruf ins Leere.
    perform public.rechnung_schutz_pruefen(p_captcha_token);

    -- Ohne IBAN wäre nicht zu erstatten, was hier eingeht.
    if public.rechnung_iban_norm(p_iban) is null
       or public.rechnung_iban_norm(p_iban) !~ '^[A-Z]{2}[0-9]{2}[0-9A-Z]{10,30}$' then
        raise exception 'Bitte gib eine gültige IBAN an' using errcode = '23514';
    end if;

    -- Ohne Projekt wüsste hinterher niemand, wofür das Geld weg ist.
    if nullif(btrim(coalesce(p_projekt, '')), '') is null then
        raise exception 'Bitte trag ein Projekt ein' using errcode = '23514';
    end if;

    insert into public.rechnungen
        (vorname, nachname, email, beschreibung, projekt, betrag, beleg_datum,
         iban, beleg_pfad, beleg_name, beleg_typ, einwilligung_id, quelle)
    values
        (p_vorname, p_nachname, p_email, p_beschreibung, p_projekt, p_betrag,
         p_beleg_datum, p_iban, p_beleg_pfad, p_beleg_name, p_beleg_typ,
         p_einwilligung_id, 'formular')
    returning code into v_code;

    return v_code;
end;
$$;

grant execute on function public.rechnung_einreichen(
    text, text, text, text, text, numeric, date, text, text, text, text, uuid, text)
    to anon, authenticated;


-- ---- Nachschauen ------------------------------------------------------------
-- Was der Einreicher mit seiner Nummer sieht. Bewusst wenig: Vorname zur
-- Bestätigung, dass die Nummer die richtige ist, dazu Betrag, Stand und die
-- beiden Zeitpunkte. IBAN, Beleg und Notiz bleiben drin, wo sie hingehören.

drop function if exists public.rechnung_stand(text);

create or replace function public.rechnung_stand(p_code text)
returns table (
    vorname        text,
    betrag         numeric,
    projekt        text,
    beleg_datum    date,
    status         text,
    eingegangen_am timestamptz,
    stand_seit     timestamptz,
    bezahlt_am     date
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
    v_code  text := public.rechnung_code_norm(p_code);
    v_zeile record;
begin
    perform public.rechnung_stand_pruefen();

    select r.vorname, r.betrag, r.projekt, r.beleg_datum, r.status,
           r.created_at, r.status_am, r.bezahlt_am
      into v_zeile
      from public.rechnungen r
     where r.code = v_code
     limit 1;

    if found then
        vorname        := v_zeile.vorname;
        betrag         := v_zeile.betrag;
        projekt        := v_zeile.projekt;
        beleg_datum    := v_zeile.beleg_datum;
        status         := v_zeile.status;
        eingegangen_am := v_zeile.created_at;
        stand_seit     := v_zeile.status_am;
        bezahlt_am     := v_zeile.bezahlt_am;
        return next;
        return;
    end if;

    -- Eine Nummer, die es nicht gibt: Das zählt gegen die Bremse, damit sich
    -- die 33,5 Millionen Möglichkeiten nicht durchprobieren lassen.
    perform public.rechnung_stand_fehlschlag();
    return;
end;
$$;

grant execute on function public.rechnung_stand(text) to anon, authenticated;


-- 13 ------------------------------------------------------------- Nachlesen
-- Was gerade offen ist:
--
--   select status, count(*), sum(betrag)
--     from public.rechnungen group by status;
--
-- Wer wie viel bekommt, solange es nicht bezahlt ist:
--
--   select vorname, nachname, iban, sum(betrag)
--     from public.rechnungen
--    where status <> 'bezahlt' and status <> 'abgelehnt'
--    group by vorname, nachname, iban
--    order by 4 desc;
--
-- Und wo noch ein Beleg fehlt (etwa, weil die Drive-Migration ihn nicht
-- gefunden hat):
--
--   select code, vorname, nachname, beschreibung, drive_link
--     from public.rechnungen where beleg_pfad is null;
-- =============================================================================
