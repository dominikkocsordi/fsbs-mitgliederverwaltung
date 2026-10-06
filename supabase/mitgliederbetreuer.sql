-- =============================================================================
--  Mitgliederbetreuer – die vierte Rolle
-- =============================================================================
--  Einmal komplett im Supabase SQL-Editor ausführen. Das Skript ist
--  wiederholbar: ein zweiter Durchlauf ändert nichts mehr. Es legt keine
--  Tabelle an und ändert an keiner Person die Rolle – vergeben wird sie
--  danach auf `/nutzer`.
--
--  Grundlage ist der Antrag auf Gründung der Arbeitsgruppe
--  „Mitgliederbetreuung“ nach § 7 der Satzung (Sonstige Gremien). Die AG
--  betreut neue und bestehende Mitglieder – rein administrativ und
--  organisatorisch. Daraus folgt für das Portal:
--
--    sieht     Dashboard (ganzer Verein), Mitglieder, Anwärter, Bewerbungen
--              – ressortübergreifend
--    ändert    nur den Bearbeitungsstand einer Bewerbung, und das nur
--              zwischen den fünf Schritten des Verfahrens (offen, geprüft,
--              Einladung, Kennenlernen, Prios gesendet). Keine Aufnahme,
--              keine Ablehnung, keine Übernahme als Anwärter, kein
--              Mitgliedsstatus, kein Löschen; das bleibt beim Vorstand.
--    sieht nicht  Finanzen, Protokoll, Schreiben/Zeugnisse, Nutzer
--
--  In der Datenbank heißt das viererlei:
--
--    1. `profiles.role` darf `mitgliederbetreuer` enthalten.
--    2. `ist_leitung()` – die Lese-Regel für Mitglieder, Anwärter,
--       Bewerbungen und Bewerbungsfotos – schließt die Rolle ein.
--    3. `ist_vorstand()` bleibt, wie es ist. Jede Schreib-Regel und alles
--       zu Finanzen, Protokoll, Zeugnissen und Nutzern hängt daran, und
--       dort kommt die Mitgliederbetreuung nicht vorbei.
--    4. Eine eigene Regel für `bewerbungen` lässt sie den Stand setzen –
--       nur von einem der fünf Schritte auf einen anderen, und nichts
--       sonst an der Zeile.
--
--  `rollen.sql`, `mitglieder-anwaerter.sql` und `bewerbungen.sql` sind
--  ebenso nachgezogen – ein späterer Durchlauf eines dieser Skripte nimmt
--  die Rolle also nicht wieder weg.
-- =============================================================================


-- 1 ------------------------------------------------------ Die Zuordnung
-- Wortgleich mit rollen.sql. „Mitgliederbetreuung“, „Betreuer“ und
-- „mitgliederbetreuer“ landen alle bei derselben Rolle.

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
               when t like '%betreu%'    then 'mitgliederbetreuer'
               else                           'ressortleiter'
           end
      from blank;
$$;

grant execute on function public.rolle_normieren(text) to authenticated;


-- 2 ------------------------------------------------------ Die Prüfregel
-- Die alte Regel kannte drei Rollen und hieß danach. Sie geht, die neue
-- kennt vier.

-- `profiles_role_check` stammt nicht aus diesem Repo, sondern aus dem
-- ursprünglichen Anlegen der Tabelle, und kennt nur die alten Rollen.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles drop constraint if exists profiles_role_drei;
alter table public.profiles drop constraint if exists profiles_role_gueltig;
alter table public.profiles add  constraint profiles_role_gueltig
    check (role in ('vorstand', 'ressortleiter', 'mitgliederbetreuer', 'protokollfuehrer'));


-- 3 ------------------------------------------------------- Wer lesen darf
-- `ist_leitung()` steht hinter jeder Lese-Regel für Mitglieder, Anwärter,
-- Bewerbungen und die Bewerbungsfotos. Geschrieben wird überall nur mit
-- `ist_vorstand()` – daran ändert sich hier nichts.

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
           and lower(btrim(role)) in ('vorstand', 'ressortleiter', 'mitgliederbetreuer')
    );
$$;

grant execute on function public.ist_leitung() to anon, authenticated;


-- 4 ------------------------------------------- Den Bewerbungsstand setzen
-- Die fünf Schritte des Verfahrens – dieselben wie das Dropdown auf
-- /bewerbungen. `anwaerter` und `abgelehnt` fehlen mit Absicht: Weder
-- dorthin noch von dort zurück kommt die Mitgliederbetreuung.

create or replace function public.ist_mitgliederbetreuer()
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
           and lower(btrim(role)) = 'mitgliederbetreuer'
    );
$$;

grant execute on function public.ist_mitgliederbetreuer() to authenticated;

-- Eine zweite Update-Regel neben „bewerbungen bearbeiten“ (Vorstand).
-- Beide gelten nebeneinander; `using` prüft den Stand vorher, `with check`
-- den Stand nachher – so geht es weder in einen der beiden Endstände
-- hinein noch aus ihm heraus.
drop policy if exists "bewerbungen stand betreuen" on public.bewerbungen;
create policy "bewerbungen stand betreuen" on public.bewerbungen
    for update to authenticated
    using (public.ist_mitgliederbetreuer()
           and status in ('offen', 'geprueft', 'einladung', 'kennenlernen', 'prios_gesendet'))
    with check (public.ist_mitgliederbetreuer()
           and status in ('offen', 'geprueft', 'einladung', 'kennenlernen', 'prios_gesendet'));

-- Die Spaltenrechte erlauben auch Notiz und Ressortwünsche. Die bleiben
-- beim Vorstand: Ändert die Mitgliederbetreuung daran etwas, bricht das
-- Speichern ab. Der Trigger greift nur für diese Rolle – das öffentliche
-- Formular (Priobestätigung) und der Vorstand laufen an ihm vorbei.
create or replace function public.bewerbungen_betreuung_pruefen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if public.ist_mitgliederbetreuer() and not public.ist_vorstand() then
        if new.notiz        is distinct from old.notiz
        or new.ressort_1_id is distinct from old.ressort_1_id
        or new.ressort_2_id is distinct from old.ressort_2_id then
            raise exception 'Die Mitgliederbetreuung ändert nur den Bearbeitungsstand.'
                using errcode = '42501';
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists bewerbungen_betreuung_pruefen on public.bewerbungen;
create trigger bewerbungen_betreuung_pruefen
    before update on public.bewerbungen
    for each row execute function public.bewerbungen_betreuung_pruefen();


-- 5 ------------------------------------------------------- Zum Nachsehen
-- Wer welche Rolle hat:
--
--   select p.role, string_agg(u.email::text, ', ' order by u.email) as wer
--     from public.profiles p
--     left join auth.users u on u.id = p.id
--    group by p.role
--    order by p.role;
--
-- Und die Probe aufs Exempel – angemeldet als Mitgliederbetreuer im Portal:
-- Mitglieder, Anwärter und Bewerbungen aller Ressorts sind zu sehen; in
-- einer Bewerbung lässt sich der Stand zwischen den fünf Schritten setzen.
-- Die Knöpfe zum Anlegen, Ändern, Ablehnen, Übernehmen und Löschen fehlen, Finanzen,
-- Protokoll, Schreiben und Nutzer stehen nicht in der Leiste und zeigen
-- unter ihrer Adresse „Kein Zugriff“.
-- =============================================================================
