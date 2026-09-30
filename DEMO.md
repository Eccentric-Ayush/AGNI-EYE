# AGNI-EYE — Demo Video Script (3 speakers, ~4 minutes)

**Project:** AGNI-EYE · Smart India Hackathon 2026 · Problem SIH26162 (NTRO)
**One-line pitch:** *Satellites show us where it is hot. AGNI-EYE tells us **why** — and which heat is **not normal**.*

---

## 0. How to use this file

- **Person 1 = The Storyteller** (problem and idea). Speaks on the intro and the closing line.
- **Person 2 = The Driver** (live demo). Speaks while clicking the app.
- **Person 3 = The Explainer** (how it works, trust, impact).
- Replace every **[ ]** with the real number from your screen on the day you record. **Never say a number you did not see on screen.**
- Speak slowly. Short sentences. Smile. Pause one second after each key line.
- Total length: about **4 minutes** (about 600 words spoken). Keep it under 5.

---

## 1. Before you record (checklist)

Do these in order. Do not skip.

1. `npm run ingest -- --days 30` — fresh data for the last 30 days.
2. `npm run build:industrial` — wait until it finishes **all** chunks (the app shows a warning if the facility layer is partial; do not record with a partial layer).
3. `npm run build:snapshot` — builds the classified data.
4. **Validation:** `data/validation/sites.json` has 6 documented sites (public records, not imagery). Add your own imagery-checked sites if you can (crop burning, forest fire and industrial-anomaly cases are missing), then run `npm run evaluate`. **Do not invent accuracy.**
5. `npm run dev` and open `http://localhost:3000` in **Chrome, full screen, 1920×1080, zoom 100%**.
6. Check the top bar. It must say **LIVE** (data under 12 hours old) or **ARCHIVED** with a date. Say exactly what it says.
7. **Choose your four example points now** and write them here so nobody hunts on camera:

| Example | What to look for | Location (write it) |
|---|---|---|
| A. Routine industrial heat | class *Persistent industrial source*, high confidence | |
| B. Non-routine industrial heat | first item in the **Triage queue** | |
| C. Crop burning | class *Agricultural burn* (cropland reason) | |
| D. Forest/vegetation fire | class *Vegetation / forest fire* | |

8. Fill in the numbers from the headline strip:

| Number | Value |
|---|---|
| Raw hotspots (shown as "Raw hotspots · last 24 h") | [ ] |
| Classified (say the number; do **not** quote the "% got a label" line unless the industrial layer is complete) | [ ] |
| Needs attention | [ ] |
| Persistent sources in the register | [ ] |
| Days of history used | 30 |
| Validation (read from the Validation tab): sites / exact-class match / industrial-vs-other | [ ] / [ ] / [ ] |

9. Close chat apps and notifications. Do one full practice run with a timer.

---

## 2. The script

### Scene 1 — The hook · 0:00–0:25 · **Person 1** · *Screen: a simple title slide, or the raw India map*

> "Every day, satellites see thousands of hot spots over India.
> On a map, they all look the same — the same little dot.
>
> But a flame at a refinery that burns every night is normal.
> A **new** fire at that same refinery might be an accident.
>
> Today's tools cannot tell the difference. So analysts get flooded — and real danger can hide in the noise."

*Pause. Look at the camera.*

### Scene 2 — The problem and our answer · 0:25–0:55 · **Person 1** · *Screen: slide with the problem statement ID*

> "This is Smart India Hackathon problem **SIH26162**, from **NTRO**.
> It asks for a system that can **tell industrial fires apart from forest fires and other fires** — and show the result on a map.
>
> We built **AGNI-EYE**.
>
> It does not just show dots. It gives every hot spot a **name** — and the **reason** for that name.
> Let me hand over to [Person 2] to show you."

### Scene 3 — What analysts see today (raw view) · 0:55–1:20 · **Person 2** · *Screen: AGNI-EYE, map mode **Raw (before)***

*Action:* Open the app. Show the India map. Point at the top bar badge. In the left panel, under **Map mode**, click **Raw (before)**.

> "This is AGNI-EYE. It is focused on India. The badge here says **[LIVE / ARCHIVED — read it]**, so you always know how fresh the data is.
>
> This is what analysts see today. **[Raw hotspots] dots.** Same colour. Same shape.
> Which ones matter? You cannot tell."

### Scene 4 — The big change (classified view) · 1:20–1:50 · **Person 2** · *Screen: switch to **Classified (after)***

*Action:* Click **Classified (after)**. Move the mouse along the three boxes at the top (Raw → Classified → Needs attention).

> "Now watch. One click — and every dot gets a **class**.
> Each class has its own **colour and shape**, so it also works for colour-blind people.
>
> Look at this strip: **[raw] hotspots**, **[classified]** classified, and only **[needs attention]** need attention.
> Thousands of dots became a short list."

### Scene 5 — Four examples, with proof · 1:50–2:45 · **Person 2** · *Screen: click each example on the map; the right-hand card switches to the **Evidence** tab*

*For each example: click the dot (the cursor turns into a hand over a hotspot), let the panel open, read only the top two or three lines under **Why this label**. For example B, click the first card in **Triage** instead.*

**A. Routine industrial heat**
> "This one is an **industrial source that burns every day**. See the reasons: it is **[distance] metres from [facility type]**, and it was seen on **[X] of the last 30 days**. That is normal for this site. So it is **not** an alarm."

