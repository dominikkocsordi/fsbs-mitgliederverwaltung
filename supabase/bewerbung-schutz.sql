-- =============================================================================
--  Bewerbungen – Schutz vor automatisierten Einträgen
-- =============================================================================
--  Ergänzt supabase/bewerbungen.sql. Einmal komplett im Supabase SQL-Editor
--  ausführen, nachdem bewerbungen.sql gelaufen ist. Das Skript ist
--  wiederholbar: ein zweiter Durchlauf ändert nichts und löscht nichts.
--
--  Bis hierher stand dem Formular nur ein verstecktes Feld im Weg — eine Falle,
--  auf die schlichte Skripte hereinfallen und bessere nicht. Ab jetzt gibt es
--  zwei weitere Hürden:
--
--    1. Ein Captcha. Die Seite lässt sich ein Token ausstellen (Cloudflare
--       Turnstile oder hCaptcha), und `bewerbung_abgeben` fragt beim Anbieter
--       nach, ob es echt ist. Geprüft wird in der Datenbank, nicht im Browser:
--       Wer das Formular umgeht und die Funktion selbst aufruft, kommt damit
--       genauso wenig weiter.
--
--    2. Eine Bremse je IP-Adresse. Sie zählt, wie oft von derselben Adresse
--       abgegeben wird und wie oft dort ein unbekannter Code abgefragt wird.
--       Gegen das Durchprobieren der fünf Zeichen hilft kein Captcha, wenn man
--       es dem Bewerber nicht bei jedem Blick auf den Stand zeigen will.
--
--  Das Captcha ist nach diesem Skript noch aus. Erst eintragen, dann
--  einschalten — sonst stünde das Formular ohne Schlüssel da. Wie, steht in
--  Block 2 unter "Einrichten".
-- =============================================================================


-- 1 --------------------------------------------------------------- Extension
-- `http` erlaubt der Datenbank, den Anbieter zu fragen. In Supabase liegen
-- Extensions im Schema `extensions`; deshalb steht es unten in jedem
-- `search_path`.

create extension if not exists http with schema extensions;


-- 2 ------------------------------------------------------------ Einstellungen
-- Eine Zeile, wie schon bei `bewerbung_formular`. Der Schlüsselteil, den der
-- Browser braucht (`captcha_site_key`), geht über `bewerbung_schutz_info()`
-- nach draußen; `captcha_secret` verlässt die Datenbank nie.
--
-- ---- Einrichten -------------------------------------------------------------
-- Turnstile: unter dash.cloudflare.com → Turnstile eine Website anlegen,
-- Widget-Typ "Managed", als Domain `portal.fsbs-hm.de` eintragen (nicht die
-- WordPress-Domain — das Formular läuft auch eingebettet auf dem Portal).
-- Dann hier eintragen und einschalten:
--
--   update public.bewerbung_schutz set
--       captcha_anbieter  = 'turnstile',
--       captcha_site_key  = '0x4AAA…',
--       captcha_secret    = '0x4AAA…',
--       captcha_aktiv     = true
--    where id;
--
-- Ausschalten geht jederzeit und sofort:
--
--   update public.bewerbung_schutz set captcha_aktiv = false where id;

create table if not exists public.bewerbung_schutz (
    id               boolean primary key default true check (id),

    captcha_aktiv    boolean not null default false,
    captcha_anbieter text    not null default 'turnstile'
                     check (captcha_anbieter in ('turnstile', 'hcaptcha')),
    captcha_site_key text,
    captcha_secret   text,

    -- Wie viele Bewerbungen dieselbe IP-Adresse je Stunde abgeben darf.
    -- Großzügig gewählt: Hinter einer Hochschul-Adresse sitzt ein halber
    -- Rechnerraum, und die doppelte E-Mail weist Wiederholungen schon ab.
    abgeben_limit    integer not null default 20 check (abgeben_limit > 0),

    -- Wie viele *unbekannte* Codes dieselbe IP-Adresse je zehn Minuten
    -- abfragen darf. Ein Bewerber, der seinen richtigen Code eingibt, zählt
    -- hier nicht mit und kann so oft nachschauen, wie er möchte.
    stand_limit      integer not null default 12 check (stand_limit > 0),

    geaendert_am     timestamptz not null default now()
);

