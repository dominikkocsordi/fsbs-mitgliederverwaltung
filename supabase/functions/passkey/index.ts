/* =============================================================================
   passkey – Anmelden mit Face ID, Fingerabdruck oder Windows Hello
   -----------------------------------------------------------------------------
   Vier Schritte, zwei Vorgänge:

     registrieren-start    Aufgabe für ein neues Gerät   (angemeldet)
     registrieren-fertig   Unterschrift prüfen, Passkey hinterlegen (angemeldet)
     anmelden-start        Aufgabe für die Anmeldung     (offen)
     anmelden-fertig       Unterschrift prüfen, Anmeldung ausstellen (offen)

   Die beiden „offenen“ Schritte müssen ohne Anmeldung erreichbar sein – wer
   sich gerade anmelden will, hat ja noch keine. Sicher bleibt das trotzdem:
   Ausgestellt wird nur, was gegen einen hinterlegten öffentlichen Schlüssel
   geprüft wurde, und hinterlegt wird ein Schlüssel nur von jemandem, der
   bereits angemeldet ist.

   Neue Konten entstehen hier nicht. `generateLink` verlangt ein Konto, das
   es schon gibt, und meldet sonst schlicht nichts zurück – wer nicht vom
   Vorstand auf /nutzer angelegt wurde, kommt auch mit Passkey nicht hinein.

   Ausgestellt wird kein Token von Hand: Die Funktion lässt sich von Supabase
   eine einmalige Anmeldemarke geben (dieselbe, die sonst in der Mail steht)
   und reicht sie an die Seite weiter. Die Seite löst sie mit `verifyOtp` ein
   und hat danach eine ganz gewöhnliche Sitzung.

   Einrichten: siehe docs/passkeys.md
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
/* Das Prüfen einer WebAuthn-Unterschrift von Hand zu schreiben wäre die
   eine Stelle, an der ein Fehler teuer wird. Also die Bibliothek, die
   alle dafür nehmen — auf eine feste Fassung genagelt. */
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "npm:@simplewebauthn/server@13.1.1";

const RP_NAME = "FSBS Intern";

/* Dieselbe Liste wie in `nutzer-verwalten`. Der Passkey hängt am Namen der
   Seite – ein Schlüssel für portal.fsbs-hm.de lässt sich auf keiner anderen
   Adresse benutzen, und genau das macht ihn gegen falsche Seiten dicht. */
const ERLAUBTE_HERKUNFT = [
  "https://portal.fsbs-hm.de",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5500",
];

/* Wie lange eine Aufgabe gilt. Wer länger braucht, fängt neu an. */
const AUFGABE_GUELTIG_MS = 5 * 60 * 1000;

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

function text(wert: unknown) {
  return typeof wert === "string" ? wert.trim() : "";
}

/* base64url ⇄ Bytes. Der öffentliche Schlüssel kommt als Bytefolge aus der
   Prüfung und muss als Text in die Tabelle. */
