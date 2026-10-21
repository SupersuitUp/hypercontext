# @supersuit/hypercontext-core

*This package lives in the [hypercontext repository](https://github.com/SupersuitUp/hypercontext/tree/main/packages/core), with every record standard that uses it.*

What every hypercontext record package shares, in one copy: the YAML header codec, the rule that a record names the version of the standard it follows, and the validator for a standard's manifest. friend-md, group-md, self-md, superprojects, transcript-md, piece-md, superobjective and hypercontext are built on it, and you only need it directly if you are writing a record package of your own.

```sh
npm install @supersuit/hypercontext-core
```

## The header codec

```js
import { readHeader, writeHeader, placeKey } from '@supersuit/hypercontext-core';

const { data, body, raw } = readHeader(text);       // every scalar reads as a string
const next = writeHeader(text, { status: 'done' });  // only `status` changes, every other byte kept
const stamped = placeKey(text, 'standard', url, 'kind'); // a new key, directly after `kind:`
```

The subset is what records use: scalars, quoted strings, flow lists, block lists, one-line flow maps and block lists of them. Two promises: it never throws on a header it does not understand (an unknown shape reads as a string and is carried through a write untouched), and a write changes only the keys it was asked to change. `null` removes a key.

`readFlatHeader(text)` is the forgiving reader self-md uses: it returns the data object directly, turns `true`/`false` into booleans, and joins folded values.

## Versioned standards

```js
import { standardUrl, versionOf, classifyStandard, stampStandard, bareStandard } from '@supersuit/hypercontext-core';

standardUrl('friend', 1);                 // https://hypercontext.wiki/standards/friend/v1
versionOf('friend', record.standard);     // 1, 0 for the bare URL, null for anything else
classifyStandard('friend', value, [1]);   // {state: missing|bare|current|implemented|unimplemented|other, version}
stampStandard(text, standardUrl('friend', 1), bareStandard('friend')); // {text, changed, reason?}
```

`stampStandard` adds `standard:` after `kind:` (first when there is none), fills an empty key in place, and upgrades the kind's bare URL. It leaves another kind's URL or another version for a person, and never gives a file with no header one.

## Manifests

```js
import { validateManifest } from '@supersuit/hypercontext-core';

const { ok, problems } = validateManifest(JSON.parse(readFileSync('standards/friend/v1.json', 'utf8')));
```

Checks the shape in [STANDARDS.md section 2](https://github.com/SupersuitUp/hypercontext/blob/main/packages/hypercontext/docs/STANDARDS.md): `manifest_version`, a `standard` that agrees with `kind` and `version`, `latest`, `title`, `status` and `superseded_by`, `record`, `header.required` and `header.keys` (constraints a reader can check without a package, with JSON Schema's meaning), `validator` or, when it is null, `checked_by`, every code with its `level`, `means` and `fix`, and `umbrella`.

## License

MIT
