/* =============================================================================
   nutzer-verwalten – Konten anlegen und löschen
   -----------------------------------------------------------------------------
   Rollen und Ressorts ändert die Seite selbst: das sind Spalten in `profiles`,
   und die Zugriffsregeln aus `supabase/nutzer.sql` lassen den Vorstand daran.

   Ein Konto anzulegen oder zu löschen greift dagegen in `auth.users` ein, und
   das geht nur mit dem Dienstschlüssel. Der gehört nicht in den Browser –
   also liegt er hier, in einer Funktion, die vorher nachsieht, wer da ruft.

   Geprüft wird jedes Mal:
     1. Ist ein gültiges Anmelde-Token dabei?
     2. Hat die Person laut `profiles` die Rolle „vorstand“?
   Erst dann wird gearbeitet.

   Anlegen schickt keine Mail. Das Portal meldet mit einem Code an, den man
   sich auf /login selbst schicken lässt – das Konto muss dafür nur bestehen.

   Aufruf aus der Seite:
     sb.functions.invoke("nutzer-verwalten", { body: { aktion: "anlegen", … } })

   Einrichten: siehe docs/nutzerverwaltung.md
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const ERLAUBTE_ROLLEN = ["vorstand", "ressortleiter", "protokollfuehrer"];

const ERLAUBTE_HERKUNFT = [
  "https://portal.fsbs-hm.de",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5500",
];

function kopfzeilen(herkunft: string | null) {
  const origin = herkunft && ERLAUBTE_HERKUNFT.includes(herkunft)
    ? herkunft
    : ERLAUBTE_HERKUNFT[0];

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json",
  };
}

function antwort(daten: unknown, status: number, herkunft: string | null) {
  return new Response(JSON.stringify(daten), {
    status,
    headers: kopfzeilen(herkunft),
  });
}

function fehler(text: string, status: number, herkunft: string | null) {
  return antwort({ fehler: text }, status, herkunft);
}

function mailOk(wert: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(wert);
}

function text(wert: unknown) {
  return typeof wert === "string" ? wert.trim() : "";
}

Deno.serve(async (req) => {
  const herkunft = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: kopfzeilen(herkunft) });
  }
  if (req.method !== "POST") {
    return fehler("Nur POST.", 405, herkunft);
  }

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const dienstSchluessel = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!url || !dienstSchluessel) {
    return fehler("Die Funktion ist nicht vollständig eingerichtet.", 500, herkunft);
  }

  /* ---------- 1. Wer ruft da? ---------- */
  const authKopf = req.headers.get("Authorization") ?? "";
  if (!authKopf.toLowerCase().startsWith("bearer ")) {
    return fehler("Nicht angemeldet.", 401, herkunft);
  }

  const admin = createClient(url, dienstSchluessel, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const alsNutzer = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authKopf } },
  });

  const { data: { user }, error: userFehler } = await alsNutzer.auth.getUser();
  if (userFehler || !user) {
    return fehler("Nicht angemeldet.", 401, herkunft);
  }

  /* ---------- 2. Ist das der Vorstand? ---------- */
  const { data: meinProfil } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const meineRolle = (meinProfil?.role ?? "").trim().toLowerCase();
  if (meineRolle !== "vorstand") {
    return fehler("Nur der Vorstand darf Konten verwalten.", 403, herkunft);
  }

  /* ---------- 3. Was ist zu tun? ---------- */
  let rumpf: Record<string, unknown>;
  try {
    rumpf = await req.json();
  } catch {
    return fehler("Keine lesbaren Daten.", 400, herkunft);
  }

  const aktion = text(rumpf.aktion);

  /* ===================================================== Konto anlegen ===== */
  if (aktion === "anlegen") {
    const email = text(rumpf.email).toLowerCase();
    const anzeigename = text(rumpf.display_name);
    const ressort = text(rumpf.ressort);
    const rolle = (text(rumpf.role) || "ressortleiter").toLowerCase();

    if (!mailOk(email)) {
      return fehler("Die Mailadresse sieht nicht richtig aus.", 400, herkunft);
    }
    if (!ERLAUBTE_ROLLEN.includes(rolle)) {
      return fehler("Diese Rolle gibt es nicht.", 400, herkunft);
    }

    /* Anlegen – und wenn es das Konto schon gibt, das bestehende nehmen.
       Dann fehlt meist nur das Profil, und genau das wird hier nachgetragen. */
    let kontoId = "";
    let bestand = false;

    const { data: neu, error: anlegeFehler } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: anzeigename ? { display_name: anzeigename } : {},
    });

    if (anlegeFehler) {
      const meldung = (anlegeFehler.message || "").toLowerCase();
      const schonDa = meldung.includes("already") || meldung.includes("registered") ||
        meldung.includes("exists");
      if (!schonDa) {
        return fehler("Konto anlegen: " + anlegeFehler.message, 400, herkunft);
      }

      const vorhanden = await kontoSuchen(admin, email);
      if (!vorhanden) {
        return fehler("Das Konto gibt es schon, ist aber nicht auffindbar.", 400, herkunft);
      }
      kontoId = vorhanden;
      bestand = true;
    } else {
      kontoId = neu.user.id;
    }

    const { error: profilFehler } = await admin
      .from("profiles")
      .upsert({
        id: kontoId,
        role: rolle,
        display_name: anzeigename || null,
        ressort: ressort || null,
      }, { onConflict: "id" });

    if (profilFehler) {
      /* Ein frisch angelegtes Konto ohne Profil wäre eine Leiche in
         `auth.users`. Also zurückrollen, was gerade entstanden ist. */
      if (!bestand) await admin.auth.admin.deleteUser(kontoId);
      return fehler("Profil anlegen: " + profilFehler.message, 400, herkunft);
    }

    return antwort({
      ok: true,
      id: kontoId,
      email,
      bestand,
      hinweis: bestand
        ? "Das Konto gab es schon – das Profil ist jetzt hinterlegt."
        : "Konto angelegt. Anmelden geht über /login mit einem Code.",
    }, 200, herkunft);
  }

  /* ====================================================== Konto löschen ===== */
  if (aktion === "loeschen") {
    const id = text(rumpf.id);
    if (!id) return fehler("Es fehlt, wer gelöscht werden soll.", 400, herkunft);

    if (id === user.id) {
      return fehler("Das eigene Konto lässt sich hier nicht löschen.", 400, herkunft);
    }

    const { data: profil } = await admin
      .from("profiles")
      .select("role")
      .eq("id", id)
      .maybeSingle();

    /* Ohne Vorstand vergibt niemand mehr Rollen – der letzte bleibt. */
    if ((profil?.role ?? "").trim().toLowerCase() === "vorstand") {
      const { count } = await admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "vorstand");

      if ((count ?? 0) <= 1) {
        return fehler(
          "Das ist der letzte Vorstand – erst einen zweiten ernennen.",
          400,
          herkunft,
        );
      }
    }

    /* Das Profil hängt per Fremdschlüssel am Konto und geht mit. Falls die
       Verknüpfung fehlt, räumt der zweite Schritt hinterher. */
    const { error: loeschFehler } = await admin.auth.admin.deleteUser(id);
    if (loeschFehler) {
      const meldung = (loeschFehler.message || "").toLowerCase();
      if (!meldung.includes("not found")) {
        return fehler("Konto löschen: " + loeschFehler.message, 400, herkunft);
      }
    }

    await admin.from("profiles").delete().eq("id", id);

    return antwort({ ok: true, id }, 200, herkunft);
  }

  return fehler("Unbekannte Aktion.", 400, herkunft);
});

/* Die Admin-API kennt keine Suche nach Mailadresse, nur seitenweises
   Blättern. Bei der Größe der Fachschaft ist das eine Handvoll Seiten. */
async function kontoSuchen(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<string> {
  for (let seite = 1; seite <= 20; seite++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page: seite,
      perPage: 200,
    });
    if (error || !data?.users?.length) return "";

    const treffer = data.users.find(
      (u) => (u.email ?? "").toLowerCase() === email,
    );
    if (treffer) return treffer.id;

    if (data.users.length < 200) return "";
  }
  return "";
}
