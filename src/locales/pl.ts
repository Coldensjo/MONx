// Polish. Keys are the English source strings.
//
// Polish takes four plural categories through Intl.PluralRules — `_one` (1),
// `_few` (2–4, and 22–24, 32–34 …), `_many` (0, 5–21, and most of the rest) and
// `_other` (fractions). A count-bearing key needs all four.

const pl: Record<string, string> = {};

export default pl;
