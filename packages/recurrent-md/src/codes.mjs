// Every finding `recurrent-md lint` can report: its level, what it means and how to fix it.
// This is the lint's own table. checkRecurrent takes each finding's level from here, so a level
// cannot drift from what the table says, and standards/recurrent/v1.json publishes the same table,
// which test/manifest.test.mjs proves.

/** @type {Record<string, {level: 'error'|'warn', means: string, fix: string}>} */
export const CODES = {
  'self-doc:missing': { level: 'error', means: 'the record names no standard, the bare unversioned recurrent URL written before versions, or another kind\'s standard', fix: 'recurrent-md migrate <dir> --apply adds or upgrades it; a record naming another kind\'s standard is not a recurrent, so move or fix it by hand' },
  'self-doc:version': { level: 'error', means: 'the record names a version of the recurrent standard this validator does not implement', fix: 'install the recurrent-md version that implements it, or rewrite the record to https://hypercontext.wiki/standards/recurrent/v1' },
  'kind:missing': { level: 'error', means: 'kind is missing or is not "recurrent"', fix: 'recurrent-md migrate <dir> --apply sets kind: recurrent; a record of another kind is not a recurrent, so move or fix it by hand' },
  'labels:legacy': { level: 'warn', means: 'the record still keeps fields as **Label:** lines in its body, which Supersuit reads only when its header lacks the key', fix: 'recurrent-md migrate <dir> --apply moves them into the header and out of the body' },
  'method:missing': { level: 'error', means: 'there is no Method, so nothing runs: neither a superskill, nor words, nor an unattended command', fix: 'write the superskill as /namespace:skill, or the words themselves, as method' },
  'cadence:missing': { level: 'error', means: 'there is no Cadence and no At times, so nothing can say when it is due', fix: 'set cadence (hourly, every 6 hours, twice daily, daily, every 3 days, weekly, every 2 weeks, monthly), or at for named times' },
  'cadence:value': { level: 'error', means: 'the cadence is not one Supersuit can count, so it can never say how overdue the recurrent is', fix: 'use hourly, every N hours, twice daily, daily, every N days, weekly, every N weeks, fortnightly, monthly or quarterly' },
  'status:value': { level: 'error', means: 'status is not active or paused, the only words Supersuit writes for a recurrent', fix: 'set status to active or paused; pause a recurrent rather than retiring it, so its history stays' },
  'last_run:value': { level: 'error', means: 'last_run is not a real date written YYYY-MM-DD, or never', fix: 'set last_run to never, or leave it for the run to write' },
};