insert into public.bewerbung_schutz (id) values (true)
on conflict (id) do nothing;

-- Von außen kommt an diese Tabelle niemand: kein Recht, keine Regel. Gepflegt
-- wird sie im SQL-Editor, gelesen über die Funktionen weiter unten, die mit
-- den Rechten ihres Eigentümers laufen.
alter table public.bewerbung_schutz enable row level security;
revoke all on public.bewerbung_schutz from anon, authenticated;

create or replace function public.bewerbung_schutz_notieren()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    new.id           := true;
    new.geaendert_am := now();
    return new;
end;
$$;

drop trigger if exists bewerbung_schutz_notieren on public.bewerbung_schutz;
create trigger bewerbung_schutz_notieren
    before update on public.bewerbung_schutz
    for each row execute function public.bewerbung_schutz_notieren();


-- ---- Was die Seite wissen darf ---------------------------------------------
-- Ob ein Captcha verlangt wird, und mit welchem Schlüssel das Widget zu laden
-- ist. Beides ist öffentlich — der Site-Key steht bei jedem Anbieter so im
-- Quelltext der Seite.

create or replace function public.bewerbung_schutz_info()
returns table (
    captcha_aktiv    boolean,
    captcha_anbieter text,
    captcha_site_key text
)
language sql
stable
security definer
set search_path = public
as $$
    select s.captcha_aktiv and nullif(btrim(coalesce(s.captcha_site_key, '')), '') is not null,
           s.captcha_anbieter,
           nullif(btrim(coalesce(s.captcha_site_key, '')), '')
      from public.bewerbung_schutz s
     where s.id;
$$;

grant execute on function public.bewerbung_schutz_info() to anon, authenticated;


-- 3 ---------------------------------------------------------- Die IP-Adresse
-- PostgREST legt die Kopfzeilen der Anfrage in eine Einstellung; daraus lesen
-- wir, von wo der Aufruf kam. Steht dort nichts (etwa beim Aufruf aus dem
-- SQL-Editor), gibt es keine Adresse — dann greift die Bremse nicht, denn ohne
-- Adresse wäre sie eine Bremse für alle zusammen.

create or replace function public.bewerbung_ip()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_kopf jsonb;
    v_ip   text;
begin
    begin
        v_kopf := nullif(current_setting('request.headers', true), '')::jsonb;
    exception when others then
        return null;
    end;

    if v_kopf is null then
        return null;
    end if;

    -- `cf-connecting-ip` ist die verlässlichste Angabe, wenn sie da ist;
    -- sonst der erste Eintrag der Kette in `x-forwarded-for`.
    v_ip := coalesce(
        v_kopf->>'cf-connecting-ip',
        split_part(v_kopf->>'x-forwarded-for', ',', 1),
        v_kopf->>'x-real-ip'
    );

    return nullif(btrim(coalesce(v_ip, '')), '');
end;
$$;

revoke execute on function public.bewerbung_ip() from public;


-- 4 -------------------------------------------------------------- Die Bremse
-- Gezählt wird in festen Zeitfenstern: eine Zeile je Zweck, Adresse und
-- Fenster. Das ist gröber als ein gleitendes Fenster, kostet aber keine
-- Geschichte und keinen Aufräumdienst, der laufen muss.

create table if not exists public.bewerbung_versuche (
    zweck   text        not null check (zweck in ('abgeben', 'stand')),
    ip      text        not null,
    fenster timestamptz not null,
    anzahl  integer     not null default 0,
    primary key (zweck, ip, fenster)
);

alter table public.bewerbung_versuche enable row level security;
revoke all on public.bewerbung_versuche from anon, authenticated;

create index if not exists bewerbung_versuche_fenster_idx
    on public.bewerbung_versuche (fenster);

-- Anfang des Zeitfensters, in dem `now()` liegt. `p_sekunden` ist seine Länge.
create or replace function public.bewerbung_fenster(p_sekunden integer)
returns timestamptz
language sql
stable
as $$
    select to_timestamp(floor(extract(epoch from now()) / p_sekunden) * p_sekunden);
$$;

revoke execute on function public.bewerbung_fenster(integer) from public;

