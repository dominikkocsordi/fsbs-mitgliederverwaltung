/* ============================================================
   FSBS INTERN — Passkeys
   ------------------------------------------------------------
   Die Browserseite des Anmeldens ohne Code. Zwei Wege, beide
   über die Edge Function `passkey`:

     FSBSPasskey.anlegen(sb, name)   an einem angemeldeten Konto
                                     einen Passkey hinterlegen
     FSBSPasskey.anmelden(sb)        sich damit anmelden

   Ein Konto entsteht dabei nie. `anmelden` kommt nur an eine
   Sitzung, wenn der Schlüssel schon hinterlegt ist — und
   hinterlegen kann ihn nur, wer bereits angemeldet ist. Konten
   legt weiterhin allein der Vorstand auf /nutzer an.

   Die Funktion spricht JSON, `navigator.credentials` spricht
   Bytefolgen. Dazwischen steht die Umrechnung unten.
   ============================================================ */
(function () {
  'use strict';

  var FUNKTION = 'passkey';

  /* ---------- base64url ⇄ Bytes ---------- */
  function ausB64(wert) {
    var norm = String(wert || '').replace(/-/g, '+').replace(/_/g, '/');
    while (norm.length % 4) norm += '=';
    var roh = atob(norm);
    var bytes = new Uint8Array(roh.length);
    for (var i = 0; i < roh.length; i++) bytes[i] = roh.charCodeAt(i);
    return bytes.buffer;
  }

  function nachB64(puffer) {
    var bytes = new Uint8Array(puffer);
    var roh = '';
    for (var i = 0; i < bytes.length; i++) roh += String.fromCharCode(bytes[i]);
    return btoa(roh).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /* ---------- Kann der Browser das überhaupt? ---------- */
  function verfuegbar() {
    return typeof window.PublicKeyCredential === 'function' &&
           !!(navigator.credentials && navigator.credentials.create);
  }

  /* ---------- Die Funktion rufen ----------
     supabase-js holt bei einer Fehlerantwort den Text nicht selbst heraus,
     sondern meldet nur „non-2xx“. Also selbst nachsehen. */
  function ruf(sb, koerper) {
    return sb.functions.invoke(FUNKTION, { body: koerper }).then(function (res) {
      if (!res.error) {
        if (res.data && res.data.fehler) throw new Error(res.data.fehler);
        return res.data;
      }
      var ctx = res.error.context;
      var json = ctx && ctx.json ? ctx.json() : Promise.resolve(null);
      return json.catch(function () { return null; }).then(function (rumpf) {
        if (rumpf && rumpf.fehler) throw new Error(rumpf.fehler);
        if (ctx && ctx.status === 404) {
          throw new Error('Passkeys sind auf dem Server noch nicht eingerichtet.');
        }
        throw new Error(res.error.message || 'Die Anfrage ist fehlgeschlagen.');
      });
    });
  }

  /* Das Gerät bricht ab, wenn der Mensch abbricht — oder wenn nichts
     Passendes da ist. Beides ist kein Fehler, den man rot anzeigen müsste. */
  function abgebrochen(err) {
    var name = err && err.name;
    return name === 'NotAllowedError' || name === 'AbortError';
  }

  /* ============================================================
     Passkey hinterlegen (setzt eine Anmeldung voraus)
     ============================================================ */
  async function anlegen(sb, name) {
    if (!verfuegbar()) throw new Error('Dieser Browser kennt keine Passkeys.');

    var start = await ruf(sb, { aktion: 'registrieren-start' });
    var o = start.optionen;

    var optionen = {
      challenge: ausB64(o.challenge),
      rp: o.rp,
      user: {
        id: ausB64(o.user.id),
        name: o.user.name,
        displayName: o.user.displayName
      },
      pubKeyCredParams: o.pubKeyCredParams,
      timeout: o.timeout,
      attestation: o.attestation,
      authenticatorSelection: o.authenticatorSelection,
      excludeCredentials: (o.excludeCredentials || []).map(function (c) {
        return { id: ausB64(c.id), type: c.type || 'public-key', transports: c.transports };
      })
    };

    var cred;
    try {
      cred = await navigator.credentials.create({ publicKey: optionen });
    } catch (err) {
      if (abgebrochen(err)) return { abgebrochen: true };
      if (err && err.name === 'InvalidStateError') {
        throw new Error('Für dieses Gerät gibt es hier schon einen Passkey.');
      }
      throw err;
    }
    if (!cred) return { abgebrochen: true };

    var antwort = {
      id: cred.id,
      rawId: nachB64(cred.rawId),
      type: cred.type,
      clientExtensionResults: cred.getClientExtensionResults(),
      authenticatorAttachment: cred.authenticatorAttachment || undefined,
      response: {
        clientDataJSON: nachB64(cred.response.clientDataJSON),
        attestationObject: nachB64(cred.response.attestationObject),
        transports: cred.response.getTransports ? cred.response.getTransports() : []
      }
    };

    var fertig = await ruf(sb, { aktion: 'registrieren-fertig', antwort: antwort, name: name });
    return { ok: true, name: fertig && fertig.name };
  }

  /* ============================================================
     Mit Passkey anmelden
     ------------------------------------------------------------
     Das Gerät bietet selbst an, welcher Schlüssel für diese Seite
     passt — eine Mailadresse muss niemand eintippen. Am Ende steht
     eine ganz gewöhnliche Supabase-Sitzung.
     ============================================================ */
  async function anmelden(sb) {
    if (!verfuegbar()) throw new Error('Dieser Browser kennt keine Passkeys.');

    var start = await ruf(sb, { aktion: 'anmelden-start' });
    var o = start.optionen;

    var optionen = {
      challenge: ausB64(o.challenge),
      rpId: o.rpId,
      timeout: o.timeout,
      userVerification: o.userVerification
    };

    /* Ohne Liste sucht das Gerät selbst den passenden Schlüssel heraus —
       genau das ist der Weg ohne Mailadresse. Eine leere Liste mitzugeben
       ist nicht dasselbe, also bleibt das Feld dann ganz weg. */
    if (o.allowCredentials && o.allowCredentials.length) {
      optionen.allowCredentials = o.allowCredentials.map(function (c) {
        return { id: ausB64(c.id), type: c.type || 'public-key', transports: c.transports };
      });
    }

    var cred;
    try {
      cred = await navigator.credentials.get({ publicKey: optionen });
    } catch (err) {
      if (abgebrochen(err)) return { abgebrochen: true };
      throw err;
    }
    if (!cred) return { abgebrochen: true };

    var antwort = {
      id: cred.id,
      rawId: nachB64(cred.rawId),
      type: cred.type,
      clientExtensionResults: cred.getClientExtensionResults(),
      authenticatorAttachment: cred.authenticatorAttachment || undefined,
      response: {
        clientDataJSON: nachB64(cred.response.clientDataJSON),
        authenticatorData: nachB64(cred.response.authenticatorData),
        signature: nachB64(cred.response.signature),
        userHandle: cred.response.userHandle ? nachB64(cred.response.userHandle) : undefined
      }
    };

    var fertig = await ruf(sb, { aktion: 'anmelden-fertig', antwort: antwort });
    if (!fertig || !fertig.token_hash) {
      throw new Error('Die Anmeldung liess sich nicht ausstellen.');
    }

    /* Die Marke einlösen: dieselbe, die sonst per Mail käme. Danach ist
       die Sitzung da, als wäre ein Code eingegeben worden. */
    var eingeloest = await sb.auth.verifyOtp({
      token_hash: fertig.token_hash,
      type: 'magiclink'
    });
    if (eingeloest.error) throw new Error(eingeloest.error.message);

    return { ok: true, email: fertig.email, session: eingeloest.data && eingeloest.data.session };
  }

  window.FSBSPasskey = {
    verfuegbar: verfuegbar,
    anlegen: anlegen,
    anmelden: anmelden
  };
})();
