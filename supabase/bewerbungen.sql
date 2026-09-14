-- =============================================================================
--  Bewerbungen – Formular auf portal.fsbs-hm.de/bewerbung
-- =============================================================================
--  Einmal komplett im Supabase SQL-Editor ausführen. Das Skript ist
--  wiederholbar: ein zweiter Durchlauf ändert nichts und löscht nichts.
--
--  Es löst das Google-Formular ab. Die Fragen stehen nicht mehr im Quelltext
--  der Seite, sondern in `bewerbung_felder` – der Vorstand ändert sie im
--  Portal, das Formular richtet sich beim nächsten Aufruf danach.
--
--  Was die Auswertung braucht, steht dagegen in eigenen Spalten: Name,
--  E-Mail, Telefon und die beiden Ressortwünsche. Sie sind fest, damit die
--  Liste im Portal und die Übernahme als Anwärter nicht davon abhängen, wie
--  eine Frage gerade heißt. Alles Übrige landet in `antworten`.
-- =============================================================================

create extension if not exists pgcrypto;


-- 1 ---------------------------------------------------------------- Ressorts
-- Quelle für die beiden Prioritäten-Dropdowns. `active = false` blendet einen
-- Eintrag aus, ohne bestehende Bewerbungen zu verlieren.

create table if not exists public.bewerbung_ressorts (
    id         uuid primary key default gen_random_uuid(),
    name       text        not null unique,
    sort_order integer     not null default 0,
    active     boolean     not null default true,
    created_at timestamptz not null default now()
);

insert into public.bewerbung_ressorts (name, sort_order) values
    ('Externe Events', 1),
    ('Interne Events', 2),
    ('Sponsoring',     3),
    ('Merchandise',    4),
    ('Kommunikation',  5)
on conflict (name) do nothing;


-- 2 ------------------------------------------------------------------ Fragen
-- Das, was das Formular unter den festen Feldern zeigt. Reihenfolge über
-- `sort_order`, Sichtbarkeit über `active` – eine gelöschte Frage nähme die
-- bereits gegebenen Antworten mit, `active = false` nicht.
--
--   text      einzeilig
--   textarea  mehrzeilig
--   zahl      Ziffern, mit `min`/`max` eingegrenzt
--   auswahl   eine aus `optionen`
--   mehrfach  beliebig viele aus `optionen`
--   ja_nein   Häkchen
--   datei     Upload in den Ordner `bewerbungen` (Block 10)
--
-- `feld_key` ist der Schlüssel, unter dem die Antwort in `antworten` liegt.
-- Er bleibt, auch wenn die Frage umformuliert wird – sonst verlören ältere
-- Bewerbungen ihren Bezug.

create table if not exists public.bewerbung_felder (
    id         uuid primary key default gen_random_uuid(),
    feld_key   text        not null unique,
    label      text        not null,
    typ        text        not null default 'text',
    hilfetext  text,
    optionen   text[]      not null default '{}',
    pflicht    boolean     not null default false,
    min_wert   integer,
    max_wert   integer,
    sort_order integer     not null default 0,
    active     boolean     not null default true,
    created_at timestamptz not null default now(),

    constraint bewerbung_felder_typ_bekannt
        check (typ in ('text', 'textarea', 'zahl', 'auswahl', 'mehrfach', 'ja_nein', 'datei')),

    -- Der Schlüssel wandert in JSON und in Formular-IDs: Kleinbuchstaben,
    -- Ziffern und Unterstriche, sonst nichts.
    constraint bewerbung_felder_key_form
        check (feld_key ~ '^[a-z][a-z0-9_]{0,48}$'),

    constraint bewerbung_felder_label_laenge
        check (char_length(btrim(label)) between 1 and 400),

    -- Zur Auswahl gehören Optionen; ohne sie stünde ein leeres Dropdown da.
    constraint bewerbung_felder_optionen_noetig
        check (typ not in ('auswahl', 'mehrfach') or coalesce(array_length(optionen, 1), 0) >= 1)
);

create index if not exists bewerbung_felder_sortierung_idx
    on public.bewerbung_felder (sort_order, created_at);

