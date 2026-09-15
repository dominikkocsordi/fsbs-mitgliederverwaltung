-- =============================================================================
--  Nutzer – Konten und Rollen im Portal
-- =============================================================================
--  Einmal komplett im Supabase-SQL-Editor ausführen. Das Skript ist
--  wiederholbar: ein zweiter Durchlauf ändert nichts und löscht nichts.
--
--  Es richtet die Seite `/nutzer` ein. Dort sieht der Vorstand, wer sich
--  am Portal anmelden darf, mit Mail, Rolle, Ressort und letzter Anmeldung,
--  vergibt Rollen und legt Konten an oder löscht sie.
--
--  Konten anlegen und löschen geht nicht von der Seite aus allein: dafür
--  braucht es den Dienstschlüssel, und der gehört nicht in den Browser.
--  Das übernimmt die Edge Function `nutzer-verwalten`
--  (supabase/functions/nutzer-verwalten). Alles Übrige – lesen, Rolle und
--  Ressort ändern – erledigt dieses Skript.
-- =============================================================================


-- 1 -------------------------------------------------------------- Die Tabelle
-- `profiles` gibt es im Projekt bereits: eine Zeile je Konto, verknüpft mit
-- `auth.users`. Wer keine Zeile hat, kommt am Portal nicht vorbei – die
-- Seiten prüfen genau das. Die Spalten werden hier nur nachgezogen, falls
-- eine fehlt.

create table if not exists public.profiles (
    id           uuid primary key references auth.users (id) on delete cascade,
    role         text not null default 'ressortleiter',
    display_name text,
    ressort      text,
    created_at   timestamptz not null default now()
);

alter table public.profiles add column if not exists role         text;
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists ressort      text;
alter table public.profiles add column if not exists created_at   timestamptz not null default now();


-- 2 ---------------------------------------------------------- Rolle sauber
-- Geschrieben wird kleingeschrieben und ohne Leerzeichen am Rand – „Vorstand“
-- und „vorstand “ sind dieselbe Rolle. Die Seiten lesen sie so, wie sie hier
-- ankommt, und müssen nicht raten.

create or replace function public.profiles_normalisieren()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    new.role    := lower(btrim(coalesce(new.role, 'ressortleiter')));
    if new.role = '' then new.role := 'ressortleiter'; end if;

    new.ressort      := nullif(btrim(coalesce(new.ressort, '')), '');
    new.display_name := nullif(btrim(coalesce(new.display_name, '')), '');
    return new;
end;
$$;

drop trigger if exists profiles_normalisieren on public.profiles;
create trigger profiles_normalisieren
    before insert or update on public.profiles
    for each row execute function public.profiles_normalisieren();


-- 3 ------------------------------------------------------------ Wer ist wer
-- Als security definer liest die Funktion die Rolle auch dann, wenn die
-- aufrufende Person die Tabelle selbst nicht sehen darf. Steht so schon in
-- `zutritte.sql`; hier noch einmal, damit dieses Skript für sich allein
-- lauffähig ist.

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


-- 4 ------------------------------------------------------------------- Zugriff
-- Jede angemeldete Person liest ihre eigene Zeile – daran hängt der Zugang
-- zu allen Seiten. Der Vorstand liest alle und ändert sie auch.

alter table public.profiles enable row level security;

drop policy if exists "profil_eigenes_lesen"   on public.profiles;
drop policy if exists "profil_vorstand_lesen"  on public.profiles;
drop policy if exists "profil_vorstand_aendern" on public.profiles;
drop policy if exists "profil_vorstand_anlegen" on public.profiles;
drop policy if exists "profil_vorstand_loeschen" on public.profiles;

create policy "profil_eigenes_lesen"
    on public.profiles for select
    to authenticated
    using (id = auth.uid());

create policy "profil_vorstand_lesen"
    on public.profiles for select
    to authenticated
    using (public.ist_vorstand());

create policy "profil_vorstand_aendern"
    on public.profiles for update
    to authenticated
    using (public.ist_vorstand())
    with check (public.ist_vorstand());

create policy "profil_vorstand_anlegen"
    on public.profiles for insert
    to authenticated
    with check (public.ist_vorstand());