**B. Non-routine industrial heat**
> "This one is different. It is at an industrial site — but it is **new**, or **much stronger than usual**. The system says **why**: [read the first two reasons]. This goes to the top of the **Triage queue**."

**C. Crop burning**
> "This is **crop burning**. The land here is **farmland**, there is **no factory nearby**, and the fire is small. Different problem, different team."

**D. Forest fire**
> "And this is a **vegetation fire** — **tree cover**, no industry. A forest officer needs this, not an industrial safety team."

> "Every label comes with its **reasons**. Nothing is a black box."

### Scene 6 — From alert to action · 2:45–3:05 · **Person 2** · *Screen: Triage queue → Register tab → Export*

*Action:* Click the **Triage** tab on the right, press **Acknowledge** on one card. Scroll down to the **Register** tab and click **Export GeoJSON**. (Acknowledge is saved in this browser only for now — do not say it is shared with a team.)

> "The **Triage queue** ranks what is not routine. One click to acknowledge.
> The **Register** lists **persistent heat sources** — **[number]** of them — with how many days each was active.
> And one click exports the data as **GeoJSON**, ready for any GIS tool. That is our map-overlay and data output."

*(Optional, 5 seconds: show the exported file opened in QGIS.)*

### Scene 7 — How it works · 3:05–3:40 · **Person 3** · *Screen: simple pipeline slide (4 boxes)*

> "Let me explain how it works. Four steps.
>
> **One — Collect.** Every day we take NASA satellite fire detections over India. We keep **30 days of history**.
>
> **Two — Add context.** We add **OpenStreetMap** — where refineries, steel plants, power plants and mines are — and **ESA WorldCover**, which tells us if the land is forest, farm or city.
>
> **Three — Compare with itself.** We check each place against **its own past**. A flare that burns every day is normal for that site. A sudden jump is not.
>
> **Four — Decide and explain.** Clear rules score the evidence, give a class, a confidence level, and the reasons.
>
> We use **simple, transparent rules on purpose**. Analysts can read and check every decision. Machine learning is our next step, once we have enough verified examples."

### Scene 8 — Can you trust it? · 3:40–4:05 · **Person 3** · *Screen: **Validation** tab*

**Version A — with the small test we already have (re-run `npm run evaluate` and read the numbers off the Validation tab; the figures below were true on 30 Sep 2026 and must be re-checked):**
> "We ran a small first test on **[6]** well-known sites, using **public records** — for example steel plants, refineries and the Jharia coal-fire area.
> The system separated **industrial from non-industrial** correctly on **[5 of 6]**. On the exact class it matched **[3 of 6]**.
> We show the misses on screen. One steel plant was missed because OpenStreetMap only has it as a single point, so its hot furnaces sit outside our match distance. That tells us exactly what to improve.
> This is a **small, first test** — not a final accuracy score."

*Do not say "accuracy" without also saying "small test". Do not claim these sites were checked with satellite images — they were checked against public records only. Do not skip the misses: showing them makes the result believable.*

**Version B — if you re-run and have no usable validation (be honest):**
> "We do **not** claim an accuracy number yet. The app has a built-in test for **sites we verify ourselves**, and we are building that list now. We would rather show you a real number later than a big number today."

> "We also know our limits: very small fires can be missed, clouds hide some days, and a factory missing from OpenStreetMap will not be matched. The system says **'unclassified'** instead of guessing."

### Scene 9 — Impact and close · 4:05–4:25 · **Person 3**, then **Person 1** · *Screen: map with the triage queue visible*

**Person 3:**
> "For NTRO, a **short ranked list** instead of a dot dump. For disaster teams, **faster triage**. For pollution boards, a **register of repeat heat sources**. And it all runs on **free, public data**."

**Person 1 (last line — slow, look at the camera):**
> "Satellites already show us **where** it burns.
> **AGNI-EYE tells us what is burning — and what is not normal.**
> We are Team AGNI-EYE. Thank you."

---

## 3. Words to use and words to avoid

| Say | Do not say |
|---|---|
| "clear rules that score the evidence" | "AI that knows everything" |
| "30 days of history" | "real-time to the second" (data arrives hours after the satellite passes) |
| "unclassified when unsure" | "100% accurate" / any number you did not measure |
| "a short ranked list" | "it stops all false alarms" |
| "we check each place against its own past" | anything about a real-world accident unless you **verified** it |

## 4. If something goes wrong while recording

- **Map empty or badge says ARCHIVED:** say it calmly — "This is archived data from [date]; the system refreshes whenever new satellite data arrives." Do not pretend it is live.
- **Facility layer warning (partial):** stop and finish `npm run build:industrial`, then re-record.
- **An example is classified differently than you planned:** use what the app shows. Never change the script to a result the app does not give.
- **Internet drops:** the app works from saved data. Only the basemap tiles need internet; re-record if the map goes grey.

## 5. Quick answers if judges ask (keep each under 20 seconds)

- **How is this different from NASA FIRMS?** FIRMS detects heat. We add context, history and a reasoned class.
- **Why rules and not machine learning?** There are no public labelled examples. Rules are clear and checkable; we will add ML once we have verified data.
- **Is it live?** Near-live: satellite data is available a few hours after a pass. The badge always shows the data age.
- **What if a factory is not on the map?** A place that burns again and again but has no mapped facility is still listed in the Register as an **unmapped persistent source**.
- **What data do you use?** NASA satellite fire detections, OpenStreetMap, ESA WorldCover. All free and public.
