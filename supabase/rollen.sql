-- =============================================================================
--  Rollen – drei, und keine vierte
-- =============================================================================
--  Einmal komplett im Supabase SQL-Editor ausführen. Das Skript ist
--  wiederholbar: ein zweiter Durchlauf ändert nichts mehr.
--
--  Das Portal kennt genau drei Rollen:
--
--    vorstand          sieht und ändert alles – auch Finanzen und /nutzer
--    ressortleiter     Dashboard, Mitglieder, Anwärter, Bewerbungen
--    protokollfuehrer  ausschließlich das Protokoll
--
--  Jede Seite vergleicht die Rolle Zeichen für Zeichen mit diesen drei
--  Wörtern, die Datenbank tut es in `ist_vorstand()` genauso. Steht in
--  `profiles.role` etwas anderes – „Admin“, „Vorsitz“, „Protokollführer“
--  mit ü, ein Tippfehler –, dann ist das für das Portal keine der drei
--  Rollen: Die Person sieht „Kein Zugriff“, obwohl in der Liste etwas
--  Vernünftiges steht. Genau das ist der Fall, wenn jemand Vorstand ist
--  und die Finanzen trotzdem zu bleiben.
--
--  Das Skript tut drei Dinge:
--
--    1. Es zeigt an, was heute in der Spalte steht (Meldungen im Editor).
--    2. Es gleicht jeden Wert auf eine der drei Rollen an.
--    3. Es sorgt dafür, dass künftig gar nichts anderes mehr hineinkommt –
--       über den vorhandenen Trigger und eine Prüfregel an der Tabelle.
--
--  Angeglichen wird vorsichtig: Nur was mit „vorstand“ beginnt, bleibt
--  Vorstand (Groß-/Kleinschreibung, Leerzeichen und „Vorstandschaft“
--  eingeschlossen). Alles, was nach Protokoll aussieht, wird
--  Protokollführer. Jeder übrige Wert landet bei `ressortleiter` – der
--  Rolle mit den wenigsten Rechten. Niemand wird durch dieses Skript zum
--  Vorstand gemacht; wer es sein soll, bekommt die Rolle danach auf
--  `/nutzer` mit einem Klick. Welche Zeilen sich geändert haben, steht in
--  den Meldungen.
-- =============================================================================


-- 1 ------------------------------------------------------------ Was steht da?
-- Vor dem Angleichen: eine Zeile je vorhandenem Wert. Zu finden im
-- SQL-Editor unter „Messages“ neben dem Ergebnis.

do $$
declare z record;
begin
    raise notice '--- Rollen vorher ---';
    for z in
        select coalesce(nullif(btrim(role), ''), '(leer)') as rolle, count(*) as anzahl
          from public.profiles
         group by 1
         order by 2 desc, 1
    loop
        raise notice '  % · % Zeile(n)', z.rolle, z.anzahl;
    end loop;
end $$;


-- 2 -------------------------------------------------------- Die eine Zuordnung
-- Eine Funktion, die aus irgendeinem geschriebenen Wert eine der drei
-- Rollen macht. Umlaute werden ausgeschrieben, alles außer Buchstaben
-- fällt weg – „Protokoll-Führer “ und „protokollfuehrer“ sind damit
-- dasselbe.

create or replace function public.rolle_normieren(roh text)
returns text
language sql
immutable
as $$
    with blank as (
        select regexp_replace(
                   replace(replace(replace(replace(
                       lower(btrim(coalesce(roh, ''))),
                   'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss'),
                   '[^a-z]', '', 'g') as t
    )
    select case
               when t like 'vorstand%'   then 'vorstand'
               when t like '%protokoll%' then 'protokollfuehrer'
               else                           'ressortleiter'
           end
      from blank;
$$;

grant execute on function public.rolle_normieren(text) to authenticated;


-- 3 ------------------------------------------------------- Bestand angleichen
-- Nur Zeilen anfassen, die sich wirklich ändern – und jede einzelne
-- nennen, damit hinterher nachvollziehbar ist, wer wo gelandet ist.

do $$
declare z record;
declare n int := 0;
begin
    raise notice '--- Angeglichen ---';
    for z in
        select p.id,
               coalesce(nullif(btrim(p.role), ''), '(leer)') as alt,
               public.rolle_normieren(p.role)                as neu,
               u.email::text                                 as mail
          from public.profiles p
          left join auth.users u on u.id = p.id
         where coalesce(p.role, '') is distinct from public.rolle_normieren(p.role)
    loop
        update public.profiles set role = z.neu where id = z.id;
        n := n + 1;
        raise notice '  % : % -> %', coalesce(z.mail, z.id::text), z.alt, z.neu;
    end loop;

    if n = 0 then
        raise notice '  nichts zu tun – alle Rollen waren schon sauber';
    end if;
end $$;


-- 4 ------------------------------------------------------- Beim Schreiben auch
-- Der Trigger aus `nutzer.sql` hat die Rolle bisher nur kleingeschrieben
-- und beschnitten. Jetzt geht er durch dieselbe Zuordnung wie der
-- Bestand: Was gespeichert wird, ist danach eine der drei Rollen.

create or replace function public.profiles_normalisieren()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    new.role := public.rolle_normieren(new.role);

    new.ressort      := nullif(btrim(coalesce(new.ressort, '')), '');
    new.display_name := nullif(btrim(coalesce(new.display_name, '')), '');
    return new;
end;
$$;

drop trigger if exists profiles_normalisieren on public.profiles;
create trigger profiles_normalisieren
    before insert or update on public.profiles
    for each row execute function public.profiles_normalisieren();


-- 5 ---------------------------------------------------------- Und als Riegel
-- Der Trigger sorgt dafür, dass es nie dazu kommt; die Prüfregel sagt es
-- aus, damit ein späterer Eingriff an ihm vorbei – ein Import, eine
-- Änderung direkt in der Tabelle – nicht still eine vierte Rolle anlegt.

alter table public.profiles drop constraint if exists profiles_role_drei;
alter table public.profiles add  constraint profiles_role_drei
    check (role in ('vorstand', 'ressortleiter', 'protokollfuehrer'));


-- 6 ------------------------------------------------------------- Zum Nachsehen
-- Das Ergebnis: wer welche Rolle hat. Mehr als drei Werte kann diese
-- Liste ab hier nicht mehr enthalten.

select p.role,
       count(*)                                    as anzahl,
       string_agg(u.email::text, ', ' order by u.email) as wer
  from public.profiles p
  left join auth.users u on u.id = p.id
 group by p.role
 order by p.role;