create policy "profil_vorstand_loeschen"
    on public.profiles for delete
    to authenticated
    using (public.ist_vorstand());


-- 5 --------------------------------------------------------- Der letzte Rest
-- Ein Portal ohne Vorstand hat niemanden mehr, der Rollen vergibt – und die
-- Seite `/nutzer` wäre für alle zu. Die letzte Vorstandszeile lässt sich
-- deshalb weder herabstufen noch löschen. Ein zweiter Vorstand zuerst, dann
-- geht beides.

create or replace function public.profiles_letzter_vorstand()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    vorstaende integer;
    pruefen    boolean := false;
begin
    /* Nur eine Zeile, die gerade Vorstand ist, kann die letzte sein — und
       eine Änderung, die daran nichts ändert, ist ohnehin harmlos. */
    if lower(btrim(coalesce(old.role, ''))) = 'vorstand' then
        if tg_op = 'DELETE' then
            pruefen := true;
        elsif lower(btrim(coalesce(new.role, ''))) <> 'vorstand' then
            pruefen := true;
        end if;
    end if;

    if pruefen then
        select count(*) into vorstaende
          from public.profiles
         where lower(btrim(role)) = 'vorstand';

        if vorstaende <= 1 then
            raise exception
                'Das ist der letzte Vorstand – erst einen zweiten ernennen.'
                using errcode = 'check_violation';
        end if;
    end if;

    if tg_op = 'DELETE' then
        return old;
    end if;
    return new;
end;
$$;

drop trigger if exists profiles_letzter_vorstand on public.profiles;
create trigger profiles_letzter_vorstand
    before update or delete on public.profiles
    for each row execute function public.profiles_letzter_vorstand();


-- 6 -------------------------------------------------------------- Die Liste
-- Die Mailadresse steht in `auth.users`, nicht in `profiles`, und dorthin
-- kommt der Browser nicht. Diese Funktion legt beides zusammen: Name,
-- Rolle und Ressort aus dem Profil, Mail und Anmeldungen aus dem Konto.
-- Nur für den Vorstand.
--
-- `konto_fehlt` markiert Profile ohne Konto – etwa, wenn ein Konto in der
-- Supabase-Oberfläche gelöscht wurde. Anmelden kann sich damit niemand.

create or replace function public.nutzer_liste()
returns table (
    id                 uuid,
    email              text,
    display_name       text,
    role               text,
    ressort            text,
    profil_seit        timestamptz,
    konto_seit         timestamptz,
    letzte_anmeldung   timestamptz,
    bestaetigt         boolean,
    konto_fehlt        boolean
)
language sql
stable
security definer
set search_path = public
as $$
    select p.id,
           u.email::text,
           p.display_name,
           lower(btrim(p.role)) as role,
           p.ressort,
           p.created_at,
           u.created_at,
           u.last_sign_in_at,
           (u.email_confirmed_at is not null) as bestaetigt,
           (u.id is null) as konto_fehlt
      from public.profiles p
      left join auth.users u on u.id = p.id
     where public.ist_vorstand()
     order by lower(btrim(p.role)) <> 'vorstand',
              coalesce(nullif(btrim(p.display_name), ''), u.email::text) nulls last;
$$;

grant execute on function public.nutzer_liste() to authenticated;


-- 7 ------------------------------------------------------- Konten ohne Profil
-- Ein Konto in `auth.users` ohne Zeile in `profiles` kommt nirgends hinein:
-- jede Seite bricht mit „Kein Zugriff“ ab. Damit solche Konten nicht
-- unsichtbar bleiben, zählt die Seite sie auf und bietet an, ein Profil
-- nachzutragen. Nur für den Vorstand.

create or replace function public.nutzer_ohne_profil()
returns table (
    id          uuid,
    email       text,
    konto_seit  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
    select u.id, u.email::text, u.created_at
      from auth.users u
     where public.ist_vorstand()
       and not exists (select 1 from public.profiles p where p.id = u.id)
     order by u.created_at desc;
$$;

grant execute on function public.nutzer_ohne_profil() to authenticated;
