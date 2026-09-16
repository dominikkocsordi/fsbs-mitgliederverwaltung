-- =============================================================================
--  Semesterwechsel – die Listen leeren
-- =============================================================================
--  Einmal komplett im Supabase SQL-Editor ausführen. Das Skript ist
--  wiederholbar: ein zweiter Durchlauf ändert nichts und löscht nichts. Es
--  löscht selbst gar nichts – es legt zwei Funktionen an, die das Portal
--  aufruft, wenn der Vorstand eine ganze Liste leeren will.
--
--  Warum überhaupt: Jedes Semester kommen neue Bewerber, und die alten
--  Bewerbungen samt der Anwärter, die daraus geworden sind, haben dann ihren
--  Zweck erfüllt. Zeile für Zeile wäre das eine halbe Stunde Klickarbeit –
--  und die Einwilligung, die jeder Bewerber unterschrieben hat, sagt ohnehin,
--  dass die Angaben nach dem Verfahren verschwinden.
--
--  Warum als Funktion und nicht als `delete` im Editor: Weil hier drei Dinge
--  zusammen gelten müssen, und zwar an der Datenbank, nicht nur im Browser.
--
--    1. Es ruft der Vorstand. Sonst niemand.
--    2. Es steht ein Satz dabei, der nicht aus Versehen entsteht.
--    3. Es stimmt die Anzahl, die der Anrufer vor sich sieht. Wer die Liste
--       eben als CSV gezogen hat und dann löscht, löscht genau die Liste,
--       die er gezogen hat – kommt in der Zwischenzeit eine Bewerbung
--       herein, bricht es ab.
--
--  Im Portal steht davor noch eine Kette: Erst die CSV-Datei, dann der Satz
--  zum Abtippen, dann der rote Knopf. Diese Funktionen sind der letzte
--  Riegel, nicht der einzige.
--
--  Zurückholen lässt sich nichts. Die CSV-Datei ist die Sicherung.
-- =============================================================================


-- 1 ------------------------------------------------------------ Wer ist wer
-- Gibt es im Projekt schon; hier wortgleich, damit dieses Skript für sich
-- allein läuft.

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


-- 2 ----------------------------------------------------------- Die Anwärter
-- Leert `public.anwaerter` ganz und gibt zurück, wie viele Zeilen es waren.

create or replace function public.anwaerter_alle_loeschen(
    p_bestaetigung text,
    p_anzahl       integer
)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
    v_jetzt  integer;
    v_weg    integer;
begin
    if not public.ist_vorstand() then
        raise exception 'Das darf nur der Vorstand' using errcode = '42501';
    end if;

    if btrim(coalesce(p_bestaetigung, '')) <> 'ALLE ANWÄRTER LÖSCHEN' then
        raise exception 'Der Satz zur Bestätigung stimmt nicht' using errcode = '23514';
    end if;

    select count(*) into v_jetzt from public.anwaerter;

    if p_anzahl is distinct from v_jetzt then
        raise exception
            'Die Liste hat sich geändert: % statt % Anwärter. Bitte noch einmal ansehen.',
            v_jetzt, p_anzahl using errcode = '23514';
    end if;

    delete from public.anwaerter;
    get diagnostics v_weg = row_count;
    return v_weg;
end;
$$;

grant execute on function public.anwaerter_alle_loeschen(text, integer) to authenticated;


-- 3 -------------------------------------------------------- Die Bewerbungen
-- Dasselbe für `public.bewerbungen`. Hier hängt womöglich noch etwas dran:
-- Jeder übernommene Bewerber steht mit seiner Kennung in der Anwärterliste.
-- Dann geht die Anwärterliste zuerst – in der Reihenfolge, in der auch das
-- Semester endet.
--
-- Die Fotos liegen außerhalb der Tabelle, im Ordner `bewerbungen`. Sie gehen
-- nicht von selbst mit: Das Portal räumt sie auf, wenn es diese Funktion
-- aufruft.

create or replace function public.bewerbungen_alle_loeschen(
    p_bestaetigung text,
    p_anzahl       integer
)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
    v_jetzt integer;
    v_weg   integer;
begin
    if not public.ist_vorstand() then
        raise exception 'Das darf nur der Vorstand' using errcode = '42501';
    end if;

    if btrim(coalesce(p_bestaetigung, '')) <> 'ALLE BEWERBUNGEN LÖSCHEN' then
        raise exception 'Der Satz zur Bestätigung stimmt nicht' using errcode = '23514';
    end if;

    select count(*) into v_jetzt from public.bewerbungen;

    if p_anzahl is distinct from v_jetzt then
        raise exception
            'Die Liste hat sich geändert: % statt % Bewerbungen. Bitte noch einmal ansehen.',
            v_jetzt, p_anzahl using errcode = '23514';
    end if;

    begin
        delete from public.bewerbungen;
        get diagnostics v_weg = row_count;
    exception
        when foreign_key_violation then
            raise exception
                'An diesen Bewerbungen hängen noch Anwärter. Bitte zuerst die Anwärterliste leeren.'
                using errcode = '23503';
    end;

    return v_weg;
end;
$$;

grant execute on function public.bewerbungen_alle_loeschen(text, integer) to authenticated;


-- 4 ------------------------------------------------------------- Zum Nachsehen
-- Vorher zählen, was an einem Semesterende überhaupt zusammenkommt:
--
--   select (select count(*) from public.anwaerter)   as anwaerter,
--          (select count(*) from public.bewerbungen) as bewerbungen;
--
-- Und falls die Fotos einmal ohne das Portal weggeräumt werden sollen – was
-- im Ordner liegt, ohne dass noch eine Bewerbung darauf zeigt:
--
--   select name from storage.objects where bucket_id = 'bewerbungen';
-- =============================================================================