-- Die Fragen des bisherigen Google-Formulars. Ab hier werden sie im Portal
-- gepflegt; dieser Block legt sie nur an, wenn sie noch fehlen.
insert into public.bewerbung_felder
    (feld_key, label, typ, optionen, pflicht, min_wert, max_wert, sort_order) values
    ('alter', 'Alter', 'zahl', '{}', true, 15, 99, 10),
    ('studiengang', 'Studiengang', 'auswahl',
     '{Bachelor,Master}', true, null, null, 20),
    ('semester', 'Semester', 'auswahl',
     '{1.,2.,3.,4.,5.,6.,7.,"8. oder höher"}', true, null, null, 30),
    ('motivation',
     'Warum bewirbst du dich um eine Mitgliedschaft in der Fachschaft?',
     'textarea', '{}', true, null, null, 40),
    ('erfahrung',
     'Welche bisherigen Erfahrungen und Kompetenzen bringst du mit, die in der Fachschaft von Nutzen sein können?',
     'textarea', '{}', true, null, null, 50),
    ('ressort_begruendung',
     'Warum hast du dich für diese beiden Ressorts entschieden? Was reizt dich daran besonders, und welchen Mehrwert kannst du dort einbringen?',
     'textarea', '{}', true, null, null, 60),
    ('foto', 'Lade bitte ein Foto von dir hoch', 'datei', '{}', true, null, null, 70)
on conflict (feld_key) do nothing;


-- 3 ------------------------------------------------------------- Einwilligung
-- Derselbe Bau wie bei den Zutritten: Der Wortlaut steht in der Datenbank,
-- die Seite lädt ihn und schickt beim Absenden dessen ID mit. Zu jeder
-- Bewerbung ist damit belegt, welcher Fassung zugestimmt wurde.
--
-- Wortlaut ändern heißt: neue Zeile einfügen, alte auf `active = false`.
-- Bereits gespeicherte Bewerbungen behalten ihre eigene.

create table if not exists public.bewerbung_einwilligung (
    id         uuid primary key default gen_random_uuid(),
    text       text        not null unique,
    active     boolean     not null default true,
    created_at timestamptz not null default now()
);

insert into public.bewerbung_einwilligung (text) values
    ('Ich willige ein, dass die Fachschaft Business School e.V. die hier angegebenen Daten zur Bearbeitung meiner Bewerbung speichert und verarbeitet. Die Daten werden ausschließlich für das Bewerbungsverfahren verwendet und nach dessen Abschluss gelöscht, sofern keine Mitgliedschaft zustande kommt.')
on conflict (text) do nothing;


-- 4 ----------------------------------------------------------- Bewerbungsfrist
-- Eine Zeile, die sagt, ob das Formular noch etwas entgegennimmt: bis `frist`
-- (leer = ohne Ende), sofern nicht `geschlossen`. Dazu die beiden Texte, die
-- über dem Formular stehen. Der Vorstand stellt alles im Portal.

create table if not exists public.bewerbung_formular (
    id            boolean primary key default true check (id),
    titel         text        not null default 'Bewerbung bei der Fachschaft Business School',
    intro         text,
    frist         timestamptz,
    geschlossen   boolean     not null default false,
    geaendert_am  timestamptz not null default now(),
    geaendert_von uuid
);

insert into public.bewerbung_formular (id, intro)
values (true, 'Schön, dass du dabei sein möchtest. Fülle das Formular in Ruhe aus – wir melden uns danach per E-Mail bei dir.')
on conflict (id) do nothing;

create or replace function public.bewerbung_offen()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(
        (select not geschlossen and (frist is null or now() < frist)
           from public.bewerbung_formular
          where id),
        true);
$$;

grant execute on function public.bewerbung_offen() to anon, authenticated;

create or replace function public.bewerbung_formular_notieren()
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

drop trigger if exists bewerbung_formular_notieren on public.bewerbung_formular;
create trigger bewerbung_formular_notieren
    before update on public.bewerbung_formular
    for each row execute function public.bewerbung_formular_notieren();


-- 5 ------------------------------------------------------------- Bewerbungen
-- `ressort_1`, `ressort_2` und `einwilligung_text` sind Klartext-Kopien, die
-- der Trigger aus Block 7 setzt: Die Tabelle bleibt im Supabase-Editor lesbar,
-- und ein später umbenanntes Ressort verändert nicht rückwirkend, was jemand
-- angegeben hat.
--
-- `antworten` hält die Antworten auf die Fragen aus Block 2, `fragen` den
-- Wortlaut, der zum Zeitpunkt der Bewerbung galt. Auch hier gilt: Wird eine
-- Frage später umformuliert, bleibt nachvollziehbar, worauf geantwortet wurde.

