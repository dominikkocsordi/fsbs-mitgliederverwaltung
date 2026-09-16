-- =============================================================================
--  Rechnungen – Schutz vor automatisierten Einträgen
-- =============================================================================
--  Ergänzt supabase/rechnungen.sql. Einmal komplett im Supabase SQL-Editor
--  ausführen, nachdem rechnungen.sql gelaufen ist. Das Skript ist
--  wiederholbar: ein zweiter Durchlauf ändert nichts und löscht nichts.
--
--  Gebaut wie supabase/bewerbung-schutz.sql, und aus demselben Grund: Das
--  Formular steht offen im Netz, und wer es umgeht, ruft die Funktion selbst
--  auf. Geprüft wird darum in der Datenbank, nicht im Browser.
--
--    1. Ein Captcha. Die Seite lässt sich ein Token ausstellen (Cloudflare
--       Turnstile oder hCaptcha), und `rechnung_einreichen` fragt beim
--       Anbieter nach, ob es echt ist.
--
--    2. Eine Bremse je IP-Adresse – beim Einreichen und beim Nachschlagen
--       einer Vorgangsnummer. Gegen das Durchprobieren der fünf Zeichen hilft
--       kein Captcha, wenn man es dem Einreicher nicht bei jedem Blick auf
--       seinen Stand vorlegen will.
--
--  Die Schlüssel des Captchas müssen hier nicht noch einmal eingetragen
--  werden: Steht unter `portal.fsbs-hm.de` schon ein Turnstile-Widget für die
--  Bewerbung, benutzt dieses Formular dieselben (Block 2). Einzuschalten ist
--  es trotzdem eigens — sonst stünde plötzlich ein Kasten auf einer Seite,
--  von der niemand das erwartet hat.
-- =============================================================================


-- 1 --------------------------------------------------------------- Extension
-- `http` erlaubt der Datenbank, den Anbieter zu fragen. In Supabase liegen
-- Extensions im Schema `extensions`; deshalb steht es unten in jedem
-- `search_path`.

create extension if not exists http with schema extensions;


-- 2 ------------------------------------------------------------ Einstellungen
-- Eine Zeile, wie schon bei `rechnung_formular`. `captcha_secret` verlässt die
-- Datenbank nie; nach draußen geht allein, ob ein Captcha verlangt wird, von
-- welchem Anbieter und mit welchem öffentlichen Site-Key.
--
-- ---- Einrichten -------------------------------------------------------------
-- Ist Turnstile für die Bewerbung schon eingerichtet, genügt:
--
--   update public.rechnung_schutz set captcha_aktiv = true where id;
--
-- Denn `captcha_erben` steht auf `true`: Fehlt hier ein eigener Schlüssel,
-- gelten die aus `bewerbung_schutz`. Das darf so sein — beide Formulare
-- stehen unter derselben Adresse, und ein Turnstile-Schlüssel gilt für eine
-- Domain, nicht für eine Seite.
--
-- Eigene Schlüssel gehen genauso; dann zieht `captcha_erben` nicht mehr:
--
--   update public.rechnung_schutz set
--       captcha_anbieter = 'turnstile',
--       captcha_site_key = '0x4AAA…',
--       captcha_secret   = '0x4AAA…',
--       captcha_aktiv    = true
--    where id;
--
-- Ausschalten wirkt sofort, ohne Änderung an der Seite:
--
--   update public.rechnung_schutz set captcha_aktiv = false where id;

create table if not exists public.rechnung_schutz (
    id               boolean primary key default true check (id),

    captcha_aktiv    boolean not null default false,

    -- Fehlt unten ein eigener Schlüssel: den der Bewerbung mitbenutzen.
    captcha_erben    boolean not null default true,

    captcha_anbieter text    not null default 'turnstile'
                     check (captcha_anbieter in ('turnstile', 'hcaptcha')),
    captcha_site_key text,
    captcha_secret   text,

    -- Wie viele Belege dieselbe IP-Adresse je Stunde einreichen darf. Wer vom
    -- Fachschaftswochenende zurückkommt, tippt sechs Kassenbons hintereinander
    -- ein; zwölf sind großzügig und halten trotzdem ein Skript auf.
    einreichen_limit integer not null default 12 check (einreichen_limit > 0),

    -- Wie viele *unbekannte* Vorgangsnummern dieselbe Adresse je zehn Minuten
    -- abfragen darf. Wer seine richtige Nummer eingibt, zählt hier nicht mit.
    stand_limit      integer not null default 12 check (stand_limit > 0),

    geaendert_am     timestamptz not null default now()
);

