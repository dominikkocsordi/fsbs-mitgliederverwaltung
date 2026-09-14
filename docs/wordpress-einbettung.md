# Das Bewerbungsformular in WordPress einbetten

Kurz: Ja, das geht — und zwar beides, das Formular und die Abfrage
„Wie weit ist meine Bewerbung?“. Niemand muss mehr auf
`portal.fsbs-hm.de/bewerbung` wechseln.

Eingebettet wird als iframe, nicht als kopierter HTML-Schnipsel. Das hat
zwei Gründe, die sich nicht umgehen lassen:

* Das Formular holt sich seine Fragen, die Ressorts und den Text der
  Einwilligung aus der Datenbank und schickt die Bewerbung wieder dorthin.
  Ein kopierter Schnipsel wäre am Tag nach der nächsten Änderung im Portal
  veraltet.
* Der Schlüssel der Sicherheitsprüfung (Captcha) gilt für
  `portal.fsbs-hm.de`. Im iframe läuft die Seite weiter unter dieser
  Adresse, und alles bleibt richtig — ganz gleich, unter welcher Domain die
  WordPress-Seite erreichbar ist.

Damit vom iframe nichts zu sehen ist, tut die Seite drei Dinge: Sie legt
ihren eigenen Hintergrund und ihren Rahmen ab, sie meldet ihre Höhe nach
draußen (das Formular ist mal länger, mal kürzer), und sie bittet die
WordPress-Seite zu scrollen, wenn drinnen etwas angesprungen werden muss.

---

## Der einfache Weg

In WordPress einen Block **„Benutzerdefiniertes HTML“** einsetzen und das
hier hineinkopieren:

```html
<div data-fsbs-bewerbung></div>
<script src="https://portal.fsbs-hm.de/embed.js" defer></script>
```

Fertig. Das ergibt das vollständige Formular mit dem Link „Schon beworben?
Stand abrufen“ darunter.

### Nur das Formular

```html
<div data-fsbs-bewerbung data-ansicht="formular" data-kopf="0"></div>
<script src="https://portal.fsbs-hm.de/embed.js" defer></script>
```

`data-kopf="0"` lässt Titel und Einleitung weg — die WordPress-Seite hat
ja ihre eigene Überschrift.

### Nur die Standabfrage

Auf einer eigenen Seite, etwa `fsbs-hm.de/bewerbung-status`:

```html
<div data-fsbs-bewerbung data-ansicht="stand"></div>
<script src="https://portal.fsbs-hm.de/embed.js" defer></script>
```

### Beides auf einer Seite

Zwei Platzhalter, ein Skript:

```html
<h2>Bewirb dich</h2>
<div data-fsbs-bewerbung data-ansicht="formular" data-kopf="0"></div>

<h2>Schon beworben?</h2>
<div data-fsbs-bewerbung data-ansicht="stand"></div>

<script src="https://portal.fsbs-hm.de/embed.js" defer></script>
```

Das Skript darf auch mehrmals auf der Seite stehen; geladen wird es
trotzdem nur einmal.

---

## Alle Einstellungen

Alle sind freiwillig und stehen als `data-…` am Platzhalter-`div`.

| Einstellung     | Werte                        | Bedeutung                                                     |
| --------------- | ---------------------------- | ------------------------------------------------------------- |
| `data-ansicht`  | `formular`, `stand`          | Nur das eine. Ohne Angabe: beides, mit Umschalter.             |
| `data-theme`    | `light`, `dark`, `auto`      | Voreinstellung `light`. `auto` folgt dem System des Besuchers. |
| `data-kopf`     | `0`                          | Titel und Einleitung weglassen.                               |
| `data-karte`    | `1`                          | Den Kasten des Portals behalten (Rahmen, Schatten, Polster).   |
| `data-hoehe`    | Zahl, z. B. `700`            | Höhe in Pixeln, bis die erste Meldung von drinnen eintrifft.   |
| `data-basis`    | Adresse                      | Ein anderes Portal, zum Ausprobieren.                          |

Beispiel mit allem:

```html
<div data-fsbs-bewerbung
     data-ansicht="formular"
     data-theme="auto"
     data-kopf="0"
     data-hoehe="800"></div>
<script src="https://portal.fsbs-hm.de/embed.js" defer></script>
```

---

## Der Link aus der Bestätigungsmail

Steht in der Adresse der WordPress-Seite ein `?code=`, reicht `embed.js`
ihn weiter, und der Stand steht sofort da:

```
https://fsbs-hm.de/bewerbung-status/?code=ABC12
```

