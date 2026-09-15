-- =============================================================================
--  Passkeys – Anmelden ohne Code
-- =============================================================================
--  Einmal komplett im Supabase-SQL-Editor ausführen. Das Skript ist
--  wiederholbar: ein zweiter Durchlauf ändert nichts und löscht nichts.
--
--  Es richtet die zweite Art ein, sich am Portal anzumelden: mit Face ID,
--  Fingerabdruck oder Windows Hello statt mit dem Code aus der Mail. Der
--  Code bleibt daneben bestehen – ein Passkey ist eine Bequemlichkeit,
--  kein Ersatz.
--
--  Wer hineinkommt, ändert sich dadurch nicht. Einen Passkey hinterlegt
--  man nur an einem Konto, das es schon gibt, und Konten legt weiterhin
--  allein der Vorstand auf `/nutzer` an. Wer kein Konto hat, hat auch
--  nichts, woran ein Passkey hängen könnte.
--
--  Das Prüfen der Passkeys selbst erledigt die Edge Function `passkey`
--  (supabase/functions/passkey). Sie schreibt mit dem Dienstschlüssel und
--  kommt an diese Tabellen unabhängig von den Regeln hier vorbei; die
--  Regeln gelten für den Browser.
--
--  Einrichten: siehe docs/passkeys.md
-- =============================================================================


-- 1 ------------------------------------------------------------- Die Passkeys
-- Eine Zeile je Gerät. `credential_id` ist die Kennung, die der Browser bei
-- jeder Anmeldung mitschickt; `public_key` der öffentliche Schlüssel, gegen
-- den die Unterschrift geprüft wird. Beides ist unbedenklich – der geheime
-- Teil verlässt das Gerät nie.

create table if not exists public.passkeys (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users (id) on delete cascade,
    credential_id text not null unique,
    public_key    text not null,
    counter       bigint not null default 0,
    transports    text[],
    name          text,
    created_at    timestamptz not null default now(),
    last_used_at  timestamptz
);

create index if not exists passkeys_user_id_idx on public.passkeys (user_id);


-- 2 ---------------------------------------------------------- Die Aufgaben
-- Beim Anlegen und beim Anmelden stellt der Server eine Zufallsaufgabe, die
-- das Gerät unterschreibt. Sie darf genau einmal gelten, sonst liesse sich
-- eine abgefangene Unterschrift wiederverwenden. Eine Edge Function hat
-- keinen Zwischenspeicher – also steht die Aufgabe hier, bis sie eingelöst
-- oder alt ist.

create table if not exists public.passkey_aufgaben (
    challenge  text primary key,
    user_id    uuid references auth.users (id) on delete cascade,
    art        text not null,
    created_at timestamptz not null default now()
);

create index if not exists passkey_aufgaben_created_at_idx
    on public.passkey_aufgaben (created_at);


-- 3 ------------------------------------------------------------------ Zugriff
-- Die eigenen Passkeys darf jede angemeldete Person sehen und löschen – das
-- ist die Liste im Konto-Menü. Anlegen und ändern geht nicht aus dem
-- Browser: ein Passkey entsteht nur dort, wo vorher eine Unterschrift
-- geprüft wurde, und das ist die Funktion.
--
-- An die Aufgaben kommt aus dem Browser niemand. Die Tabelle bekommt
-- Zeilenschutz und keine einzige Regel – damit ist sie für jeden Schlüssel
-- ausser dem Dienstschlüssel leer.

alter table public.passkeys         enable row level security;
alter table public.passkey_aufgaben enable row level security;

drop policy if exists "passkey_eigene_lesen"   on public.passkeys;
drop policy if exists "passkey_eigene_loeschen" on public.passkeys;

create policy "passkey_eigene_lesen"
    on public.passkeys for select
    to authenticated
    using (user_id = auth.uid());

create policy "passkey_eigene_loeschen"
    on public.passkeys for delete
    to authenticated
    using (user_id = auth.uid());


-- 4 ------------------------------------------------------------- Aufräumen
-- Alte Aufgaben sind wertlos: Die Funktion nimmt nur an, was jünger als
-- fünf Minuten ist. Sie ruft diese Funktion bei jedem Durchgang auf, damit
-- die Tabelle nicht wächst. Eingeplante Aufträge braucht es dafür nicht.

create or replace function public.passkey_aufgaben_aufraeumen()
returns void
language sql
security definer
set search_path = public
as $$
    delete from public.passkey_aufgaben
     where created_at < now() - interval '15 minutes';
$$;
