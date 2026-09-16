-- =============================================================================
--  Mitglieder & Anwärter – wer sie sieht, wer sie ändert
-- =============================================================================
--  Einmal komplett im Supabase SQL-Editor ausführen. Das Skript ist
--  wiederholbar: ein zweiter Durchlauf ändert nichts und löscht nichts. Es
--  legt keine Tabelle an und rührt keine Zeile an – es setzt nur die Regeln
--  darüber, wer `public.members` und `public.anwaerter` lesen und schreiben
--  darf.
--
--  Bisher stand das nur in den Seiten: `/members` und `/anwaerter` schalten
--  ihre Knöpfe ab, sobald die Rolle nicht `vorstand` ist. Das ist eine
--  Höflichkeit, kein Riegel – und in der anderen Richtung war es zu streng:
--  Wo die Datenbank das Lesen auf den Vorstand begrenzt hatte, blieben die
--  Listen für die Ressortleitung schlicht leer.
--
--  Nach diesem Skript gilt für beide Tabellen:
--
--    vorstand          liest und schreibt
--    ressortleiter     liest
--    protokollfuehrer  nichts – das Protokoll ist sein Platz
--    anon              nichts
--
--  Die Seiten bleiben, wie sie sind: Sie zeigen der Ressortleitung die
--  Listen und lassen die Knöpfe aus. Was zählt, steht ab jetzt hier.
-- =============================================================================


-- 1 ------------------------------------------------------------ Wer ist wer
-- Beide Funktionen gibt es im Projekt schon (bewerbungen.sql, rechnungen.sql).
-- Hier stehen sie wortgleich noch einmal, damit dieses Skript für sich allein
-- läuft; ein zweiter Durchlauf ändert an ihnen nichts.

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
grant execute on function public.ist_leitung()  to anon, authenticated;


-- 2 --------------------------------------------------------------- Mitglieder
-- Lesen darf die Leitung, schreiben der Vorstand. Vier Regeln statt einer
-- für alles: `for all` würde auch das Lesen an `ist_vorstand()` binden, und
-- genau das soll es nicht mehr.

alter table public.members enable row level security;

drop policy if exists "mitglieder lesen"     on public.members;
drop policy if exists "mitglieder anlegen"   on public.members;
drop policy if exists "mitglieder aendern"   on public.members;
drop policy if exists "mitglieder entfernen" on public.members;

create policy "mitglieder lesen" on public.members
    for select to authenticated
    using (public.ist_leitung());

create policy "mitglieder anlegen" on public.members
    for insert to authenticated
    with check (public.ist_vorstand());

create policy "mitglieder aendern" on public.members
    for update to authenticated
    using (public.ist_vorstand())
    with check (public.ist_vorstand());

create policy "mitglieder entfernen" on public.members
    for delete to authenticated
    using (public.ist_vorstand());


-- 3 ----------------------------------------------------------------- Anwärter
-- Dieselbe Aufteilung. Die Übernahme aus den Bewerbungen trägt hier ein –
-- sie ist Sache des Vorstands, und das bleibt sie.

alter table public.anwaerter enable row level security;

drop policy if exists "anwaerter lesen"     on public.anwaerter;
drop policy if exists "anwaerter anlegen"   on public.anwaerter;
drop policy if exists "anwaerter aendern"   on public.anwaerter;
drop policy if exists "anwaerter entfernen" on public.anwaerter;

create policy "anwaerter lesen" on public.anwaerter
    for select to authenticated
    using (public.ist_leitung());

create policy "anwaerter anlegen" on public.anwaerter
    for insert to authenticated
    with check (public.ist_vorstand());

create policy "anwaerter aendern" on public.anwaerter
    for update to authenticated
    using (public.ist_vorstand())
    with check (public.ist_vorstand());

create policy "anwaerter entfernen" on public.anwaerter
    for delete to authenticated
    using (public.ist_vorstand());


-- 4 ------------------------------------------------------------------ Rechte
-- RLS entscheidet über die Zeilen, diese Rechte über den Zugang überhaupt.
-- Beides muss zusammenpassen: Ohne `grant` käme die Ressortleitung auch mit
-- der freundlichsten Regel nicht an die Liste.

revoke all on public.members   from anon;
revoke all on public.anwaerter from anon;

grant select, insert, update, delete on public.members   to authenticated;
grant select, insert, update, delete on public.anwaerter to authenticated;


-- 5 ------------------------------------------------------------- Zum Nachsehen
-- Was jetzt an den beiden Tabellen hängt:
--
--   select tablename, policyname, cmd, qual
--     from pg_policies
--    where schemaname = 'public' and tablename in ('members', 'anwaerter')
--    order by tablename, cmd;
--
-- Und die Probe aufs Exempel – angemeldet als Ressortleitung im Portal:
-- `/members` und `/anwaerter` zeigen die Listen, die Knöpfe bleiben aus,
-- und ein Schreibversuch an der Datenbank vorbei ändert nichts.
-- =============================================================================
