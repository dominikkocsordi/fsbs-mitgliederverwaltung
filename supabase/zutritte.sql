-- =============================================================================
--  Zutritte – Formular auf portal.fsbs-hm.de/zutritte
-- =============================================================================
--  Einmal komplett im Supabase SQL-Editor ausführen. Das Skript ist
--  wiederholbar: ein zweiter Durchlauf ändert nichts und löscht nichts. Es
--  bringt alles mit, was das Formular braucht – nachzutragen ist nichts.
-- =============================================================================

create extension if not exists pgcrypto;


-- 1 ---------------------------------------------------------------- Ressorts
-- Quelle für das Ressort-Dropdown. Wird in Supabase gepflegt, die Seite muss
-- dafür nicht neu ausgeliefert werden. `active = false` blendet einen Eintrag
-- aus, ohne bestehende Einsendungen zu verlieren.

create table if not exists public.zutritt_ressorts (
    id         uuid primary key default gen_random_uuid(),
    name       text        not null unique,
    sort_order integer     not null default 0,
    active     boolean     not null default true,
    created_at timestamptz not null default now()
);

insert into public.zutritt_ressorts (name, sort_order) values
    ('Externe Events', 1),
    ('Interne Events', 2),
    ('Merchandise',    3),
    ('Sponsoring',     4),
    ('Kommunikation',  5)
on conflict (name) do nothing;


-- 2 ------------------------------------------------------------------ Rollen
-- Quelle für das Rollen-Dropdown („Rolle ab 01.10.2026“). Im Formular
-- freiwillig, deshalb ist `rolle_id` in Block 4 nullable.

create table if not exists public.zutritt_rollen (
    id         uuid primary key default gen_random_uuid(),
    name       text        not null unique,
    sort_order integer     not null default 0,
    active     boolean     not null default true,
    created_at timestamptz not null default now()
);

insert into public.zutritt_rollen (name, sort_order) values
    ('FKR-Mitglied',      1),
    ('Vorstand',          2),
    ('Ressortleitung',    3),
    ('Co-Ressortleitung', 4)
on conflict (name) do nothing;


-- 3 ------------------------------------------------------------- Einwilligung
-- Der Text, den das Häkchen bestätigt, steht hier und nicht im Formular: die
-- Seite lädt ihn von hier und legt ihn daneben. So gibt es genau eine Fassung,
-- und zu jeder Einsendung ist belegt, welchem Wortlaut zugestimmt wurde.
--
-- Wortlaut ändern heißt: eine neue Zeile einfügen und die alte auf
-- `active = false` setzen. Die Seite nimmt immer die jüngste aktive Fassung;
-- bereits gespeicherte Einsendungen behalten ihre eigene.

create table if not exists public.zutritt_einwilligung (
    id         uuid primary key default gen_random_uuid(),
    text       text        not null unique,
    active     boolean     not null default true,
    created_at timestamptz not null default now()
);

insert into public.zutritt_einwilligung (text) values
    ('Ich bestätige, dass ich diese Angaben ausschließlich für mich selbst gemacht habe und sie wahrheitsgemäß sind. Ich stimme zu, dass meine Daten zur Dokumentation der Zutritte gespeichert, verarbeitet und an die Verwaltung der Hochschule München übertragen werden.')
on conflict (text) do nothing;


-- 4 ------------------------------------------------------------- Einsendungen
-- `ressort`, `rolle` und `einwilligung_text` sind Klartext-Kopien, die der
-- Trigger aus Block 6 setzt. Damit bleibt die Tabelle im Supabase-Editor
-- lesbar, und ein später umbenanntes Ressort verändert nicht rückwirkend, was
-- jemand angegeben hat.

create table if not exists public.zutritte (
    id                uuid primary key default gen_random_uuid(),
    vorname           text        not null,
    nachname          text        not null,
    -- Text, nicht Zahl: Matrikelnummern beginnen teils mit 0 (»00123456«),
    -- und als Zahl wäre die Null beim ersten Speichern verloren.
    matrikelnummer    text        not null,
    email             text        not null,
    ressort_id        uuid        not null references public.zutritt_ressorts (id),
    ressort           text,
    rolle_id          uuid                 references public.zutritt_rollen (id),
    rolle             text,
    einwilligung_id   uuid        not null references public.zutritt_einwilligung (id),
    einwilligung_text text,
    status            text        not null default 'offen',
    status_am         timestamptz,
    status_von        uuid,
    created_at        timestamptz not null default now(),

    constraint zutritte_status_bekannt
        check (status in ('offen', 'geprueft', 'rueckfrage', 'abgelehnt')),

    constraint zutritte_vorname_laenge  check (char_length(btrim(vorname))  between 1 and 80),
    constraint zutritte_nachname_laenge check (char_length(btrim(nachname)) between 1 and 80),
    constraint zutritte_email_form      check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
    constraint zutritte_matrikel_form   check (matrikelnummer ~ '^[0-9]{4,15}$')
);