-- Nachsehen, ohne zu zählen: Ist für diese Adresse schon Schluss?
create or replace function public.bewerbung_bremse_prueft(
    p_zweck    text,
    p_sekunden integer,
    p_limit    integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
    v_ip     text := public.bewerbung_ip();
    v_anzahl integer;
begin
    if v_ip is null or p_limit is null then
        return true;
    end if;

    select v.anzahl into v_anzahl
      from public.bewerbung_versuche v
     where v.zweck = p_zweck
       and v.ip = v_ip
       and v.fenster = public.bewerbung_fenster(p_sekunden);

    return coalesce(v_anzahl, 0) < p_limit;
end;
$$;

revoke execute on function public.bewerbung_bremse_prueft(text, integer, integer) from public;

-- Einen Versuch notieren. Nebenbei fliegen alte Zeilen hinaus — nicht bei
-- jedem Aufruf, sondern hier und da, damit die Tabelle nicht wächst und kein
-- Zeitplan dafür nötig ist.
create or replace function public.bewerbung_bremse_zaehlt(
    p_zweck    text,
    p_sekunden integer
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
    v_ip text := public.bewerbung_ip();
begin
    if v_ip is null then
        return;
    end if;

    insert into public.bewerbung_versuche (zweck, ip, fenster, anzahl)
    values (p_zweck, v_ip, public.bewerbung_fenster(p_sekunden), 1)
    on conflict (zweck, ip, fenster)
        do update set anzahl = bewerbung_versuche.anzahl + 1;

    if random() < 0.02 then
        delete from public.bewerbung_versuche where fenster < now() - interval '1 day';
    end if;
end;
$$;

revoke execute on function public.bewerbung_bremse_zaehlt(text, integer) from public;


-- 5 ------------------------------------------------------ Das Captcha prüfen
-- Fragt den Anbieter, ob das Token echt ist. Beide Anbieter nehmen dieselbe
-- Form an: ein POST mit `secret` und `response`, zurück kommt JSON mit
-- `success`.
--
-- Der Fall, dass wir keine Antwort bekommen, ist bewusst anders geregelt als
-- ein "nein" vom Anbieter:
--
--   nein vom Anbieter   → abgewiesen. Das ist die Aussage, um die es geht.
--   keine Antwort       → durchgelassen, mit einer Warnung im Log. Fällt der
--                         Anbieter aus, soll nicht die Bewerbungsfrist daran
--                         hängen. Das Captcha hält Skripte ab, und ein Skript
--                         kann unsere Leitung nach Cloudflare nicht kappen.
--
-- Ein fehlendes oder leeres Token ist keine ausgefallene Leitung, sondern ein
-- "nein": Wer das Formular umgeht, lässt genau dieses Feld weg.

create or replace function public.bewerbung_captcha_prueft(p_token text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
    v_aktiv    boolean;
    v_anbieter text;
    v_secret   text;
    v_url      text;
    v_ip       text;
    v_koerper  text;
    v_antwort  http_response;
    v_erfolg   boolean;
begin
    select s.captcha_aktiv, s.captcha_anbieter,
           nullif(btrim(coalesce(s.captcha_secret, '')), '')
      into v_aktiv, v_anbieter, v_secret
      from public.bewerbung_schutz s
     where s.id;

    -- Nicht eingeschaltet, oder es fehlt der Schlüssel: dann gilt weiter, was
    -- vorher galt — das versteckte Feld im Formular.
    if not coalesce(v_aktiv, false) or v_secret is null then
        return true;
    end if;

    if nullif(btrim(coalesce(p_token, '')), '') is null then
        return false;
    end if;

    v_url := case v_anbieter
        when 'hcaptcha' then 'https://api.hcaptcha.com/siteverify'
        else 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
    end;

    v_ip := public.bewerbung_ip();

    v_koerper := 'secret=' || urlencode(v_secret)
              || '&response=' || urlencode(p_token);
    if v_ip is not null then
        v_koerper := v_koerper || '&remoteip=' || urlencode(v_ip);
    end if;

    begin
        -- Ohne Zeitgrenze hinge die Bewerbung an der Laune des Anbieters.
        perform http_set_curlopt('CURLOPT_TIMEOUT_MS', '5000');
        perform http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS', '3000');

        select * into v_antwort
          from http_post(v_url, v_koerper, 'application/x-www-form-urlencoded');
    exception when others then
        raise warning 'Captcha-Prüfung nicht möglich (%): %', sqlstate, sqlerrm;
        return true;
    end;

    if v_antwort.status is distinct from 200 or v_antwort.content is null then
        raise warning 'Captcha-Prüfung: unerwartete Antwort (Status %)', v_antwort.status;
        return true;
    end if;

    begin
        v_erfolg := (v_antwort.content::jsonb->>'success')::boolean;
    exception when others then
        raise warning 'Captcha-Prüfung: Antwort nicht lesbar: %', left(v_antwort.content, 200);
        return true;
    end;

    return coalesce(v_erfolg, false);
end;
$$;

revoke execute on function public.bewerbung_captcha_prueft(text) from public;


-- 6 ------------------------------------------------- Die Einhängepunkte füllen
-- bewerbungen.sql legt `bewerbung_schutz_pruefen`, `bewerbung_stand_pruefen`
-- und `bewerbung_stand_fehlschlag` als leere Hüllen an und ruft sie an den
-- richtigen Stellen auf. Hier bekommen sie ihren Inhalt — `bewerbung_abgeben`
-- und `bewerbung_stand` selbst bleiben unberührt. Dadurch schaltet ein
-- erneuter Durchlauf von bewerbungen.sql den Schutz nicht wieder ab.
--
-- Die Fehlercodes sind so gewählt, dass PostgREST daraus einen passenden
-- HTTP-Status macht (`PT4xx`), und die Seite erkennt sie am Code:
--
--   42501  Frist vorbei          → "Bewerbung geschlossen"
--   PT403  Captcha nicht bestanden
--   PT429  zu viele Versuche von dieser Adresse

-- ---- Vor dem Abgeben --------------------------------------------------------
-- Erst die Bremse, dann das Captcha: Eine Adresse, die schon an der Grenze ist,
-- soll den Anbieter nicht noch bei jedem Versuch beschäftigen.

create or replace function public.bewerbung_schutz_pruefen(p_captcha_token text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
    v_limit integer;
begin
    select s.abgeben_limit into v_limit from public.bewerbung_schutz s where s.id;

    if not public.bewerbung_bremse_prueft('abgeben', 3600, v_limit) then
        raise exception 'Von dieser Verbindung kamen in der letzten Stunde schon mehrere Bewerbungen'
            using errcode = 'PT429';
    end if;

    if not public.bewerbung_captcha_prueft(p_captcha_token) then
        raise exception 'Die Sicherheitsprüfung wurde nicht bestanden'
            using errcode = 'PT403';
    end if;

    -- Gezählt wird erst hier, nachdem beides bestanden ist: Wer sich beim
    -- Ausfüllen vertut, soll dadurch nicht an die Grenze stoßen.
    perform public.bewerbung_bremse_zaehlt('abgeben', 3600);
end;
$$;

revoke execute on function public.bewerbung_schutz_pruefen(text) from public;


-- ---- Vor der Standabfrage ---------------------------------------------------

create or replace function public.bewerbung_stand_pruefen()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
    v_limit integer;
begin
    select s.stand_limit into v_limit from public.bewerbung_schutz s where s.id;

    if not public.bewerbung_bremse_prueft('stand', 600, v_limit) then
        raise exception 'Zu viele Versuche. Bitte in einigen Minuten noch einmal.'
            using errcode = 'PT429';
    end if;
end;
$$;

revoke execute on function public.bewerbung_stand_pruefen() from public;


-- ---- Ein Code, den es nicht gibt --------------------------------------------

create or replace function public.bewerbung_stand_fehlschlag()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
    perform public.bewerbung_bremse_zaehlt('stand', 600);
end;
$$;

revoke execute on function public.bewerbung_stand_fehlschlag() from public;


-- 7 --------------------------------------------------------------- Nachlesen
-- Wer wissen will, ob die Bremse gerade greift:
--
--   select * from public.bewerbung_versuche order by fenster desc;
--
-- Und wer eine Adresse wieder freigeben will:
--
--   delete from public.bewerbung_versuche where ip = '…';
--
-- Ob das Captcha überhaupt gefragt wird, sagt:
--
--   select captcha_aktiv, captcha_anbieter, abgeben_limit, stand_limit
--     from public.bewerbung_schutz;
-- =============================================================================
