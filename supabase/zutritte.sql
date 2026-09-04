-- =============================================================================
--  Zutritte – Formular auf portal.fsbs-hm.de/zutritte
-- =============================================================================
--  Einmal komplett im Supabase SQL-Editor ausführen. Das Skript ist
--  wiederholbar: ein zweiter Durchlauf ändert nichts und löscht nichts.
--
--  Danach fehlen nur noch die Ressorts – Block 6 am Ende dieser Datei.
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


-- 2 ------------------------------------------------------------------ Rollen
-- Quelle für das Rollen-Dropdown („Rolle ab 01.10.2026“). Im Formular
-- freiwillig, deshalb ist `rolle_id` in Block 3 nullable.

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


-- 3 ------------------------------------------------------------- Einsendungen
-- `ressort` und `rolle` sind Klartext-Kopien, die der Trigger aus Block 4
-- setzt. Damit bleibt die Tabelle im Supabase-Editor lesbar, und ein später
-- umbenanntes Ressort verändert nicht rückwirkend, was jemand angegeben hat.

create table if not exists public.zutritte (
    id         uuid primary key default gen_random_uuid(),
    vorname    text        not null,
    nachname   text        not null,
    email      text        not null,
    ressort_id uuid        not null references public.zutritt_ressorts (id),
    ressort    text,
    rolle_id   uuid                 references public.zutritt_rollen (id),
    rolle      text,
    created_at timestamptz not null default now(),

    constraint zutritte_vorname_laenge  check (char_length(btrim(vorname))  between 1 and 80),
    constraint zutritte_nachname_laenge check (char_length(btrim(nachname)) between 1 and 80),
    constraint zutritte_email_form      check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

-- Eine E-Mail-Adresse trägt sich genau einmal ein. Ein zweiter Versuch endet
-- mit 409, das Formular meldet das im Klartext.
create unique index if not exists zutritte_email_eindeutig
    on public.zutritte (lower(btrim(email)));

create index if not exists zutritte_created_at_idx
    on public.zutritte (created_at desc);


-- 4 ------------------------------------------------------------------ Trigger
-- Räumt die Eingaben auf und füllt die Klartext-Spalten. Das Formular schickt
-- nur IDs; welcher Name dahinter steht, entscheidet die Datenbank – nicht der
-- Browser. Unbekannte oder abgeschaltete Einträge werden abgewiesen.

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

    -- Der Zeitstempel gehört der Datenbank, nicht dem Absender.
    new.created_at := now();
    return new;
end;
$$;

drop trigger if exists zutritte_normalisieren on public.zutritte;
create trigger zutritte_normalisieren
    before insert on public.zutritte
    for each row execute function public.zutritte_normalisieren();


-- 5 --------------------------------------------------------------------- RLS
-- Das Formular läuft mit dem öffentlichen Schlüssel. Es darf die beiden
-- Dropdown-Listen lesen und eintragen – die Einsendungen selbst nicht.
-- Lesen darf nur, wer in der App angemeldet ist.

alter table public.zutritt_ressorts enable row level security;
alter table public.zutritt_rollen   enable row level security;
alter table public.zutritte         enable row level security;

drop policy if exists "ressorts lesen" on public.zutritt_ressorts;
create policy "ressorts lesen" on public.zutritt_ressorts
    for select to anon, authenticated
    using (active);

drop policy if exists "rollen lesen" on public.zutritt_rollen;
create policy "rollen lesen" on public.zutritt_rollen
    for select to anon, authenticated
    using (active);

drop policy if exists "zutritt eintragen" on public.zutritte;
create policy "zutritt eintragen" on public.zutritte
    for insert to anon, authenticated
    with check (true);

drop policy if exists "zutritte lesen" on public.zutritte;
create policy "zutritte lesen" on public.zutritte
    for select to authenticated
    using (true);

grant select on public.zutritt_ressorts to anon, authenticated;
grant select on public.zutritt_rollen   to anon, authenticated;
grant insert on public.zutritte         to anon, authenticated;
grant select on public.zutritte         to authenticated;


-- 6 ------------------------------------------------------- Ressorts eintragen
-- Der einzige Block, der noch angepasst werden muss: die Zeilen durch die
-- echten Ressorts ersetzen und ausführen. Die Zahl bestimmt die Reihenfolge im
-- Dropdown. Später ergänzen geht jederzeit mit demselben Befehl.
--
-- insert into public.zutritt_ressorts (name, sort_order) values
--     ('Externe Events',  1),
--     ('Interne Events',  2),
--     ('Marketing',       3),
--     ('Hochschulpolitik',4),
--     ('Finanzen',        5),
--     ('IT',              6)
-- on conflict (name) do nothing;