insert into public.rechnung_schutz (id) values (true)
on conflict (id) do nothing;

-- Von außen kommt an diese Tabelle niemand: kein Recht, keine Regel. Gepflegt
-- wird sie im SQL-Editor, gelesen über die Funktionen weiter unten, die mit
-- den Rechten ihres Eigentümers laufen.
alter table public.rechnung_schutz enable row level security;
revoke all on public.rechnung_schutz from anon, authenticated;

create or replace function public.rechnung_schutz_notieren()
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

drop trigger if exists rechnung_schutz_notieren on public.rechnung_schutz;
create trigger rechnung_schutz_notieren
    before update on public.rechnung_schutz
    for each row execute function public.rechnung_schutz_notieren();


-- ---- Welche Schlüssel gelten ------------------------------------------------
-- Die eigenen, und wo keine stehen, die der Bewerbung. `bewerbung_schutz` muss
-- es dafür nicht geben: Wer nur dieses Formular betreibt, hat die Tabelle
-- nicht, und dann bleibt es bei den eigenen Angaben. Deshalb der Umweg über
-- `to_regclass` und eine dynamische Abfrage — ein fester Verweis auf eine
-- Tabelle, die fehlen darf, ließe die Funktion gar nicht erst anlegen.

create or replace function public.rechnung_captcha_konfig()
returns table (
    aktiv    boolean,
    anbieter text,
    site_key text,
    secret   text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_erben boolean;
begin
    select s.captcha_aktiv,
           s.captcha_erben,
           s.captcha_anbieter,
           nullif(btrim(coalesce(s.captcha_site_key, '')), ''),
           nullif(btrim(coalesce(s.captcha_secret,  '')), '')
      into aktiv, v_erben, anbieter, site_key, secret
      from public.rechnung_schutz s
     where s.id;

    if not found then
        aktiv := false;
        return next;
        return;
    end if;

    -- Geerbt wird nur, was hier fehlt, und nur im Paar: Ein Site-Key von hier
    -- mit einem Secret von dort ergäbe Token, die der Anbieter nicht kennt.
    if coalesce(v_erben, false)
       and (site_key is null or secret is null)
       and to_regclass('public.bewerbung_schutz') is not null then

        execute $q$
            select b.captcha_anbieter,
                   nullif(btrim(coalesce(b.captcha_site_key, '')), ''),
                   nullif(btrim(coalesce(b.captcha_secret,  '')), '')
              from public.bewerbung_schutz b
             where b.id
        $q$ into anbieter, site_key, secret;
    end if;

    aktiv := coalesce(aktiv, false) and site_key is not null and secret is not null;
    anbieter := coalesce(anbieter, 'turnstile');
    return next;
end;
$$;

revoke execute on function public.rechnung_captcha_konfig() from public;


-- ---- Was die Seite wissen darf ---------------------------------------------
-- Ob ein Captcha verlangt wird, und mit welchem Schlüssel das Widget zu laden
-- ist. Beides ist öffentlich — der Site-Key steht bei jedem Anbieter so im
-- Quelltext der Seite. Das Secret bleibt hier.

create or replace function public.rechnung_schutz_info()
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
    select k.aktiv, k.anbieter, case when k.aktiv then k.site_key end
      from public.rechnung_captcha_konfig() k;
$$;

grant execute on function public.rechnung_schutz_info() to anon, authenticated;


-- 3 ---------------------------------------------------------- Die IP-Adresse
-- PostgREST legt die Kopfzeilen der Anfrage in eine Einstellung; daraus lesen
-- wir, von wo der Aufruf kam. Steht dort nichts (etwa beim Aufruf aus dem
-- SQL-Editor), gibt es keine Adresse — dann greift die Bremse nicht, denn ohne
-- Adresse wäre sie eine Bremse für alle zusammen.

create or replace function public.rechnung_ip()
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

    v_ip := coalesce(
        v_kopf->>'cf-connecting-ip',
        split_part(v_kopf->>'x-forwarded-for', ',', 1),
        v_kopf->>'x-real-ip'
    );

    return nullif(btrim(coalesce(v_ip, '')), '');
end;
$$;

revoke execute on function public.rechnung_ip() from public;


-- 4 -------------------------------------------------------------- Die Bremse
-- Gezählt wird in festen Zeitfenstern: eine Zeile je Zweck, Adresse und
-- Fenster. Das ist gröber als ein gleitendes Fenster, kostet aber keine
-- Geschichte und keinen Aufräumdienst, der laufen muss.

create table if not exists public.rechnung_versuche (
    zweck   text        not null check (zweck in ('einreichen', 'stand')),
    ip      text        not null,
    fenster timestamptz not null,
    anzahl  integer     not null default 0,
    primary key (zweck, ip, fenster)
);

alter table public.rechnung_versuche enable row level security;
revoke all on public.rechnung_versuche from anon, authenticated;

create index if not exists rechnung_versuche_fenster_idx
    on public.rechnung_versuche (fenster);

-- Anfang des Zeitfensters, in dem `now()` liegt. `p_sekunden` ist seine Länge.
create or replace function public.rechnung_fenster(p_sekunden integer)
returns timestamptz
language sql
stable
as $$
    select to_timestamp(floor(extract(epoch from now()) / p_sekunden) * p_sekunden);
$$;

revoke execute on function public.rechnung_fenster(integer) from public;

-- Nachsehen, ohne zu zählen: Ist für diese Adresse schon Schluss?
create or replace function public.rechnung_bremse_prueft(
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
    v_ip     text := public.rechnung_ip();
    v_anzahl integer;
begin
    if v_ip is null or p_limit is null then
        return true;
    end if;

    select v.anzahl into v_anzahl
      from public.rechnung_versuche v
     where v.zweck = p_zweck
       and v.ip = v_ip
       and v.fenster = public.rechnung_fenster(p_sekunden);

    return coalesce(v_anzahl, 0) < p_limit;
end;
$$;

revoke execute on function public.rechnung_bremse_prueft(text, integer, integer) from public;

-- Einen Versuch notieren. Nebenbei fliegen alte Zeilen hinaus — nicht bei
-- jedem Aufruf, sondern hier und da, damit die Tabelle nicht wächst und kein
-- Zeitplan dafür nötig ist.
create or replace function public.rechnung_bremse_zaehlt(
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
    v_ip text := public.rechnung_ip();
begin
    if v_ip is null then
        return;
    end if;

    insert into public.rechnung_versuche (zweck, ip, fenster, anzahl)
    values (p_zweck, v_ip, public.rechnung_fenster(p_sekunden), 1)
    on conflict (zweck, ip, fenster)
        do update set anzahl = rechnung_versuche.anzahl + 1;

    if random() < 0.02 then
        delete from public.rechnung_versuche where fenster < now() - interval '1 day';
    end if;
end;
$$;

revoke execute on function public.rechnung_bremse_zaehlt(text, integer) from public;


-- 5 ------------------------------------------------------ Das Captcha prüfen
-- Fragt den Anbieter, ob das Token echt ist. Beide Anbieter nehmen dieselbe
-- Form an: ein POST mit `secret` und `response`, zurück kommt JSON mit
-- `success`.
--
-- Der Fall, dass wir keine Antwort bekommen, ist bewusst anders geregelt als
-- ein „nein“ vom Anbieter:
--
--   nein vom Anbieter   → abgewiesen. Das ist die Aussage, um die es geht.
--   keine Antwort       → durchgelassen, mit einer Warnung im Log. Fällt der
--                         Anbieter aus, soll daran nicht die Erstattung
--                         hängen. Ein Skript kann unsere Leitung nach
--                         Cloudflare nicht kappen; es kann nur ein falsches
--                         Token schicken, und das wird abgewiesen.
--
-- Ein fehlendes oder leeres Token ist keine ausgefallene Leitung, sondern ein
-- „nein“: Wer das Formular umgeht, lässt genau dieses Feld weg.

create or replace function public.rechnung_captcha_prueft(p_token text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
    v_konfig  record;
    v_url     text;
    v_ip      text;
    v_koerper text;
    v_antwort http_response;
    v_erfolg  boolean;
begin
    select * into v_konfig from public.rechnung_captcha_konfig();

    -- Nicht eingeschaltet, oder es fehlt der Schlüssel: dann gilt weiter, was
    -- vorher galt — das versteckte Feld im Formular und die Bremse.
    if not coalesce(v_konfig.aktiv, false) or v_konfig.secret is null then
        return true;
    end if;

    if nullif(btrim(coalesce(p_token, '')), '') is null then
        return false;
    end if;

    v_url := case v_konfig.anbieter
        when 'hcaptcha' then 'https://api.hcaptcha.com/siteverify'
        else 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
    end;

    v_ip := public.rechnung_ip();

    v_koerper := 'secret=' || urlencode(v_konfig.secret)
              || '&response=' || urlencode(p_token);
    if v_ip is not null then
        v_koerper := v_koerper || '&remoteip=' || urlencode(v_ip);
    end if;

    begin
        -- Ohne Zeitgrenze hinge die Einreichung an der Laune des Anbieters.
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

revoke execute on function public.rechnung_captcha_prueft(text) from public;


-- 6 ------------------------------------------------- Die Einhängepunkte füllen
-- rechnungen.sql legt `rechnung_schutz_pruefen`, `rechnung_stand_pruefen` und
-- `rechnung_stand_fehlschlag` als leere Hüllen an und ruft sie an den
-- richtigen Stellen auf. Hier bekommen sie ihren Inhalt — `rechnung_einreichen`
-- und `rechnung_stand` selbst bleiben unberührt. Dadurch schaltet ein erneuter
-- Durchlauf von rechnungen.sql den Schutz nicht wieder ab.
--
-- Die Fehlercodes sind so gewählt, dass PostgREST daraus einen passenden
-- HTTP-Status macht (`PT4xx`), und die Seite erkennt sie am Code:
--
--   42501  geschlossen           → „Zurzeit keine Belege“
--   PT403  Captcha nicht bestanden
--   PT429  zu viele Versuche von dieser Adresse

-- ---- Vor dem Einreichen -----------------------------------------------------
-- Erst die Bremse, dann das Captcha: Eine Adresse, die schon an der Grenze
-- ist, soll den Anbieter nicht noch bei jedem Versuch beschäftigen.

create or replace function public.rechnung_schutz_pruefen(p_captcha_token text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
    v_limit integer;
begin
    select s.einreichen_limit into v_limit from public.rechnung_schutz s where s.id;

    if not public.rechnung_bremse_prueft('einreichen', 3600, v_limit) then
        raise exception 'Von dieser Verbindung kamen in der letzten Stunde schon mehrere Belege'
            using errcode = 'PT429';
    end if;

    if not public.rechnung_captcha_prueft(p_captcha_token) then
        raise exception 'Die Sicherheitsprüfung wurde nicht bestanden'
            using errcode = 'PT403';
    end if;

    -- Gezählt wird erst hier, nachdem beides bestanden ist: Wer sich beim
    -- Ausfüllen vertut, soll dadurch nicht an die Grenze stoßen.
    perform public.rechnung_bremse_zaehlt('einreichen', 3600);
end;
$$;

revoke execute on function public.rechnung_schutz_pruefen(text) from public;


-- ---- Vor der Standabfrage ---------------------------------------------------

create or replace function public.rechnung_stand_pruefen()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
    v_limit integer;
begin
    select s.stand_limit into v_limit from public.rechnung_schutz s where s.id;

    if not public.rechnung_bremse_prueft('stand', 600, v_limit) then
        raise exception 'Zu viele Versuche. Bitte in einigen Minuten noch einmal.'
            using errcode = 'PT429';
    end if;
end;
$$;

revoke execute on function public.rechnung_stand_pruefen() from public;


-- ---- Eine Nummer, die es nicht gibt -----------------------------------------

create or replace function public.rechnung_stand_fehlschlag()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
    perform public.rechnung_bremse_zaehlt('stand', 600);
end;
$$;

revoke execute on function public.rechnung_stand_fehlschlag() from public;


-- 7 --------------------------------------------------------------- Nachlesen
-- Ob das Captcha überhaupt gefragt wird, und mit welchem Schlüssel:
--
--   select * from public.rechnung_schutz_info();
--
-- Wer wissen will, ob die Bremse gerade greift:
--
--   select * from public.rechnung_versuche order by fenster desc;
--
-- Und wer eine Adresse wieder freigeben will:
--
--   delete from public.rechnung_versuche where ip = '…';
-- =============================================================================