create table if not exists public.bewerbungen (
    id                uuid primary key default gen_random_uuid(),
    vorname           text        not null,
    nachname          text        not null,
    email             text        not null,
    telefon           text,
    ressort_1_id      uuid        not null references public.bewerbung_ressorts (id),
    ressort_1         text,
    ressort_2_id      uuid                 references public.bewerbung_ressorts (id),
    ressort_2         text,
    antworten         jsonb       not null default '{}'::jsonb,
    fragen            jsonb       not null default '[]'::jsonb,
    foto_pfad         text,
    einwilligung_id   uuid        not null references public.bewerbung_einwilligung (id),
    einwilligung_text text,
    status            text        not null default 'offen',
    status_am         timestamptz,
    status_von        uuid,
    notiz             text,
    created_at        timestamptz not null default now(),

    -- Dieselben Stände, die die Liste im Portal schon kennt.
    constraint bewerbungen_status_bekannt
        check (status in ('offen', 'rueckmeldung', 'kennenlernen',
                          'prios_bestaetigt', 'anwaerter', 'abgelehnt')),

    constraint bewerbungen_vorname_laenge  check (char_length(btrim(vorname))  between 1 and 80),
    constraint bewerbungen_nachname_laenge check (char_length(btrim(nachname)) between 1 and 80),
    constraint bewerbungen_email_form      check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),

    -- Zwei Wünsche, nicht zweimal derselbe.
    constraint bewerbungen_ressorts_verschieden
        check (ressort_2_id is null or ressort_2_id <> ressort_1_id)
);

-- Eine E-Mail-Adresse bewirbt sich einmal. Ein zweiter Versuch endet mit 409,
-- das Formular meldet das im Klartext.
create unique index if not exists bewerbungen_email_eindeutig
    on public.bewerbungen (lower(btrim(email)));

create index if not exists bewerbungen_created_at_idx
    on public.bewerbungen (created_at desc);

create index if not exists bewerbungen_status_idx
    on public.bewerbungen (status);


-- 6 --------------------------------------- Nachtrag für frühere Installationen
-- Bei einer frischen Datenbank tut dieser Block nichts.

alter table public.bewerbungen add column if not exists telefon      text;
alter table public.bewerbungen add column if not exists ressort_2_id uuid references public.bewerbung_ressorts (id);
alter table public.bewerbungen add column if not exists ressort_2    text;
alter table public.bewerbungen add column if not exists antworten    jsonb not null default '{}'::jsonb;
alter table public.bewerbungen add column if not exists fragen       jsonb not null default '[]'::jsonb;
alter table public.bewerbungen add column if not exists foto_pfad    text;
alter table public.bewerbungen add column if not exists notiz        text;
alter table public.bewerbung_formular add column if not exists titel text not null
    default 'Bewerbung bei der Fachschaft Business School';
alter table public.bewerbung_formular add column if not exists intro text;


-- 7 ------------------------------------------------------------------ Trigger
-- Räumt die Eingaben auf, füllt die Klartext-Spalten und prüft die Antworten
-- gegen die Fragen aus Block 2. Das Formular schickt nur IDs und einen
-- JSON-Block; was gültig ist, entscheidet die Datenbank – nicht der Browser.

create or replace function public.bewerbungen_normalisieren()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    feld       record;
    wert       jsonb;
    gesammelt  jsonb := '[]'::jsonb;
    sauber     jsonb := '{}'::jsonb;
    zahl       numeric;
    eintrag    text;