function nachB64(bytes: Uint8Array) {
  let roh = "";
  for (const b of bytes) roh += String.fromCharCode(b);
  return btoa(roh).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function ausB64(wert: string) {
  const norm = wert.replace(/-/g, "+").replace(/_/g, "/");
  const roh = atob(norm.padEnd(Math.ceil(norm.length / 4) * 4, "="));
  const bytes = new Uint8Array(roh.length);
  for (let i = 0; i < roh.length; i++) bytes[i] = roh.charCodeAt(i);
  return bytes;
}

/* `transports` ist eine Liste wie ["internal","hybrid"] – oder gar nichts.
   Der Browser sagt damit, wie das Gerät erreichbar ist. */
// deno-lint-ignore no-explicit-any
function transporte(wert: unknown): any {
  return Array.isArray(wert) && wert.length ? wert : undefined;
}

/* In `clientDataJSON` steht, welche Aufgabe das Gerät unterschrieben hat.
   Kommt dort Unsinn an, ist die Antwort einfach keine – geprüft wird sie
   ohnehin gleich darauf noch einmal von der Bibliothek. */
function challengeAus(antwortDesGeraets: Record<string, unknown>) {
  try {
    const roh = (antwortDesGeraets.response as Record<string, string>)?.clientDataJSON ?? "";
    const daten = JSON.parse(new TextDecoder().decode(ausB64(roh)));
    return typeof daten.challenge === "string" ? daten.challenge : "";
  } catch {
    return "";
  }
}

/* Der Passkey gehört zur Domain, nicht zur Adresse: „portal.fsbs-hm.de“,
   nicht „https://portal.fsbs-hm.de/login“. */
function rpIdVon(herkunft: string) {
  try {
    return new URL(herkunft).hostname;
  } catch {
    return "portal.fsbs-hm.de";
  }
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

  /* Ein Passkey ist an die Adresse gebunden, von der er kommt. Eine fremde
     Herkunft wird deshalb gar nicht erst bedient. */
  if (!herkunft || !ERLAUBTE_HERKUNFT.includes(herkunft)) {
    return fehler("Diese Adresse ist nicht freigegeben.", 403, herkunft);
  }
  const rpID = rpIdVon(herkunft);

  let rumpf: Record<string, unknown>;
  try {
    rumpf = await req.json();
  } catch {
    return fehler("Keine lesbaren Daten.", 400, herkunft);
  }

  const aktion = text(rumpf.aktion);

  const admin = createClient(url, dienstSchluessel, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /* Alte Aufgaben bei jedem Durchgang wegräumen – die Tabelle bleibt so
     von allein klein. */
  try {
    await admin.rpc("passkey_aufgaben_aufraeumen");
  } catch { /* nicht schlimm: die Aufgaben laufen ohnehin ab */ }

  /* Wer angemeldet ist, steht im Token. Für die beiden offenen Schritte
     darf das leer bleiben. */
  async function angemeldeterNutzer() {
    const authKopf = req.headers.get("Authorization") ?? "";
    if (!authKopf.toLowerCase().startsWith("bearer ")) return null;

    const alsNutzer = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authKopf } },
    });
    const { data, error } = await alsNutzer.auth.getUser();
    if (error || !data?.user) return null;
    return data.user;
  }

  async function aufgabeMerken(challenge: string, art: string, userId: string | null) {
    await admin.from("passkey_aufgaben").insert({
      challenge,
      art,
      user_id: userId,
    });
  }

  /* Einlösen heisst: holen und im selben Zug löschen. Eine Aufgabe zweimal
     zu benutzen ist damit ausgeschlossen. */
  async function aufgabeEinloesen(challenge: string, art: string) {
    if (!challenge) return null;

    const { data } = await admin
      .from("passkey_aufgaben")
      .delete()
      .eq("challenge", challenge)
      .eq("art", art)
      .select("challenge, user_id, created_at")
      .maybeSingle();

    if (!data) return null;
    if (Date.now() - new Date(data.created_at).getTime() > AUFGABE_GUELTIG_MS) {
      return null;
    }
    return data;
  }

  /* ================================================ Passkey anlegen: Start == */
  if (aktion === "registrieren-start") {
    const user = await angemeldeterNutzer();
    if (!user) return fehler("Nicht angemeldet.", 401, herkunft);

    /* Was schon auf diesem Gerät liegt, soll nicht doppelt angelegt werden. */
    const { data: vorhanden } = await admin
      .from("passkeys")
      .select("credential_id, transports")
      .eq("user_id", user.id);

    const optionen = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      userID: new TextEncoder().encode(user.id),
      userName: user.email ?? user.id,
      userDisplayName: (user.user_metadata?.display_name as string) || user.email || "FSBS",
      attestationType: "none",
      excludeCredentials: (vorhanden ?? []).map((p) => ({
        id: p.credential_id as string,
        transports: transporte(p.transports),
      })),
      authenticatorSelection: {
        /* „required“: Der Schlüssel liegt auffindbar auf dem Gerät. Nur so
           geht Anmelden ohne vorher die Mailadresse zu tippen. */
        residentKey: "required",
        userVerification: "preferred",
      },
    });

    await aufgabeMerken(optionen.challenge, "registrieren", user.id);
    return antwort({ ok: true, optionen }, 200, herkunft);
  }

  /* =============================================== Passkey anlegen: Fertig == */
  if (aktion === "registrieren-fertig") {
    const user = await angemeldeterNutzer();
    if (!user) return fehler("Nicht angemeldet.", 401, herkunft);

    const antwortDesGeraets = rumpf.antwort as Record<string, unknown> | undefined;
    if (!antwortDesGeraets) return fehler("Es fehlt die Antwort des Geräts.", 400, herkunft);

    const aufgabe = await aufgabeEinloesen(challengeAus(antwortDesGeraets), "registrieren");
    if (!aufgabe || aufgabe.user_id !== user.id) {
      return fehler("Die Anfrage ist abgelaufen – bitte noch einmal.", 400, herkunft);
    }

    let geprueft;
    try {
      geprueft = await verifyRegistrationResponse({
        // deno-lint-ignore no-explicit-any
        response: antwortDesGeraets as any,
        expectedChallenge: aufgabe.challenge,
        expectedOrigin: herkunft,
        expectedRPID: rpID,
        requireUserVerification: false,
      });
    } catch (e) {
      return fehler("Der Passkey liess sich nicht prüfen: " + (e as Error).message, 400, herkunft);
    }

    if (!geprueft.verified || !geprueft.registrationInfo) {
      return fehler("Der Passkey liess sich nicht prüfen.", 400, herkunft);
    }

    const schluessel = geprueft.registrationInfo.credential;
    const name = text(rumpf.name).slice(0, 60) || "Dieses Gerät";

    const { error: schreibFehler } = await admin.from("passkeys").insert({
      user_id: user.id,
      credential_id: schluessel.id,
      public_key: nachB64(schluessel.publicKey),
      counter: schluessel.counter ?? 0,
      transports: schluessel.transports ?? null,
      name,
    });

    if (schreibFehler) {
      const meldung = (schreibFehler.message || "").toLowerCase();
      if (meldung.includes("duplicate") || meldung.includes("unique")) {
        return fehler("Dieser Passkey ist bereits hinterlegt.", 400, herkunft);
      }
      return fehler("Passkey speichern: " + schreibFehler.message, 400, herkunft);
    }

    return antwort({ ok: true, name }, 200, herkunft);
  }

  /* ===================================================== Anmelden: Start ==== */
  if (aktion === "anmelden-start") {
    const optionen = await generateAuthenticationOptions({
      rpID,
      /* Ohne Liste: Das Gerät bietet selbst an, welcher Passkey für diese
         Seite passt. Die Seite verrät damit nicht, welche Konten es gibt —
         und niemand muss vorher eine Mailadresse tippen. */
      userVerification: "preferred",
    });

    await aufgabeMerken(optionen.challenge, "anmelden", null);
    return antwort({ ok: true, optionen }, 200, herkunft);
  }

  /* ==================================================== Anmelden: Fertig ==== */
  if (aktion === "anmelden-fertig") {
    const antwortDesGeraets = rumpf.antwort as Record<string, unknown> | undefined;
    if (!antwortDesGeraets) return fehler("Es fehlt die Antwort des Geräts.", 400, herkunft);

    const aufgabe = await aufgabeEinloesen(challengeAus(antwortDesGeraets), "anmelden");
    if (!aufgabe) {
      return fehler("Die Anfrage ist abgelaufen – bitte noch einmal.", 400, herkunft);
    }

    const kennung = text(antwortDesGeraets.id);
    const { data: passkey } = await admin
      .from("passkeys")
      .select("id, user_id, credential_id, public_key, counter, transports")
      .eq("credential_id", kennung)
      .maybeSingle();

    if (!passkey) {
      return fehler("Dieser Passkey ist hier nicht hinterlegt.", 401, herkunft);
    }

    let geprueft;
    try {
      geprueft = await verifyAuthenticationResponse({
        // deno-lint-ignore no-explicit-any
        response: antwortDesGeraets as any,
        expectedChallenge: aufgabe.challenge,
        expectedOrigin: herkunft,
        expectedRPID: rpID,
        credential: {
          id: passkey.credential_id as string,
          publicKey: ausB64(passkey.public_key as string),
          counter: Number(passkey.counter ?? 0),
          transports: transporte(passkey.transports),
        },
        requireUserVerification: false,
      });
    } catch (e) {
      return fehler("Die Anmeldung liess sich nicht prüfen: " + (e as Error).message, 401, herkunft);
    }

    if (!geprueft.verified) {
      return fehler("Die Anmeldung liess sich nicht prüfen.", 401, herkunft);
    }

    /* Der Zähler steigt bei jeder Benutzung. Fällt er zurück, ist der
       Schlüssel kopiert worden – simplewebauthn hat das oben schon
       abgelehnt; hier wird nur der neue Stand festgehalten. */
    await admin
      .from("passkeys")
      .update({
        counter: geprueft.authenticationInfo.newCounter,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", passkey.id);

    /* Ein Konto ohne Profil kommt auf keine Seite – mit Passkey soll es
       auch gar nicht erst eine Sitzung bekommen. */
    const { data: profil } = await admin
      .from("profiles")
      .select("role")
      .eq("id", passkey.user_id)
      .maybeSingle();

    if (!profil) {
      return fehler("Für dieses Konto ist keine Rolle hinterlegt.", 403, herkunft);
    }

    const { data: konto, error: kontoFehler } = await admin.auth.admin.getUserById(
      passkey.user_id as string,
    );
    if (kontoFehler || !konto?.user?.email) {
      return fehler("Das Konto zu diesem Passkey gibt es nicht mehr.", 401, herkunft);
    }

    /* Die Marke, die sonst in der Mail steht – hier direkt an die Seite.
       Sie gilt einmal und läuft nach kurzer Zeit ab. Eine Mail geht dabei
       nicht hinaus. */
    const { data: marke, error: markeFehler } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: konto.user.email,
    });

    const hashedToken = marke?.properties?.hashed_token;
    if (markeFehler || !hashedToken) {
      return fehler("Die Anmeldung liess sich nicht ausstellen.", 500, herkunft);
    }

    return antwort({
      ok: true,
      token_hash: hashedToken,
      email: konto.user.email,
    }, 200, herkunft);
  }

  return fehler("Unbekannte Aktion.", 400, herkunft);
});