-- Eine E-Mail-Adresse trägt sich genau einmal ein. Ein zweiter Versuch endet
-- mit 409, das Formular meldet das im Klartext.
create unique index if not exists zutritte_email_eindeutig
    on public.zutritte (lower(btrim(email)));

create index if not exists zutritte_created_at_idx
    on public.zutritte (created_at desc);


-- 5 --------------------------------------- Nachtrag für frühere Installationen
-- Wer Block 4 noch ohne die Einwilligung angelegt hat, bekommt die beiden
-- Spalten hier. Bei einer frischen Datenbank tut dieser Block nichts.

alter table public.zutritte
    add column if not exists einwilligung_id uuid references public.zutritt_einwilligung (id);
alter table public.zutritte
    add column if not exists einwilligung_text text;
alter table public.zutritte
    add column if not exists matrikelnummer text;
alter table public.zutritte
    add column if not exists status text not null default 'offen';
alter table public.zutritte
    add column if not exists status_am timestamptz;
alter table public.zutritte
    add column if not exists status_von uuid;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'zutritte_status_bekannt') then
        alter table public.zutritte add constraint zutritte_status_bekannt
            check (status in ('offen', 'geprueft', 'rueckfrage', 'abgelehnt'));
    end if;
end
$$;

-- Zur Pflicht wird die Spalte erst, wenn keine Einsendung ohne Einwilligung
-- mehr offen ist – sonst bliebe das Skript an Altbeständen hängen.
-- Auch die Matrikelnummer trägt sich nur einmal ein. Mehrere leere Felder
-- stören einen Unique-Index nicht, er darf deshalb sofort entstehen.
create unique index if not exists zutritte_matrikel_eindeutig
    on public.zutritte (matrikelnummer);

do $$
begin
    if not exists (select 1 from public.zutritte where einwilligung_id is null) then
        alter table public.zutritte alter column einwilligung_id set not null;
    end if;

    if not exists (select 1 from public.zutritte where matrikelnummer is null) then
        alter table public.zutritte alter column matrikelnummer set not null;

        if not exists (select 1 from pg_constraint where conname = 'zutritte_matrikel_form') then
            alter table public.zutritte add constraint zutritte_matrikel_form
                check (matrikelnummer ~ '^[0-9]{4,15}$');
        end if;
    end if;
end
$$;


-- 6 ------------------------------------------------------------------ Trigger
-- Räumt die Eingaben auf und füllt die Klartext-Spalten. Das Formular schickt
-- nur IDs; welcher Name und welcher Wortlaut dahinter stehen, entscheidet die
-- Datenbank – nicht der Browser. Unbekannte oder abgeschaltete Einträge werden
-- abgewiesen, eine Einsendung ohne Einwilligung ebenso.

create or replace function public.zutritte_normalisieren()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    new.vorname  := btrim(new.vorname);
    new.nachname := btrim(new.nachname);
    new.email    := lower(btrim(new.email));
    -- Leerzeichen fallen weg, die Ziffernfolge bleibt Zeichen für Zeichen
    -- erhalten – führende Nullen eingeschlossen.
    new.matrikelnummer := regexp_replace(coalesce(new.matrikelnummer, ''), '\s', '', 'g');

    -- Auf einer nachgerüsteten Datenbank ist die Spalte noch nullbar, solange
    -- Zeilen von früher offenstehen. Neu herein kommt trotzdem nichts ohne
    -- gültige Nummer.
    if new.matrikelnummer !~ '^[0-9]{4,15}$' then
        raise exception 'Ungültige Matrikelnummer' using errcode = '23514';
    end if;

    select name into new.ressort
      from public.zutritt_ressorts
     where id = new.ressort_id and active;

    if new.ressort is null then
        raise exception 'Unbekanntes Ressort' using errcode = '23514';
    end if;

    if new.rolle_id is null then
        new.rolle := null;
    else
        select name into new.rolle
          from public.zutritt_rollen
         where id = new.rolle_id and active;

        if new.rolle is null then
            raise exception 'Unbekannte Rolle' using errcode = '23514';
        end if;
    end if;

    select text into new.einwilligung_text
      from public.zutritt_einwilligung
     where id = new.einwilligung_id and active;

    if new.einwilligung_text is null then
        raise exception 'Ohne gültige Einwilligung kein Eintrag' using errcode = '23514';
    end if;

    -- Zeitstempel und Bearbeitungsstand gehören der Datenbank, nicht dem
    -- Absender. Neu ist neu, egal was im Aufruf stand.
    new.created_at := now();
    new.status     := 'offen';
    new.status_am  := null;
    new.status_von := null;
    return new;