So kann in der Mail an den Bewerber statt des Portals die eigene Seite
verlinkt werden. Voraussetzung ist ein Platzhalter mit `data-ansicht="stand"`
(oder ohne `data-ansicht`) auf dieser Seite.

---

## Wenn WordPress das `<script>` herausfiltert

Manche Rollen dürfen kein JavaScript einsetzen, und manche Baukästen
räumen `<script>` aus dem HTML-Block. Dann geht es auch ohne — nur mit
fester Höhe, denn ohne das Skript weiß draußen niemand, wie hoch der
Inhalt gerade ist:

```html
<iframe src="https://portal.fsbs-hm.de/bewerbung?embed=1&kopf=0"
        title="Bewerbung bei der Fachschaft Business School"
        style="width:100%;height:1400px;border:0;display:block"
        loading="lazy"
        allow="clipboard-write"></iframe>
```

Der Rahmen bekommt in diesem Fall seine eigene Bildlaufleiste, damit
nichts abgeschnitten bleibt, wenn die Höhe nicht passt. Für die Abfrage
allein reichen etwa 400 px:

```html
<iframe src="https://portal.fsbs-hm.de/bewerbung?embed=1&view=stand"
        title="Stand der Bewerbung"
        style="width:100%;height:420px;border:0;display:block"
        loading="lazy"></iframe>
```

Die Parameter in der Adresse heißen wie die `data-…` oben, nur ohne
Vorsilbe: `embed=1`, `view=formular|stand`, `theme=light|dark|auto`,
`kopf=0`, `karte=1`, `code=ABC12`.

---

## Baukästen

**Gutenberg (Standard-Editor)** — Block „Benutzerdefiniertes HTML“.

**Klassischer Editor** — Reiter „Text“ (nicht „Visuell“), dann einfügen.
Im Reiter „Visuell“ zerlegt WordPress den Code.

**Elementor** — Widget „HTML“.

**Divi** — Modul „Code“.

**WPBakery** — Element „Raw HTML“.

---

## Was noch zu beachten ist

**Cookie-Banner.** Werkzeuge wie Borlabs Cookie oder Complianz halten
fremde iframes zurück, bis jemand zustimmt. Dann steht statt des
Formulars ein grauer Kasten. In der Regel lässt sich `portal.fsbs-hm.de`
dort als „technisch notwendig“ oder als Ausnahme eintragen — was auch
sachlich stimmt: Das Formular setzt keine Cookies und verfolgt niemanden.

**Content-Security-Policy.** Hat die WordPress-Seite eine CSP (manche
Sicherheits-Plugins setzen eine), muss `frame-src` `portal.fsbs-hm.de`
erlauben, sonst bleibt der Rahmen leer.

**Das Captcha.** Im Cloudflare-Dashboard ist als Domain
`portal.fsbs-hm.de` einzutragen — **nicht** die WordPress-Domain. Die
Prüfung läuft im iframe und damit unter der Adresse des Portals. Wie das
eingerichtet wird, steht in [captcha-einrichten.md](captcha-einrichten.md).

**HTTPS.** Die WordPress-Seite muss über `https://` laufen. Eine
`http://`-Seite darf keinen `https://`-Rahmen einbinden, ohne dass der
Browser meckert.

**Die alte Adresse bleibt.** `portal.fsbs-hm.de/bewerbung` funktioniert
unverändert weiter — Links, die schon irgendwo stehen, laufen nicht ins
Leere.

---

## Wenn etwas nicht stimmt

**Der Rahmen bleibt leer.** Meist der Cookie-Banner oder eine CSP, siehe
oben. In den Entwicklerwerkzeugen des Browsers (F12, Reiter „Konsole“)
steht dann eine Meldung dazu.

**Der Rahmen bleibt bei 620 px stehen und schneidet ab.** Dann kommt die
Höhenmeldung nicht an — vermutlich wurde das `<script src=…embed.js>`
vom Editor entfernt. Im Quelltext der fertigen Seite nachsehen, ob es
noch da steht; sonst den Weg ohne Skript nehmen.

**Das Formular steht doppelt.** Der Platzhalter wurde zweimal eingefügt.
`embed.js` baut in jeden gefundenen `[data-fsbs-bewerbung]` einen Rahmen.

**Die Farben passen nicht zur Seite.** `data-theme="dark"` oder
`data-theme="light"` fest einstellen, statt `auto`.

**Es sieht aus wie ein Aufkleber.** Dann steht vermutlich `data-karte="1"`
dabei — ohne diese Angabe legt das Formular seinen eigenen Kasten ab und
übernimmt den Hintergrund der WordPress-Seite.