begin
    new.vorname  := btrim(new.vorname);
    new.nachname := btrim(new.nachname);
    new.email    := lower(btrim(new.email));
    new.telefon  := nullif(btrim(coalesce(new.telefon, '')), '');

    select name into new.ressort_1
      from public.bewerbung_ressorts
     where id = new.ressort_1_id and active;

    if new.ressort_1 is null then
        raise exception 'Unbekanntes Ressort (Priorität 1)' using errcode = '23514';
    end if;

    if new.ressort_2_id is null then
        new.ressort_2 := null;
    else
        select name into new.ressort_2
          from public.bewerbung_ressorts
         where id = new.ressort_2_id and active;

        if new.ressort_2 is null then
            raise exception 'Unbekanntes Ressort (Priorität 2)' using errcode = '23514';
        end if;
    end if;

    select text into new.einwilligung_text
      from public.bewerbung_einwilligung
     where id = new.einwilligung_id and active;

    if new.einwilligung_text is null then
        raise exception 'Ohne gültige Einwilligung keine Bewerbung' using errcode = '23514';
    end if;

    -- Nur Antworten auf Fragen, die es gibt, kommen durch. Alles andere fällt
    -- still weg: Ein manipulierter Aufruf kann die Tabelle nicht vollschreiben.
    if new.antworten is null or jsonb_typeof(new.antworten) <> 'object' then
        new.antworten := '{}'::jsonb;
    end if;

    for feld in
        select * from public.bewerbung_felder
         where active
         order by sort_order, created_at
    loop
        wert := new.antworten -> feld.feld_key;

        -- Gefragt wurde es, also steht es in der Liste – ob beantwortet
        -- oder nicht.
        gesammelt := gesammelt || jsonb_build_array(jsonb_build_object(
            'feld_key', feld.feld_key,
            'label',    feld.label,
            'typ',      feld.typ
        ));

        -- Leeres zählt wie nicht beantwortet, egal in welcher Schreibweise.
        if wert is null
           or jsonb_typeof(wert) = 'null'
           or (jsonb_typeof(wert) = 'string' and btrim(wert #>> '{}') = '')
           or (jsonb_typeof(wert) = 'array'  and jsonb_array_length(wert) = 0) then
            if feld.pflicht and feld.typ <> 'ja_nein' then
                raise exception 'Pflichtfeld fehlt: %', feld.label using errcode = '23514';
            end if;
            continue;
        end if;

        case feld.typ
            when 'zahl' then
                begin
                    zahl := (wert #>> '{}')::numeric;
                exception when others then
                    raise exception 'Keine Zahl bei: %', feld.label using errcode = '23514';
                end;
                if feld.min_wert is not null and zahl < feld.min_wert then
                    raise exception 'Zu klein bei: %', feld.label using errcode = '23514';
                end if;
                if feld.max_wert is not null and zahl > feld.max_wert then
                    raise exception 'Zu groß bei: %', feld.label using errcode = '23514';
                end if;
                wert := to_jsonb(zahl);

            when 'auswahl' then
                if not (wert #>> '{}') = any (feld.optionen) then
                    raise exception 'Unbekannte Auswahl bei: %', feld.label using errcode = '23514';
                end if;

            when 'mehrfach' then
                if jsonb_typeof(wert) <> 'array' then
                    raise exception 'Mehrfachauswahl erwartet eine Liste: %', feld.label using errcode = '23514';
                end if;
                for eintrag in select jsonb_array_elements_text(wert) loop
                    if not eintrag = any (feld.optionen) then
                        raise exception 'Unbekannte Auswahl bei: %', feld.label using errcode = '23514';
                    end if;
                end loop;

            when 'ja_nein' then
                wert := to_jsonb((wert #>> '{}') in ('true', 't', '1', 'ja'));
                if feld.pflicht and not (wert #>> '{}')::boolean then
                    raise exception 'Pflichtfeld fehlt: %', feld.label using errcode = '23514';
                end if;

            else
                -- text, textarea, datei: getrimmter Text, in der Länge gedeckelt.
                eintrag := btrim(wert #>> '{}');
                if char_length(eintrag) > 5000 then
                    raise exception 'Antwort zu lang bei: %', feld.label using errcode = '23514';
                end if;
                wert := to_jsonb(eintrag);
        end case;

        sauber := sauber || jsonb_build_object(feld.feld_key, wert);
    end loop;

    new.antworten := sauber;
    new.fragen    := gesammelt;

    -- Zeitstempel und Bearbeitungsstand gehören der Datenbank, nicht dem
    -- Absender. Neu ist neu, egal was im Aufruf stand.
    new.created_at := now();
    new.status     := 'offen';
    new.status_am  := null;
    new.status_von := null;
    new.notiz      := null;
    return new;
end;
$$;

drop trigger if exists bewerbungen_normalisieren on public.bewerbungen;
create trigger bewerbungen_normalisieren
    before insert on public.bewerbungen
    for each row execute function public.bewerbungen_normalisieren();


-- 8 ------------------------------------------------- Bearbeitungsstand-Verlauf
-- Wer den Stand ändert und wann, hält die Datenbank selbst fest. Die Seite
-- schickt nur den neuen Stand. Die Ressortwünsche darf der Vorstand im Portal
-- korrigieren – die Klartext-Spalten ziehen dann mit.

create or replace function public.bewerbungen_pflegen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.status is distinct from old.status then
        new.status_am  := now();
        new.status_von := auth.uid();
    end if;

    if new.ressort_1_id is distinct from old.ressort_1_id then
        select name into new.ressort_1
          from public.bewerbung_ressorts
         where id = new.ressort_1_id and active;
        if new.ressort_1 is null then
            raise exception 'Unbekanntes Ressort (Priorität 1)' using errcode = '23514';
        end if;
    end if;

    if new.ressort_2_id is distinct from old.ressort_2_id then
        if new.ressort_2_id is null then
            new.ressort_2 := null;
        else
            select name into new.ressort_2
              from public.bewerbung_ressorts
             where id = new.ressort_2_id and active;
            if new.ressort_2 is null then
                raise exception 'Unbekanntes Ressort (Priorität 2)' using errcode = '23514';
            end if;
        end if;
    end if;

    return new;
end;
$$;

drop trigger if exists bewerbungen_pflegen on public.bewerbungen;
create trigger bewerbungen_pflegen
    before update on public.bewerbungen
    for each row execute function public.bewerbungen_pflegen();


-- 9 ----------------------------------------------------------- Wer darf was
-- `ist_vorstand()` gibt es seit den Zutritten; hier steht sie noch einmal,
-- damit dieses Skript für sich allein läuft. Sie ist wortgleich, ein zweiter
-- Durchlauf ändert also nichts.
--
-- Die Liste der Bewerbungen sieht auch die Ressortleitung – sie muss die
-- Wünsche für ihr Ressort einschätzen können. Ändern darf nur der Vorstand.

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

create or replace function public.ist_leitung()
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
           and lower(btrim(role)) in ('vorstand', 'ressortleiter')
    );
$$;

grant execute on function public.ist_vorstand() to authenticated;
-- Auch anon: Die Lese-Policies unten rufen sie mit auf, und ein ODER
-- wertet nicht verlässlich von links nach rechts aus.
grant execute on function public.ist_leitung()  to anon, authenticated;


-- 10 --------------------------------------------------------- Bewerbungsfotos
-- Ein nicht-öffentlicher Ordner: Hochladen darf jeder, der das Formular
-- ausfüllt, ansehen nur Vorstand und Ressortleitung – die Seite holt sich
-- dafür einen zeitlich begrenzten Link. Ohne diesen Block lädt das Formular
-- kein Foto hoch, alles andere funktioniert weiter.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bewerbungen', 'bewerbungen', false, 8388608,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update
   set "public"           = false,
       file_size_limit    = 8388608,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

drop policy if exists "bewerbungsfoto hochladen" on storage.objects;
create policy "bewerbungsfoto hochladen" on storage.objects
    for insert to anon, authenticated
    with check (bucket_id = 'bewerbungen' and public.bewerbung_offen());

drop policy if exists "bewerbungsfoto ansehen" on storage.objects;
create policy "bewerbungsfoto ansehen" on storage.objects
    for select to authenticated
    using (bucket_id = 'bewerbungen' and public.ist_leitung());

drop policy if exists "bewerbungsfoto entfernen" on storage.objects;
create policy "bewerbungsfoto entfernen" on storage.objects
    for delete to authenticated
    using (bucket_id = 'bewerbungen' and public.ist_vorstand());


-- 11 -------------------------------------------------------------------- RLS
-- Das Formular läuft mit dem öffentlichen Schlüssel. Es darf die Listen lesen
-- und eintragen – die eingegangenen Bewerbungen selbst nicht.

alter table public.bewerbung_ressorts     enable row level security;
alter table public.bewerbung_felder       enable row level security;
alter table public.bewerbung_einwilligung enable row level security;
alter table public.bewerbung_formular     enable row level security;
alter table public.bewerbungen            enable row level security;

-- ---- Listen: lesen darf jeder, ändern nur der Vorstand ----------------------
drop policy if exists "ressorts lesen" on public.bewerbung_ressorts;
create policy "ressorts lesen" on public.bewerbung_ressorts
    for select to anon, authenticated
    using (active or public.ist_leitung());

drop policy if exists "ressorts pflegen" on public.bewerbung_ressorts;
create policy "ressorts pflegen" on public.bewerbung_ressorts
    for all to authenticated
    using (public.ist_vorstand())
    with check (public.ist_vorstand());

drop policy if exists "felder lesen" on public.bewerbung_felder;
create policy "felder lesen" on public.bewerbung_felder
    for select to anon, authenticated
    using (active or public.ist_leitung());

drop policy if exists "felder pflegen" on public.bewerbung_felder;
create policy "felder pflegen" on public.bewerbung_felder
    for all to authenticated
    using (public.ist_vorstand())
    with check (public.ist_vorstand());

drop policy if exists "einwilligung lesen" on public.bewerbung_einwilligung;
create policy "einwilligung lesen" on public.bewerbung_einwilligung
    for select to anon, authenticated
    using (active);

drop policy if exists "einwilligung pflegen" on public.bewerbung_einwilligung;
create policy "einwilligung pflegen" on public.bewerbung_einwilligung
    for all to authenticated
    using (public.ist_vorstand())
    with check (public.ist_vorstand());

drop policy if exists "formular lesen" on public.bewerbung_formular;
create policy "formular lesen" on public.bewerbung_formular
    for select to anon, authenticated
    using (true);

drop policy if exists "formular stellen" on public.bewerbung_formular;
create policy "formular stellen" on public.bewerbung_formular
    for update to authenticated
    using (public.ist_vorstand())
    with check (public.ist_vorstand());

-- ---- Bewerbungen ------------------------------------------------------------
-- Nach der Frist nimmt die Datenbank nichts mehr an, nicht erst die Seite.
drop policy if exists "bewerbung abgeben" on public.bewerbungen;
create policy "bewerbung abgeben" on public.bewerbungen
    for insert to anon, authenticated
    with check (public.bewerbung_offen());

drop policy if exists "bewerbungen lesen" on public.bewerbungen;
create policy "bewerbungen lesen" on public.bewerbungen
    for select to authenticated
    using (public.ist_leitung());

drop policy if exists "bewerbungen bearbeiten" on public.bewerbungen;
create policy "bewerbungen bearbeiten" on public.bewerbungen
    for update to authenticated
    using (public.ist_vorstand())
    with check (public.ist_vorstand());


-- 12 ------------------------------------------------------------------ Rechte
-- RLS entscheidet über die Zeilen, diese Rechte über die Spalten. Beides muss
-- zusammenpassen: Was hier nicht steht, kommt von außen nicht herein.

grant select on public.bewerbung_ressorts     to anon, authenticated;
grant select on public.bewerbung_felder       to anon, authenticated;
grant select on public.bewerbung_einwilligung to anon, authenticated;
grant select on public.bewerbung_formular     to anon, authenticated;

grant insert, update, delete on public.bewerbung_ressorts     to authenticated;
grant insert, update, delete on public.bewerbung_felder       to authenticated;
grant insert, update, delete on public.bewerbung_einwilligung to authenticated;

-- Am Formularzustand dreht der Vorstand nur diese vier Stellschrauben.
revoke insert, update, delete on public.bewerbung_formular from anon, authenticated;
grant update (titel, intro, frist, geschlossen) on public.bewerbung_formular to authenticated;

-- Eintragen darf das Formular nur die Felder, die es auch ausfüllt: Stand,
-- Zeitstempel und die Klartext-Kopien sind von außen nicht setzbar.
revoke insert, update, delete on public.bewerbungen from anon, authenticated;
grant insert (vorname, nachname, email, telefon,
              ressort_1_id, ressort_2_id, antworten, foto_pfad, einwilligung_id)
    on public.bewerbungen to anon, authenticated;
grant select on public.bewerbungen to authenticated;
-- Später ändern lässt sich der Bearbeitungsstand, eine Notiz und – falls im
-- Formular etwas verrutscht ist – die beiden Ressortwünsche.
grant update (status, notiz, ressort_1_id, ressort_2_id) on public.bewerbungen to authenticated;