end;
$$;

drop trigger if exists zutritte_normalisieren on public.zutritte;
create trigger zutritte_normalisieren
    before insert on public.zutritte
    for each row execute function public.zutritte_normalisieren();


-- 7 ------------------------------------------------- Bearbeitungsstand-Verlauf
-- Wer den Stand ändert und wann, hält die Datenbank selbst fest. Die Seite
-- schickt nur den neuen Stand.

create or replace function public.zutritte_status_notieren()
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
    return new;
end;
$$;

drop trigger if exists zutritte_status_notieren on public.zutritte;
create trigger zutritte_status_notieren
    before update on public.zutritte
    for each row execute function public.zutritte_status_notieren();


-- 8 -------------------------------------------------------- Wer ist Vorstand
-- Die Rolle steht in `profiles`. Als security definer liest die Funktion sie
-- auch dann, wenn die aufrufende Person die Tabelle selbst nicht sehen darf.

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

grant execute on function public.ist_vorstand() to authenticated;


-- 9 --------------------------------------------------------------------- RLS
-- Das Formular läuft mit dem öffentlichen Schlüssel. Es darf die drei Listen
-- lesen und eintragen – die Einsendungen selbst nicht. Die Liste der
-- Einsendungen sieht und bearbeitet ausschließlich der Vorstand.

alter table public.zutritt_ressorts     enable row level security;
alter table public.zutritt_rollen       enable row level security;
alter table public.zutritt_einwilligung enable row level security;
alter table public.zutritte             enable row level security;

drop policy if exists "ressorts lesen" on public.zutritt_ressorts;
create policy "ressorts lesen" on public.zutritt_ressorts
    for select to anon, authenticated
    using (active);

drop policy if exists "rollen lesen" on public.zutritt_rollen;
create policy "rollen lesen" on public.zutritt_rollen
    for select to anon, authenticated
    using (active);

drop policy if exists "einwilligung lesen" on public.zutritt_einwilligung;
create policy "einwilligung lesen" on public.zutritt_einwilligung
    for select to anon, authenticated
    using (active);

drop policy if exists "zutritt eintragen" on public.zutritte;
create policy "zutritt eintragen" on public.zutritte
    for insert to anon, authenticated
    with check (true);

drop policy if exists "zutritte lesen" on public.zutritte;
create policy "zutritte lesen" on public.zutritte
    for select to authenticated
    using (public.ist_vorstand());

drop policy if exists "zutritte stand setzen" on public.zutritte;
create policy "zutritte stand setzen" on public.zutritte
    for update to authenticated
    using (public.ist_vorstand())
    with check (public.ist_vorstand());

grant select on public.zutritt_ressorts     to anon, authenticated;
grant select on public.zutritt_rollen       to anon, authenticated;
grant select on public.zutritt_einwilligung to anon, authenticated;
-- Eintragen darf das Formular nur die Felder, die es auch ausfüllt: der
-- Bearbeitungsstand ist von außen nicht setzbar. Ändern lässt sich später
-- ebenfalls nur er – Namen und Angaben bleiben, wie sie eingegangen sind.
revoke insert, update on public.zutritte from anon, authenticated;
grant insert (vorname, nachname, matrikelnummer, email, ressort_id, rolle_id, einwilligung_id)
    on public.zutritte to anon, authenticated;
grant select        on public.zutritte to authenticated;
grant update (status) on public.zutritte to authenticated;
