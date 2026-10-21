// Made-up recurrents, in the two forms Supersuit reads: the `**Label:**` body lines every
// recurrent carries today, and the YAML header `recurrent-md migrate` writes. Invented people,
// invented skills, invented commands.

/** Label form: every field the reader takes, one of them carrying a status note. */
export const FERNS_LABELS = `# Water the ferns

**Method:** /freedom:water-the-ferns
**Arguments:** back porch
**Cadence:** every 3 days
**Last run:** 2026-10-12
**Clock:** fern-sensor, rain-gauge
**Off switch:** FERN_NUDGE
**Unattended:** ./scripts/mist.sh --gentle
**Window:** 06:00-08:00
**Owner:** dana-reyes
**Status:** active, while the heat lasts

The ferns on the back porch dry out after three days of sun.

## What good looks like

Green fronds, and soil damp an inch down.

## What would make this a failure

Brown tips in October.
`;

/** The same recurrent after migrate: one copy of each fact, in the header; the prose unchanged. */
export const FERNS_HEADER = `---
kind: recurrent
standard: "https://hypercontext.wiki/standards/recurrent/v1"
method: "/freedom:water-the-ferns"
arguments: "back porch"
cadence: "every 3 days"
last_run: 2026-10-12
clock: ["fern-sensor", "rain-gauge"]
off_switch: FERN_NUDGE
unattended: "./scripts/mist.sh --gentle"
window: "06:00-08:00"
owner: dana-reyes
status: active
status_note: "while the heat lasts"
---
# Water the ferns

The ferns on the back porch dry out after three days of sun.

## What good looks like

Green fronds, and soil damp an inch down.

## What would make this a failure

Brown tips in October.
`;

/** Label form: words as the method, named times instead of a cadence, never run, paused. */
export const CALL_LABELS = `# Call Nai Nai

**Method:** call Nai Nai and ask how the tomatoes are doing
**At:** 13:00, weekdays 18:30
**Last run:** never
**Unattended:** yes
**Status:** paused

She likes the call before dinner.
`;

export const CALL_HEADER = `---
kind: recurrent
standard: "https://hypercontext.wiki/standards/recurrent/v1"
method: "call Nai Nai and ask how the tomatoes are doing"
at: "13:00, weekdays 18:30"
last_run: never
unattended: "yes"
status: paused
---
# Call Nai Nai

She likes the call before dinner.
`;
