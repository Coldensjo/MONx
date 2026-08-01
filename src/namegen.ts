// The name generator, vendored from https://github.com/Coldensjo/TibiaNameGen
// (`random_name_generator.js`, "Random Name Generator by Siz"). The word tables
// below are that file's, verbatim; everything under them has been adapted, for
// four reasons that are all the same reason — it named *characters*, and this
// names monsters:
//
//  - The DOM layer is gone. No jQuery, no `#character_name`, no `checkName()`:
//    `generateName` returns a string and the caller decides what to do with it.
//  - `Math.random()` is replaced by an injected `rng`, so the wizard's seed
//    reproduces the name along with everything else it draws.
//  - The 15-character cap was a character-name limit. Monsters are routinely
//    longer — "demon skeleton", "hellfire fighter" — so the default is 30.
//  - The blocked list was mostly staff-impersonation ("admin", "gm", "god"),
//    which means nothing for a monster, and it matched on bare substrings —
//    "nig" rejects "Night Stalker", "god" rejects "Godslayer". What is left is
//    matched on word boundaries, plus a short substring list for the slurs that
//    must not survive into a user's server data whatever they are embedded in.
//
// `corpusName` is MONx's own and has no upstream: it draws from the names the
// open corpus already uses, which is what keeps a themed server on theme.

/** Trim and de-duplicate a word table. */
function uniq(a: string[]): string[] {
	return Array.from(new Set(a.map(s => String(s).trim())));
}

const adjectives: string[] = uniq([
	"abandoned", "able", "abrasive", "absolute", "absurd", "abyssal", "academic", "acceptable",
	"acclaimed", "accomplished", "accurate", "aching", "acidic", "acrobatic", "active", "actual",
	"adamant", "adept", "admirable", "admired", "adolescent", "adorable", "adored", "advanced",
	"adventurous", "affable", "affectionate", "afraid", "aged", "aggravating", "aggressive", "agile",
	"agitated", "agonizing", "agreeable", "ajar", "alarmed", "alarming", "alert", "alienated",
	"alive", "all", "altruistic", "amazing", "ambitious", "amiable", "ample", "amused",
	"amusing", "anchored", "ancient", "angelic", "angry", "anguished", "animated", "annual",
	"another", "antique", "anxious", "any", "apprehensive", "appropriate", "apt", "arcane",
	"arctic", "ardent", "arid", "aromatic", "artistic", "ashamed", "assured", "astonishing",
	"astral", "athletic", "attached", "attentive", "attractive", "audacious", "austere", "authentic",
	"authorized", "automatic", "avaricious", "average", "aware", "awesome", "awful", "awkward",
	"babyish", "back", "bad", "baggy", "baleful", "bare", "barren", "basic",
	"beautiful", "belated", "beloved", "beneficial", "best", "better", "bewitched", "big",
	"biodegradable", "bitter", "black", "bland", "blank", "blaring", "blazing", "bleak",
	"blighted", "blind", "blissful", "blond", "blue", "blushing", "bogus", "boiling",
	"bold", "bony", "boring", "bossy", "both", "bouncy", "boundless", "bountiful",
	"bowed", "brave", "breakable", "brief", "bright", "brilliant", "brisk", "broken",
	"bronze", "brooding", "brown", "bruised", "bubbly", "bulky", "bumpy", "buoyant",
	"burdensome", "burly", "bustling", "busy", "buttery", "buzzing", "calculating", "calm",
	"candid", "canine", "capital", "carefree", "careful", "careless", "caring", "cautious",
	"cavernous", "celebrated", "celestial", "charming", "cheap", "cheerful", "cheery", "chief",
	"chilly", "chubby", "circular", "classic", "clean", "clear", "clever", "close",
	"closed", "cloudy", "clueless", "clumsy", "cluttered", "coarse", "cold", "colorful",
	"colorless", "colossal", "comfortable", "common", "compassionate", "competent", "complete", "complex",
	"complicated", "composed", "concerned", "concrete", "confused", "conscious", "considerate", "constant",
	"content", "conventional", "cooked", "cool", "cooperative", "coordinated", "corny", "corrupt",
	"cosmic", "costly", "courageous", "courteous", "crafty", "crazy", "creamy", "creative",
	"creepy", "criminal", "crisp", "critical", "crooked", "crowded", "cruel", "crushing",
	"cuddly", "cultivated", "cultured", "cumbersome", "cunning", "curly", "cursed", "curvy",
	"cute", "cylindrical", "damaged", "damp", "dangerous", "dapper", "daring", "dark",
	"darling", "dauntless", "dazzling", "dead", "deadly", "deafening", "dear", "dearest",
	"decent", "decimal", "decisive", "deep", "defenseless", "defensive", "defiant", "deficient",
	"definite", "definitive", "delayed", "delectable", "delicious", "delightful", "delirious", "demanding",
	"dense", "dental", "dependable", "dependent", "deranged", "descriptive", "deserted", "detailed",
	"determined", "devoted", "different", "difficult", "digital", "diligent", "dim", "dimpled",
	"dimwitted", "direct", "dirty", "disastrous", "discrete", "disfigured", "disguised", "disgusting",
	"dishonest", "disloyal", "dismal", "distant", "distinct", "distorted", "dizzy", "doomed",
	"dopey", "doting", "double", "downright", "drab", "drafty", "dramatic", "dreadful",
	"dreary", "droopy", "dry", "dual", "dull", "dusky", "dutiful", "each",
	"eager", "early", "earnest", "easy", "ecstatic", "edible", "educated", "eerie",
	"elaborate", "elastic", "elated", "elderly", "electric", "elegant", "elementary", "elliptical",
	"embarrassed", "embellished", "emerald", "eminent", "emotional", "empty", "enchanted", "enchanting",
	"energetic", "enlightened", "enormous", "enraged", "entire", "envious", "equal", "equatorial",
	"essential", "esteemed", "ethereal", "ethical", "euphoric", "even", "evergreen", "everlasting",
	"every", "evil", "exalted", "excellent", "excitable", "excited", "exciting", "exemplary",
	"exhausted", "exotic", "expensive", "experienced", "expert", "extraneous", "extroverted", "fabled",
	"fabulous", "failing", "faint", "fair", "faithful", "fake", "false", "familiar",
	"famous", "fancy", "fantastic", "far", "faraway", "fast", "fat", "fatal",
	"fatherly", "favorable", "favorite", "fearful", "fearless", "fearsome", "feisty", "feline",
	"female", "feminine", "ferocious", "few", "fickle", "fiendish", "filthy", "fine",
	"finished", "firm", "first", "firsthand", "fitting", "fixed", "flaky", "flamboyant",
	"flashy", "flat", "flawed", "flawless", "flickering", "flimsy", "flippant", "flowery",
	"fluffy", "fluid", "flustered", "focused", "fond", "foolhardy", "foolish", "forceful",
	"forked", "forlorn", "formal", "forsaken", "forthright", "fortunate", "fragrant", "frail",
	"frank", "frayed", "free", "french", "frenzied", "frequent", "fresh", "friendly",
	"frightened", "frightening", "frigid", "frilly", "frivolous", "frizzy", "front", "frosty",
	"frozen", "frugal", "fruitful", "full", "fumbling", "functional", "funny", "fussy",
	"fuzzy", "gallant", "gargantuan", "gaseous", "general", "generous", "gentle", "genuine",
	"ghastly", "giant", "giddy", "gifted", "gigantic", "gilded", "giving", "glamorous",
	"glaring", "glass", "gleaming", "gleeful", "glistening", "glittering", "gloomy", "glorious",
	"glossy", "glum", "golden", "good", "gorgeous", "graceful", "gracious", "grand",
	"grandiose", "granular", "grateful", "grave", "gray", "great", "greedy", "green",
	"gregarious", "grievous", "grim", "grimy", "gripping", "grizzled", "gross", "grotesque",
	"grouchy", "grounded", "growing", "growling", "grown", "grubby", "gruesome", "grumpy",
	"guilty", "gullible", "gummy", "hairy", "half", "hallowed", "handmade", "handsome",
	"handy", "happy", "hard", "hardy", "harmful", "harmless", "harmonious", "harrowing",
	"harsh", "hasty", "hateful", "haunted", "haunting", "healthy", "heartfelt", "hearty",
	"heavenly", "heavy", "hefty", "helpful", "helpless", "hidden", "hideous", "high",
	"hilarious", "hoarse", "hollow", "homely", "honest", "honorable", "honored", "hopeful",
	"horrible", "hospitable", "hot", "huge", "humble", "humiliating", "humming", "humongous",
	"hungry", "hurtful", "husky", "icky", "icy", "ideal", "idealistic", "identical",
	"idiotic", "idle", "idolized", "ignorant", "ill", "illegal", "illiterate", "illustrious",
	"imaginary", "imaginative", "immaculate", "immaterial", "immediate", "immense", "immortal", "impartial",
	"impassioned", "impeccable", "imperfect", "imperturbable", "impish", "impolite", "important", "impossible",
	"impractical", "impressionable", "impressive", "improbable", "impure", "inborn", "incomparable", "incompatible",
	"incomplete", "inconsequential", "incredible", "indelible", "indolent", "indomitable", "inexperienced", "infamous",
	"infantile", "infatuated", "inferior", "infernal", "infinite", "informal", "innocent", "insecure",
	"insidious", "insignificant", "insistent", "instructive", "insubstantial", "intelligent", "intent", "intentional",
	"interesting", "internal", "international", "intrepid", "ironclad", "irresponsible", "irritating", "itchy",
	"jaded", "jagged", "jaunty", "jealous", "jittery", "joint", "jolly", "jovial",
	"joyful", "joyous", "jubilant", "judicious", "juicy", "jumbo", "jumpy", "junior",
	"juvenile", "kaleidoscopic", "keen", "key", "kind", "kindhearted", "kindly", "klutzy",
	"knobby", "knotty", "knowing", "knowledgeable", "known", "kooky", "kosher", "lame",
	"lanky", "large", "last", "lasting", "late", "lavish", "lawful", "lazy",
	"leading", "leafy", "lean", "left", "legal", "legitimate", "lethal", "light",
	"lighthearted", "likable", "likely", "limited", "limp", "limping", "linear", "lined",
	"liquid", "little", "live", "lively", "livid", "loathsome", "lone", "lonely",
	"long", "loose", "lopsided", "lost", "loud", "lovable", "lovely", "loving",
	"low", "loyal", "lucky", "lumbering", "luminescent", "luminous", "lumpy", "lurking",
	"lustrous", "luxurious", "macabre", "mad", "magnificent", "majestic", "major", "male",
	"mammoth", "married", "marvelous", "masculine", "massive", "mature", "meager", "mealy",
	"mean", "measly", "meaty", "medical", "mediocre", "medium", "meek", "mellow",
	"melodic", "memorable", "menacing", "merciless", "merry", "messy", "metallic", "mighty",
	"mild", "milky", "mindless", "miniature", "minor", "minty", "miserable", "miserly",
	"misguided", "misty", "mixed", "modern", "modest", "moist", "molten", "monstrous",
	"monthly", "monumental", "moral", "mortified", "motherly", "motionless", "mountainous", "muddy",
	"muffled", "multicolored", "mundane", "murky", "mushy", "musty", "muted", "mysterious",
	"mythic", "naive", "narrow", "nasty", "natural", "naughty", "nautical", "near",
	"neat", "necessary", "needy", "nefarious", "negative", "neglected", "negligible", "neighboring",
	"nervous", "new", "next", "nice", "nifty", "nimble", "nippy", "noble",
	"nocturnal", "noisy", "nonstop", "normal", "notable", "noted", "noteworthy", "novel",
	"noxious", "numb", "nutritious", "nutty", "obedient", "obese", "oblong", "obsidian",
	"obvious", "occasional", "odd", "oddball", "offbeat", "offensive", "official", "oily",
	"old", "ominous", "only", "open", "optimal", "optimistic", "opulent", "orange",
	"orderly", "ordinary", "organic", "original", "ornate", "ornery", "other", "our",
	"outgoing", "outlandish", "outlying", "outrageous", "outstanding", "oval", "overcooked", "overdue",
	"overjoyed", "overlooked", "palatable", "pale", "paltry", "parallel", "parched", "partial",
	"passionate", "past", "pastel", "peaceful", "peppery", "perfect", "perfumed", "periodic",
	"perky", "personal", "pertinent", "pesky", "pessimistic", "petty", "phantom", "phony",
	"physical", "piercing", "pink", "pitiful", "plain", "plaintive", "plastic", "playful",
	"pleasant", "pleased", "pleasing", "plump", "plush", "pointed", "pointless", "poised",
	"polished", "polite", "political", "poor", "popular", "portly", "posh", "positive",
	"possible", "potable", "powerful", "powerless", "practical", "precious", "present", "prestigious",
	"pretty", "previous", "pricey", "prickly", "primal", "primary", "prime", "pristine",
	"private", "prize", "probable", "productive", "profitable", "profuse", "proper", "proud",
	"prudent", "punctual", "pungent", "puny", "pure", "purple", "pushy", "putrid",
	"puzzled", "puzzling", "quaint", "qualified", "quarrelsome", "quarterly", "queasy", "querulous",
	"questionable", "quick", "quiet", "quintessential", "quirky", "quixotic", "quizzical", "radiant",
	"ragged", "rampant", "rapid", "rare", "rash", "ravenous", "raw", "ready",
	"real", "realistic", "reasonable", "recent", "reckless", "rectangular", "red", "reflecting",
	"regal", "regular", "relentless", "reliable", "relieved", "remarkable", "remorseful", "remote",
	"repentant", "repulsive", "required", "respectful", "responsible", "revolving", "rewarding", "rich",
	"right", "rigid", "ringed", "ripe", "roasted", "robust", "rocky", "rosy",
	"rotating", "rotten", "rough", "round", "rowdy", "royal", "rubbery", "ruddy",
	"rude", "rundown", "runny", "rural", "rusty", "sad", "safe", "salty",
	"same", "sandy", "sane", "sarcastic", "sardonic", "satisfied", "savage", "scaly",
	"scarce", "scared", "scary", "scented", "scholarly", "scientific", "scorching", "scornful",
	"scratchy", "scrawny", "second", "secondary", "secret", "selfish", "sentimental", "separate",
	"serene", "serious", "serpentine", "several", "severe", "shabby", "shadowy", "shady",
	"shallow", "shameful", "shameless", "sharp", "shimmering", "shiny", "shocked", "shocking",
	"shoddy", "short", "showy", "shrill", "shrouded", "shy", "sick", "silent",
	"silky", "silly", "silver", "similar", "simple", "simplistic", "sinful", "single",
	"sinister", "sizzling", "skeletal", "skinny", "sleepy", "slight", "slim", "slimy",
	"slippery", "slow", "slushy", "small", "smart", "smoggy", "smooth", "smug",
	"snappy", "snarling", "sneaky", "sniveling", "snoopy", "sociable", "soft", "soggy",
	"solid", "somber", "some", "sophisticated", "sore", "sorrowful", "soulful", "soupy",
	"sour", "spanish", "sparkling", "sparse", "specific", "spectacular", "spectral", "speedy",
	"spherical", "spicy", "spiffy", "spirited", "spiteful", "splendid", "spotless", "spotted",
	"spry", "square", "squeaky", "squiggly", "stable", "staid", "stained", "stale",
	"standard", "starchy", "stark", "starry", "steel", "steep", "sticky", "stiff",
	"stimulating", "stingy", "stoic", "stormy", "straight", "strange", "strict", "strident",
	"striking", "striped", "strong", "studious", "stunning", "stupendous", "stupid", "sturdy",
	"stylish", "subdued", "submissive", "substantial", "subtle", "suburban", "sudden", "sugary",
	"sunny", "super", "superb", "superficial", "superior", "supportive", "surprised", "suspicious",
	"svelte", "sweaty", "sweet", "sweltering", "swift", "sympathetic", "talkative", "tall",
	"tame", "tan", "tangible", "tart", "tasty", "tattered", "taut", "tedious",
	"teeming", "tempestuous", "tempting", "tender", "tense", "tepid", "terrible", "terrific",
	"testy", "thankful", "that", "these", "thick", "thin", "third", "thirsty",
	"this", "thorny", "thorough", "those", "thoughtful", "threadbare", "thrifty", "thunderous",
	"tidy", "tight", "timely", "tinted", "tiny", "tired", "torn", "total",
	"tough", "tragic", "trained", "traumatic", "treasured", "tremendous", "triangular", "tricky",
	"trifling", "trim", "trivial", "troubled", "true", "trusting", "trustworthy", "trusty",
	"truthful", "tubby", "turbulent", "twin", "twisted", "ugly", "ultimate", "umbral",
	"unacceptable", "unaware", "uncomfortable", "uncommon", "unconscious", "understated", "unequaled", "uneven",
	"unfinished", "unfit", "unfolded", "unfortunate", "unhappy", "unhealthy", "uniform", "unimportant",
	"unique", "united", "unkempt", "unknown", "unlawful", "unlined", "unlucky", "unnatural",
	"unpleasant", "unrealistic", "unripe", "unruly", "unselfish", "unsightly", "unsteady", "unsung",
	"untidy", "untimely", "untried", "untrue", "unused", "unusual", "unwelcome", "unwieldy",
	"unwilling", "unwitting", "unwritten", "unyielding", "upbeat", "upright", "upset", "urban",
	"usable", "used", "useful", "useless", "utilized", "utter", "vacant", "vague",
	"vain", "valid", "valorous", "valuable", "vapid", "variable", "vast", "velvety",
	"venerated", "vengeful", "venomous", "verdant", "verifiable", "vibrant", "vicious", "victorious",
	"vigilant", "vigorous", "vile", "villainous", "violent", "violet", "virtual", "virtuous",
	"visible", "vital", "vivacious", "vivid", "voluminous", "wan", "warlike", "warm",
	"warmhearted", "warped", "wary", "wasteful", "watchful", "waterlogged", "watery", "wavy",
	"weak", "wealthy", "weary", "webbed", "wee", "weekly", "weepy", "weighty",
	"weird", "welcome", "wet", "which", "whimsical", "whirlwind", "whispered", "white",
	"whole", "whopping", "wicked", "wide", "wiggly", "wild", "willing", "wilted",
	"winding", "windy", "winged", "wiry", "wise", "withering", "witty", "wobbly",
	"woeful", "wonderful", "wooden", "woozy", "wordy", "worldly", "worn", "worried",
	"worrisome", "worse", "worst", "worthless", "worthwhile", "worthy", "wrathful", "wretched",
	"writhing", "wrong", "wry", "yawning", "yearly", "yellow", "yellowish", "young",
	"youthful", "yummy", "zany", "zealous", "zesty", "zigzag"
]);

const animals: string[] = uniq([
	"aardvark", "albatross", "alligator", "alpaca", "anaconda", "ant", "anteater", "antelope",
	"ape", "armadillo", "axolotl", "baboon", "badger", "barn owl", "barracuda", "bat",
	"bear", "beaver", "bee", "beetle", "binturong", "bison", "boa", "boar",
	"bobcat", "buffalo", "butterfly", "buzzard", "caiman", "camel", "capuchin", "capybara",
	"caribou", "cassowary", "cat", "caterpillar", "cattle", "chameleon", "chamois", "cheetah",
	"chicken", "chimpanzee", "chinchilla", "chough", "clam", "coati", "cobra", "cockroach",
	"cod", "colugo", "cormorant", "cougar", "coyote", "crab", "crane", "cricket",
	"crocodile", "crow", "curlew", "deer", "dingo", "dinosaur", "dog", "dogfish",
	"dolphin", "donkey", "dotterel", "dove", "dragonfly", "duck", "dugong", "dunlin",
	"eagle", "earwig", "echidna", "eel", "egret", "eland", "elephant", "elk",
	"emu", "falcon", "ferret", "finch", "firefly", "fish", "flamingo", "fly",
	"fossa", "fox", "frog", "gaur", "gazelle", "gecko", "gerbil", "gibbon",
	"giraffe", "gnat", "gnu", "goat", "goldfinch", "goldfish", "goose", "gopher",
	"gorilla", "goshawk", "grasshopper", "grebe", "grizzly", "grouse", "guanaco", "gull",
	"gundi", "hamster", "hare", "hawk", "hedgehog", "heron", "herring", "hippopotamus",
	"hornbill", "hornet", "horse", "human", "hummingbird", "hyena", "ibex", "ibis",
	"iguana", "jackal", "jackdaw", "jackrabbit", "jaguar", "jay", "jellyfish", "jerboa",
	"kakapo", "kangaroo", "kestrel", "kingfisher", "kiwi", "koala", "kookabura", "kouprey",
	"krill", "kudu", "lapwing", "lark", "lemming", "lemur", "leopard", "lion",
	"llama", "lobster", "locust", "lorikeet", "loris", "louse", "lynx", "lyrebird",
	"macaque", "magpie", "mallard", "mamba", "manatee", "mandrill", "manta", "marmoset",
	"marmot", "marten", "meerkat", "mink", "minnow", "mole", "mongoose", "monkey",
	"moose", "mosquito", "moth", "mouse", "mule", "muntjac", "narwhal", "newt",
	"nightingale", "numbat", "ocelot", "octopus", "okapi", "opossum", "orca", "oryx",
	"osprey", "ostrich", "otter", "owl", "oyster", "panda", "pangolin", "panther",
	"parrot", "partridge", "peafowl", "peccary", "pelican", "penguin", "pheasant", "pig",
	"pigeon", "platypus", "pony", "porcupine", "porpoise", "puffin", "python", "quail",
	"quelea", "quetzal", "quokka", "quoll", "rabbit", "raccoon", "rail", "ram",
	"rat", "raven", "red deer", "red panda", "reindeer", "rhinoceros", "ringtail", "rook",
	"salamander", "salmon", "sand dollar", "sandpiper", "sardine", "scorpion", "seahorse", "seal",
	"serval", "shark", "sheep", "shrew", "skunk", "sloth", "snail", "snake",
	"sparrow", "spider", "spoonbill", "squid", "squirrel", "starling", "stingray", "stinkbug",
	"stoat", "stork", "swallow", "swan", "swift", "tamarin", "tapir", "tarsier",
	"termite", "tiger", "toad", "tortoise", "toucan", "trout", "turkey", "turtle",
	"uakari", "urchin", "vicuna", "viper", "vole", "vulture", "wallaby", "wallaroo",
	"walrus", "wasp", "weasel", "weevil", "whale", "wildcat", "wildebeest", "wolf",
	"wolverine", "wombat", "woodcock", "woodpecker", "worm", "wren", "xerus", "yabby",
	"yak", "zebra", "zebu"
]);

// Monsternames from Tibia
const monsters: string[] = uniq([
	"acolyte", "amazon", "ancient", "apocalypse", "arcanist", "archer", "ashmunrah", "assassin",
	"badger", "bandit", "banshee", "basilisk", "basin", "bat", "bazir", "bear",
	"behemoth", "beholder", "berserker", "bird", "blightwalker", "blue", "bonebeast", "braindeath",
	"broodling", "bug", "butterfly", "carniphila", "carrion", "cave", "centipede", "chakoya",
	"chicken", "cobra", "corym", "crab", "crocodile", "crypt", "cyclops", "dark",
	"deathling", "deathslicer", "deepling", "deer", "demodras", "demon", "devil", "dharalion",
	"diabolic", "dipthrah", "djinn", "dog", "dragon", "draken", "drillworm", "dwarf",
	"dworc", "ectoplasm", "efreet", "elder", "elemental", "elephant", "elf", "evil",
	"eye", "fernfang", "ferumbras", "fiend", "fire", "flamethrower", "flamingo", "fleshhunter",
	"fox", "frost", "frostflower", "fury", "gargoyle", "gazer", "general", "geomancer",
	"ghost", "ghoul", "giant", "gloom", "goblin", "golem", "gravedigger", "gravelord",
	"green", "grorlam", "guard", "halloween", "hare", "haunter", "hellhound", "hellspawn",
	"hero", "horned", "hunter", "hyaena", "hydra", "imp", "infernalist", "infernatil",
	"juggernaut", "kollos", "kongra", "lamia", "lancer", "larva", "leader", "lich",
	"lion", "lizard", "lord", "mage", "magicthrower", "mahrdis", "manticore", "marid",
	"medusa", "merlkin", "mimic", "minotaur", "monk", "morgaroth", "morguthis", "mummy",
	"murius", "necromancer", "necropharus", "nettle", "nightcrawler", "nightmare", "ogre", "old",
	"omruc", "orc", "orshabaal", "panda", "parrot", "pig", "plaguesmith", "plaguethrower",
	"poison", "polar", "priestess", "quara", "rabbit", "rahemos", "rat", "reaper",
	"revenant", "rider", "rotworm", "scarab", "scorpion", "scout", "sentinel", "serpent",
	"shade", "shadow", "shaman", "shambler", "sheep", "shredderthrower", "sibang", "skeleton",
	"skunk", "slime", "smuggler", "snake", "snakecharmer", "soldier", "soulreaper", "spawn",
	"spearman", "spider", "spit", "stalker", "stone", "swamp", "tarantula", "templar",
	"terror", "thalas", "thornback", "tiger", "troll", "undead", "valkyrie", "vampire",
	"vashresamun", "venomsniper", "vexcaster", "voodoomaster", "war", "warbringer", "warlock", "warlord",
	"warrior", "wasp", "widow", "wild", "winter", "wisp", "witch", "wolf",
	"wraith", "wyrm", "wyvern", "yeti", "zombie"
]);

// Original fantasy name lists
const firstNameParts: string[] = uniq([
	'Adall', 'Adrenius', 'Aeden', 'Aegis', 'Aelric', 'Aelwyn', 'Aeris', 'Aerith',
	'Aeron', 'Aethon', 'Ahmet', 'Aiden', 'Al Dee', 'Alaric', 'Albert', 'Aldan',
	'Alden', 'Alder', 'Aldo', 'Aldric', 'Alesar', 'Alexander', 'Alia', 'Allen',
	'Alwin', 'Alys', 'Amanda', 'Amber', 'Anerui', 'Aneus', 'Angelina', 'Angus',
	'Anselm', 'Arel', 'Arito', 'Arkhothep', 'Arnold', 'Aruda', 'Ashtamor', 'Asima',
	'Asrak', 'Avar Tar', 'Azil', 'Baal', 'Bael', 'Baelor', 'Baldric', 'Bambi',
	'Barbara', 'Bashira', 'Basilisk', 'Baxter', 'Beatrice', 'Benjamin', 'Bezil', 'Billy',
	'Birch', 'Blade', 'Blossom', 'Bluebear', 'Bonecrusher', 'Bonifacius', 'Boozer', 'Boques',
	'Borkas', 'Bozo', 'Bram', 'Bran', 'Brasith', 'Bren', 'Brengus', 'Brenna',
	'Brennan', 'Brewster', 'Briar', 'Briasol', 'Brienne', 'Brigid', 'Brodrosch', 'Bruno',
	'Bryn', 'Brynjar', 'Budrik', 'Bunny', 'Busty', 'Cade', 'Cael', 'Caelan',
	'Caelia', 'Caelum', 'Caius', 'Carina', 'Carlson', 'Caspian', 'Catelyn', 'Cedar',
	'Celeste', 'Charles', 'Chatterbone', 'Chemar', 'Chephan', 'Chester Kahs', 'Christoph', 'Chrystal',
	'Cian', 'Cipfried', 'Clark', 'Clyde', 'Cobra', 'Corbin', 'Cornelia', 'Costello',
	'Crest', 'Dabui', 'Daenerys', 'Dagomir', 'Dain', 'Dalbrect', 'Dallheim', 'Damaris',
	'Dane', 'Daniel', 'Darian', 'Dario', 'Dawn', 'Dax', 'Dell', 'Delphine',
	'Demonguard', 'Derek', 'Dermot', 'Digger', 'Dixi', 'Djema', 'Donald', 'Dorian',
	'Dove', 'Drakon', 'Duria', 'Dusk', 'Dustrunner', 'Eamon', 'Ebenizer', 'Echo',
	'Edala', 'Eddy', 'Edoch', 'Edowir', 'Edvard', 'Elane', 'Elara', 'Elathriel',
	'Elden', 'Eldric', 'Eldrin', 'Elena', 'Eloise', 'Elvith', 'Ember', 'Emeric',
	'Emperor Kruzak', 'Eremo', 'Eris', 'Eroth', 'Ethan', 'Etzel', 'Eva', 'Evan',
	'Evander', 'Faelan', 'Fahradin', 'Falk', 'Falric', 'Faluae', 'Faustina', 'Faye',
	'Fearless', 'Feizuhl', 'Felix', 'Fen', 'Fenbala', 'Fenech', 'Fenris', 'Fenwick',
	'Ferks', 'Finn', 'Fiona', 'Flame', 'Frans', 'Freyja', 'Frodo', 'Frost',
	'Gabel', 'Gage', 'Gail', 'Galadriel', 'Gale', 'Galuna', 'Gamel', 'Gamon',
	'Gareth', 'Garric', 'Gavin', 'Gleam', 'Godric', 'Gorn', 'Grace', 'Graubart',
	'Gregor', 'Grey', 'Greyhound', 'Grof', 'Gundralph', 'Gurbasch', 'Gwen', 'Gwyneth',
	'H.L.', 'Habdel', 'Hagor', 'Hairycles', 'Haldir', 'Haldor', 'Haldric', 'Hale',
	'Halif', 'Hanna', 'Hannah', 'Hardek', 'Harkath', 'Haroun', 'Harsky', 'Hayden',
	'Haze', 'Helena', 'Helor', 'Hespera', 'Hilt', 'Hofech', 'Hoggle', 'Holt',
	'Hugo', 'Humgolf', 'Humphrey', 'Hyacinth', 'Ignatius', 'Imalas', 'Imbul', 'Irea',
	'Iric', 'Iris', 'Iron', 'Ironeye', 'Isaac', 'Isadora', 'Ishebad', 'Ishina',
	'Isimov', 'Isolde', 'Ithil', 'Ivan', 'Ivor', 'Ivy', 'Iwan', 'Iwar',
	'Jace', 'Jack', 'Jade', 'Jakahr', 'James', 'Jareth', 'Jaric', 'Jasmine',
	'Jasper', 'Jax', 'Jean Claude', 'Jewel', 'Jezzara', 'Jimbin', 'Jocelyn', 'Julian',
	'Junia', 'Kade', 'Kael', 'Kaelen', 'Kai', 'Kaldric', 'Kane', 'Karl',
	'Kasmir', 'Katarina', 'Kawill', 'Kazzan', 'Kevin', 'Kieran', 'King Tibianus', 'Kira',
	'Kite', 'Knight', 'Konrad', 'Kroox', 'Kulag', 'Lance', 'Lane', 'Lea',
	'Leaf', 'Lector', 'LeeDelle', 'Leeland', 'Legola', 'Leo', 'Leontine', 'Liam',
	'Liane', 'Lightfoot', 'Lily', 'Livielle', 'Logan', 'Lokur', 'Lorbas', 'Lorek',
	'Loria', 'Loric', 'Lorien', 'Loui', 'Lubo', 'Lucian', 'Lugri', 'Luna',
	'Lungelen', 'Lynda', 'Lysander', 'Lysandra', 'Mace', 'Maealil', 'Mael', 'Maelor',
	'Maeve', 'Magnus', 'Maldric', 'Malor', 'Marcus', 'Maria', 'Markwin', 'Marlene',
	'Marvik', 'Maryza', 'Mason', 'Max', 'Maya', 'McRonald', 'Mehkesh', 'Melchior',
	'Memech', 'Mira', 'Mirabell', 'Miraia', 'Mist', 'Mordecai', 'Morgana', 'Mortimer',
	'Morun', 'Mugluf', 'Muriel', 'Muzir', 'Myra', 'Nahbob', 'Nate', 'Nathan',
	'Nelliem', 'Nemal', 'Nezil', 'Niamh', 'Nico', 'Nielson', 'Nimrod', 'Nimue',
	'Noble', 'Nolan', 'Noodles', 'Nora', 'Norbert', 'Norf', 'Noric', 'Norma',
	'Nova', 'Nydala', 'Nyssa', 'Oak', 'Obi', 'Octavia', 'Odemara', 'Odin',
	'Oldrak', 'Olivia', 'Olrik', 'Omur', 'Opal', 'Ophelia', 'Orb', 'Oric',
	'Orion', 'Ormuhn', 'Oscar', 'Osric', 'Oswald', 'Owen', 'Pace', 'Padreia',
	'Paldric', 'Partos', 'Pauline', 'Pax', 'Pearl', 'Pemaret', 'Penny', 'Perac',
	'Peregrine', 'Perod', 'Persephone', 'Petros', 'Phelan', 'Phillip', 'Pine', 'Pino',
	'Piper', 'Preston', 'Priscilla', 'Prism', 'Puffels', 'Pydar', 'Quade', 'Quaric',
	'Quartz', 'Quenby', 'Quentin', 'Quero', 'Quill', 'Quincy', 'Quinn', 'Quorin',
	'Rachel', 'Rafe', 'Rahkem', 'Rain', 'Rane', 'Rashid', 'Ratamari', 'Ray',
	'Razan', 'Rex', 'Rhaegar', 'Rhiannon', 'Riddler', 'Robin', 'Roderick', 'Rodney',
	'Rokyn', 'Romella', 'Ronan', 'Roran', 'Roric', 'Rosalind', 'Rose', 'Rowena',
	'Rowenna', 'Ruby', 'Rudolph', 'Rune', 'Ryder', 'Sage', 'Saldric', 'Sam',
	'Sandra', 'Sarina', 'Scott', 'Seagull', 'Seahorse', 'Selene', 'Seth', 'Severin',
	'Seymour', 'Shalmar', 'Shanar', 'Shauna', 'Sherry', 'Shiantis', 'Shield', 'Shiriel',
	'Shirith', 'Sigurd', 'Simon', 'Sinbeard', 'Skjaar', 'Smiley', 'Snake Eye', 'Snow',
	'Soren', 'Steelsoul', 'Stutch', 'Suzy', 'Svenson', 'Sylvester', 'Talesia', 'Talon',
	'Talphion', 'Tandros', 'Tara', 'Taric', 'Tate', 'Tesha', 'Tessa', 'Tezila',
	'Thaddeus', 'Thalia', 'Thanita', 'Theo', 'Theodora', 'Theron', 'Thomas', 'Thorin',
	'Tibra', 'Tide', 'Tim', 'Timur', 'Tobias', 'Todd', 'Tokel', 'Tom',
	'Topsy', 'Tothdral', 'Trimegis', 'Trisha', 'Tristan', 'Tulf', 'Turvy', 'Ubaid',
	'Ukea', 'Uldric', 'Ulric', 'Ulrik', 'Ulysses', 'Uma', 'Umar', 'Umber',
	'Una', 'Uri', 'Urkalio', 'Urn', 'Ursa', 'Ursula', 'Uso', 'Ustan',
	'Uzgod', 'Uzon', 'Vaelen', 'Valdis', 'Vale', 'Vance', 'Varek', 'Varic',
	'Velvet', 'Vera', 'Verena', 'Vex', 'Vial', 'Victor', 'Violet', 'Vivienne',
	'Vladruc', 'Wade', 'Waldric', 'Wally', 'Walter', 'Wand', 'Warbert', 'Wave',
	'Wendeline', 'Wes', 'Weston', 'Willard', 'William', 'Willie', 'Willow', 'Winona',
	'Wren', 'Wulfgar', 'Wulfric', 'Wyat', 'Wyda', 'Wystan', 'Xander', 'Xanthe',
	'Xara', 'Xaric', 'Xavi', 'Xavier', 'Xed', 'Xenith', 'Xenon', 'Xodet',
	'Xylo', 'Yaman', 'Yan', 'Yanni', 'Yara', 'Yarin', 'Yberius', 'Yelena',
	'Yoem', 'Yoke', 'Yorin', 'Yseult', 'Yulas', 'Yves', 'Zachary', 'Zaidal',
	'Zaldric', 'Zane', 'Zara', 'Zebron', 'Zed', 'Zephyr', 'Zephyrine', 'Zerbrus',
	'Zest', 'Zoe', 'Zoltan'
]);

const lastNameParts: string[] = uniq([
	'Account', 'Adamant', 'Agate', 'Alchemist', 'Amber', 'Amulet', 'Ancient', 'Annals',
	'Apex', 'Aqua', 'Archer', 'Armor', 'Arrow', 'Ash', 'Ashenheart', 'Ashforge',
	'Astute', 'Atoll', 'Avenue', 'Axe', 'Bank', 'Banner', 'Barony', 'Barracks',
	'Bastion', 'Bay', 'Beach', 'Bear', 'Beautiful', 'Bee', 'Blackbriar', 'Blackwood',
	'Blaze', 'Blessed', 'Bloom', 'Blue', 'Bluff', 'Bold', 'Bone', 'Book',
	'Boot', 'Bow', 'Bracer', 'Branch', 'Brass', 'Brave', 'Breeze', 'Bridge',
	'Bright', 'Brightblade', 'Brilliant', 'Brisk', 'Bronze', 'Brook', 'Brotherhood', 'Brow',
	'Brown', 'Calm', 'Campaign', 'Cardinal', 'Castle', 'Cathedral', 'Cave', 'Cavern',
	'Cedar', 'Champion', 'Chapel', 'Charm', 'Chestplate', 'Chronicle', 'Cinder', 'Circlet',
	'City', 'Claw', 'Clay', 'Clear', 'Clever', 'Cliff', 'Cloister', 'Cloud',
	'Coal', 'Coat', 'Codex', 'Cognizant', 'Coldforge', 'Company', 'Compass', 'Compassionate',
	'Conquering', 'Copper', 'Coronet', 'Courage', 'Cove', 'Crafty', 'Crag', 'Cranny',
	'Crest', 'Crown', 'Crusade', 'Crusader', 'Crystal', 'Curious', 'Current', 'Dagger',
	'Damned', 'Dark', 'Dawnbringer', 'Daybreak', 'Dazzling', 'Dead', 'Deer', 'Defender',
	'Delight', 'Den', 'Desert', 'Destined', 'Diadem', 'Diamond', 'Diligent', 'Direwood',
	'Domain', 'Doomed', 'Dove', 'Dragon', 'Dreary', 'Duchy', 'Dune', 'Dusk',
	'Duskbane', 'Dust', 'Eagle', 'Earth', 'East', 'Elder', 'Elm', 'Ember',
	'Emberfall', 'Embermane', 'Emblem', 'Emerald', 'Empire', 'Enchanter', 'Epic', 'Equinox',
	'Erudite', 'Estate', 'Excessive', 'Explorer', 'Extreme', 'Fast', 'Fated', 'Favored',
	'Feather', 'Feral', 'Ferry', 'Fief', 'Field', 'Fierce', 'Fiery', 'Finch',
	'Fire', 'Flag', 'Fleet', 'Fog', 'Folio', 'Foolish', 'Ford', 'Forest',
	'Fort', 'Fortress', 'Fortunate', 'Fountain', 'Fox', 'Fragile', 'Frost', 'Frostborn',
	'Frostmane', 'Fur', 'Furious', 'Furry', 'Gale', 'Garland', 'Garnet', 'Gauntlet',
	'Gentle', 'Gilded', 'Glacier', 'Gladiator', 'Gleaming', 'Glistening', 'Gloomy', 'Glowing',
	'Gold', 'Goldvein', 'Grand', 'Granite', 'Grave', 'Gravel', 'Gray', 'Great',
	'Greave', 'Green', 'Grimoire', 'Grimstone', 'Grimward', 'Grove', 'Guard', 'Guardian',
	'Guild', 'Gust', 'Hail', 'Hammer', 'Harbor', 'Harvest', 'Hasty', 'Hawk',
	'Hay', 'Heaven', 'Helm', 'Hero', 'Heroic', 'Hidden', 'Hill', 'Hollow',
	'Hollowbrook', 'Hollowfen', 'Honorable', 'Horn', 'Host', 'Humble', 'Hunter', 'Ice',
	'Imperial', 'Inescapable', 'Inevitable', 'Inferno', 'Inlet', 'Insightful', 'Intelligent', 'Iron',
	'Ironclad', 'Ironhand', 'Island', 'Isle', 'Jade', 'Jasper', 'Jaw', 'Jay',
	'Just', 'Kind', 'Knife', 'Knight', 'Lair', 'Lake', 'Lance', 'Lane',
	'Large', 'Lark', 'Laurel', 'Leaf', 'Learned', 'Ledge', 'Legend', 'Legion',
	'Lightning', 'Lightwarden', 'Lion', 'Lucky', 'Luminous', 'Mace', 'Mage', 'Majestic',
	'Manor', 'Marble', 'Mark', 'Meadow', 'Mercenary', 'Metal', 'Midnight', 'Mighty',
	'Mineral', 'Mirage', 'Mist', 'Mistvale', 'Modest', 'Monastery', 'Moon', 'Moonshadow',
	'Morning', 'Mountain', 'Mud', 'Muted', 'Mystery', 'Nightfall', 'Nightriver', 'Nightshade',
	'Nimble', 'Noble', 'North', 'Northeast', 'Northwest', 'Oak', 'Oasis', 'Oathkeeper',
	'Obsidian', 'Ocean', 'Old', 'Onyx', 'Opal', 'Order', 'Outrageous', 'Owl',
	'Paladin', 'Parchment', 'Path', 'Pauldron', 'Peaceful', 'Peak', 'Pearl', 'Pebble',
	'Pelt', 'Pennant', 'Perceptive', 'Phoenix', 'Pine', 'Pioneer', 'Placid', 'Plain',
	'Platinum', 'Pompous', 'Port', 'Powerful', 'Prairie', 'Precipice', 'Pride', 'Prosperous',
	'Protector', 'Proud', 'Quartz', 'Quick', 'Quiet', 'Rain', 'Ranger', 'Rapid',
	'Raven', 'Ravensworn', 'Ravenwood', 'Ray', 'Realm', 'Record', 'Redoubt', 'Regal',
	'Regiment', 'Resilient', 'Retreat', 'Rib', 'Ridge', 'Righteous', 'River', 'Road',
	'Robin', 'Robust', 'Rock', 'Root', 'Royal', 'Ruby', 'Rune', 'Sage',
	'Sail', 'Sand', 'Sapient', 'Sapling', 'Savage', 'Scepter', 'Scholar', 'Scout',
	'Sea', 'Seaboard', 'Seal', 'Season', 'Seeker', 'Sentinel', 'Serene', 'Shadow',
	'Shadowmere', 'Shadowy', 'Sharp', 'Shield', 'Shining', 'Ship', 'Shoal', 'Shrine',
	'Silent', 'Silly', 'Silver', 'Silvermoon', 'Sisterhood', 'Sky', 'Smart', 'Snow',
	'Soil', 'Solstice', 'Somber', 'Song', 'Soot', 'Spark', 'Sparkling', 'Spear',
	'Spine', 'Sprout', 'Spry', 'Squirrel', 'Stalwart', 'Standard', 'Star', 'Stargazer',
	'Steady', 'Steel', 'Steppe', 'Still', 'Stone', 'Stonehelm', 'Storm', 'Stormcrow',
	'Stormrider', 'Strong', 'Sturdy', 'Summit', 'Sun', 'Sunrise', 'Sunset', 'Swan',
	'Swift', 'Sword', 'Symbol', 'Tale', 'Talented', 'Talon', 'Temple', 'Tender',
	'Terrible', 'Thorn', 'Thornfield', 'Thornheart', 'Throne', 'Thunder', 'Tiara', 'Tide',
	'Tiger', 'Tough', 'Tower', 'Town', 'Trail', 'Tranquil', 'Tree', 'Triumphant',
	'Tundra', 'Tusk', 'Twilight', 'Unicorn', 'Unlucky', 'Valiant', 'Valley', 'Venerable',
	'Vengeful', 'Victorious', 'Vine', 'Virtue', 'Virtuous', 'Voll', 'Voyage', 'Warden',
	'Warlock', 'Warrior', 'Watchman', 'Wave', 'West', 'Whirlpool', 'White', 'Wild',
	'Wind', 'Wintermere', 'Wise', 'Wizard', 'Wolf', 'Wolfsbane', 'Wood', 'Wraith',
	'Wrathful', 'Wren', 'Wyrmsbane', 'Zephyr'
]);

// Includes names from NPCs from Tibia
const singleNames: string[] = uniq([
	'Aegis', 'Aelric', 'Aelwyn', 'Aeris', 'Aerith', 'Aeron', 'Aethon', 'Aiden',
	'Alden', 'Alder', 'Aldric', 'Alys', 'Aria', 'Aric', 'Ash', 'Bael',
	'Baelor', 'Baldric', 'Bane', 'Bella', 'Birch', 'Blade', 'Bram', 'Bran',
	'Brand', 'Bren', 'Brenna', 'Brennan', 'Briar', 'Brienne', 'Bryn', 'Cade',
	'Cael', 'Caelan', 'Caelia', 'Caelum', 'Catelyn', 'Cedar', 'Cedric', 'Celeste',
	'Cian', 'Clay', 'Cora', 'Corbin', 'Cove', 'Crag', 'Crest', 'Crow',
	'Daenerys', 'Dain', 'Dane', 'Dare', 'Darian', 'Dawn', 'Dax', 'Dell',
	'Derek', 'Diana', 'Dorian', 'Drakon', 'Dread', 'Drift', 'Dusk', 'Eamon',
	'Echo', 'Elara', 'Elden', 'Eldric', 'Eldrin', 'Elena', 'Ember', 'Eris',
	'Ethan', 'Evan', 'Fable', 'Faelan', 'Falric', 'Fang', 'Faye', 'Felix',
	'Fen', 'Fenris', 'Finn', 'Fiona', 'Flint', 'Forge', 'Freyja', 'Gage',
	'Gale', 'Gareth', 'Garric', 'Gavin', 'Gleam', 'Gloom', 'Grace', 'Grey',
	'Grim', 'Gwen', 'Gwyneth', 'Haldir', 'Haldor', 'Haldric', 'Hale', 'Hannah',
	'Hawk', 'Hayden', 'Haze', 'Hazel', 'Helena', 'Hex', 'Hilt', 'Hollow',
	'Holt', 'Hugo', 'Iric', 'Iris', 'Isaac', 'Isolde', 'Ithil', 'Ivan',
	'Ivor', 'Ivy', 'Jace', 'Jade', 'Jareth', 'Jaric', 'Jasmine', 'Jasper',
	'Jax', 'Jewel', 'Jinx', 'Jocelyn', 'Kade', 'Kael', 'Kaelen', 'Kai',
	'Kaldric', 'Kane', 'Katarina', 'Kieran', 'Kira', 'Kite', 'Knell', 'Knight',
	'Lance', 'Lane', 'Lark', 'Leaf', 'Leo', 'Liam', 'Lily', 'Logan',
	'Loric', 'Lorien', 'Luna', 'Lysandra', 'Mace', 'Mael', 'Maelor', 'Maeve',
	'Maldric', 'Mason', 'Max', 'Maya', 'Mira', 'Mire', 'Mist', 'Morgana',
	'Mourn', 'Nate', 'Nathan', 'Niamh', 'Nico', 'Nimrod', 'Nimue', 'Noble',
	'Nolan', 'Nora', 'Noric', 'Nova', 'Odin', 'Olivia', 'Onyx', 'Opal',
	'Ophelia', 'Orb', 'Oric', 'Orion', 'Oscar', 'Owen', 'Pace', 'Paldric',
	'Pax', 'Pearl', 'Persephone', 'Phelan', 'Pike', 'Piper', 'Preston', 'Prism',
	'Quade', 'Quaric', 'Quartz', 'Quell', 'Quest', 'Quill', 'Quincy', 'Quinn',
	'Quorin', 'Rafe', 'Rain', 'Rane', 'Reef', 'Rex', 'Rhaegar', 'Rift',
	'Roran', 'Roric', 'Rose', 'Rowena', 'Ruby', 'Rune', 'Ryder', 'Sable',
	'Sage', 'Saldric', 'Sam', 'Sebastian', 'Selene', 'Seth', 'Shard', 'Shield',
	'Slate', 'Snow', 'Soren', 'Talon', 'Tara', 'Taric', 'Tate', 'Tessa',
	'Thalia', 'Thane', 'Theo', 'Theron', 'Thorin', 'Thrash', 'Tide', 'Tristan',
	'Uldric', 'Ulric', 'Ulysses', 'Uma', 'Umber', 'Una', 'Uri', 'Urn',
	'Ursa', 'Ursula', 'Vaelen', 'Vale', 'Vance', 'Varek', 'Varic', 'Vera',
	'Vesper', 'Vex', 'Vial', 'Victor', 'Violet', 'Vivienne', 'Vow', 'Wade',
	'Waldric', 'Wand', 'Wave', 'Wes', 'Weston', 'Willow', 'Winona', 'Wisp',
	'Wren', 'Wulfgar', 'Wulfric', 'Xander', 'Xanthe', 'Xara', 'Xaric', 'Xavi',
	'Xavier', 'Xenith', 'Xenon', 'Xylo', 'Yan', 'Yara', 'Yarn', 'Yoke',
	'Yoric', 'Yorin', 'Yseult', 'Yves', 'Zachary', 'Zaldric', 'Zane', 'Zara',
	'Zeal', 'Zed', 'Zephyr', 'Zest', 'Zoe'
]);

// Prefixes for names
const prefixes: string[] = uniq([
	"Abbot", "Acolyte", "Adept", "Admiral", "Alchemist", "Ambassador", "Ancient", "Apothecary",
	"Apprentice", "Arbiter", "Archduchess", "Archduke", "Archer", "Architect", "Archmage", "Archpriest",
	"Armorer", "Artificer", "Artisan", "Artist", "Assassin", "Bard", "Baron", "Baroness",
	"Battlemage", "Beastlord", "Beastmaster", "Bishop", "Blacksmith", "Bounty", "Brewer", "Buccaneer",
	"Builder", "Captain", "Cardinal", "Carpenter", "Carver", "Cavalier", "Censor", "Chamberlain",
	"Champion", "Chancellor", "Chef", "Chief", "Chieftain", "Chronicler", "Cleric", "Clerk",
	"Commander", "Commodore", "Conjurer", "Constable", "Cook", "Cooper", "Corsair", "Count",
	"Countess", "Courier", "Courser", "Craftsman", "Crusader", "Dame", "Defender", "Diplomat",
	"Diviner", "Doctor", "Dragoon", "Druid", "Duchess", "Duke", "Earl", "Elder",
	"Emperor", "Empress", "Enchanter", "Engineer", "Envoy", "Evoker", "Exarch", "Executioner",
	"Explorer", "Falconer", "Farrier", "Fletcher", "Former", "Founder", "General", "Gladiator",
	"Goldsmith", "Grand", "Grandmaster", "Gravekeeper", "Guardian", "Guide", "Healer", "Herald",
	"Herbalist", "Hierophant", "High", "Highlord", "Historian", "Hunter", "Illusionist", "Innkeeper",
	"Inquisitor", "Instructor", "Jester", "Jeweler", "Journeyman", "Judge", "Justicar", "Keeper",
	"King", "Knight", "Lady", "Leader", "Learned", "Leatherworker", "Librarian", "Lieutenant",
	"Lord", "Lorekeeper", "Mage", "Magistrate", "Magus", "Marauder", "Marchioness", "Mariner",
	"Marquis", "Marshall", "Mason", "Master", "Mercenary", "Merchant", "Messenger", "Miller",
	"Miner", "Minstrel", "Mistress", "Monk", "Navigator", "Necromancer", "Notary", "Novice",
	"Oracle", "Outrider", "Overseer", "Page", "Painter", "Paladin", "Pathfinder", "Physician",
	"Pilot", "Pioneer", "Pirate", "Poet", "Prince", "Princess", "Privateer", "Professor",
	"Prophet", "Prospector", "Protector", "Ranger", "Reaver", "Reeve", "Regent", "Rogue",
	"Sage", "Sailor", "Scholar", "Scout", "Scribe", "Secretary", "Seer", "Sentinel",
	"Sentry", "Sergeant", "Shaman", "Sheriff", "Shipwright", "Silversmith", "Sir", "Slayer",
	"Smith", "Sorcerer", "Spy", "Steward", "Summoner", "Supreme", "Tailor", "Tanner",
	"Teacher", "Templar", "Thief", "Tracker", "Trader", "Trailblazer", "Trapper", "Troubadour",
	"Vanguard", "Vendor", "Venerable", "Vicar", "Vintner", "Viscount", "Viscountess", "Voivode",
	"Warden", "Warlock", "Warlord", "Warrior", "Watchman", "Wayfarer", "Weaponsmith", "Weaver",
	"Wise", "Zealot"
]);

// Connecting words for names (like "the", "of", etc.)
const connectors: string[] = uniq([
	'of', 'the'
]);

// ---------- Rules ----------

/** Monsters are not characters: "hellfire fighter" is 16, "massive water elemental" 23. */
const DEFAULT_MAX = 30;

/** Whole words, not substrings — a substring match on "god" costs you
 *  "Godslayer" and one on "nig" costs you "Night Stalker". */
const BLOCKED_WORDS = ['fuck', 'nig', 'nigger', 'sux'];

/** The few that must not survive however they are embedded. Deliberately short:
 *  every entry here is a name the generator can never legitimately produce. */
const BLOCKED_FRAGMENTS = ['nigger', 'nigg', 'fuck'];

// ---------- Utilities ----------

export type Rng = () => number;

/** `[min, max)`, off the injected rng. */
function randomInt(rng: Rng, min: number, max: number): number {
	return Math.floor(rng() * (max - min)) + min;
}

function pick(rng: Rng, arr: string[]): string {
	return arr && arr.length ? arr[randomInt(rng, 0, arr.length)] : '';
}

function capWordsPreserve(str: string): string {
	if (!str) return '';
	return String(str)
		.trim()
		.split(/\s+/)
		.map(w => (w[0] ? w[0].toUpperCase() + w.slice(1) : ''))
		.join(' ');
}

function capWordLower(str: string): string {
	if (!str) return '';
	const s = String(str).trim().toLowerCase();
	return s ? s[0].toUpperCase() + s.slice(1) : '';
}

function normalizeSpaces(s: string): string {
	return String(s).replace(/\s+/g, ' ').trim();
}

function enforceMaxLength(name: string, maxLen: number): string {
	if (!name) return '';
	if (!maxLen || maxLen <= 0) return String(name || '');
	const s = String(name);
	return s.length <= maxLen ? s : s.substring(0, maxLen).trim();
}

/** Drops whole words off the end before it resorts to cutting one in half. */
function shortenName(name: string, maxLen: number): string {
	let s = normalizeSpaces(name);
	if (!s || s.length <= maxLen) return s;
	const parts = s.split(' ');
	while (parts.length > 1 && parts.join(' ').length > maxLen) parts.pop();
	s = parts.join(' ');
	if (s.length > maxLen) s = s.slice(0, maxLen).trim();
	s = s.replace(/[\s'-]+$/, '');
	return enforceMaxLength(s, maxLen);
}

/** The portmanteau pattern: half of one word joined to half of another. */
function combineWordHalves(rng: Rng, word1: string, word2: string): string {
	const half1 = Math.floor(word1.length / 2);
	const half2 = Math.floor(word2.length / 2);
	const part1 = rng() < 0.5 ? word1.substring(0, half1) : word1.substring(half1);
	const part2 = rng() < 0.5 ? word2.substring(0, half2) : word2.substring(half2);
	return rng() < 0.5 ? part1 + part2 : part2 + part1;
}

const connectorsList = uniq(connectors.map(s => s.toLowerCase())).sort((a, b) => b.length - a.length);

function escRe(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const connectorPattern = new RegExp(`\\b(?:${connectorsList.map(escRe).join('|')})\\b\\s*$`, 'i');

/** "Alex of the" -> "Alex". */
function removeTrailingConnector(name: string): string {
	let out = normalizeSpaces(String(name || ''));
	if (!out) return out;
	while (connectorPattern.test(out)) out = out.replace(connectorPattern, '').trim();
	return out;
}

const blockedPattern = new RegExp(`\\b(?:${BLOCKED_WORDS.map(escRe).join('|')})\\b`, 'i');

/** Well-formed, in range, and not something to write into a server's data. */
export function isValidName(name: string, maxLength = DEFAULT_MAX): boolean {
	if (!name) return false;
	const s = normalizeSpaces(name);
	if (s.length < 3 || s.length > maxLength) return false;

	const lower = s.toLowerCase();
	if (blockedPattern.test(lower)) return false;
	for (const f of BLOCKED_FRAGMENTS) if (lower.includes(f)) return false;

	if (connectorPattern.test(lower)) return false;
	if (s.includes('  ')) return false;

	const last = s.charAt(s.length - 1);
	if (last === "'" || last === '-') return false;
	// A one-letter first or last word reads as a typo rather than a name.
	if (s.length > 1 && s.charAt(1) === ' ') return false;
	if (s.length > 1 && s.charAt(s.length - 2) === ' ') return false;

	if (!/^[A-Za-z]/.test(s)) return false;
	if (!/^[A-Za-z\s'-]+$/.test(s)) return false;

	return true;
}

function postProcess(name: string, maxLength: number): string {
	const limit = Number(maxLength) > 0 ? Number(maxLength) : DEFAULT_MAX;
	let out = normalizeSpaces(name || '');
	out = shortenName(out, limit);
	out = removeTrailingConnector(out);
	return enforceMaxLength(out, limit);
}

// ---------- Classic ----------

/** One draw from the weighted composition patterns. */
function buildClassic(rng: Rng): string {
	const adjective = pick(rng, adjectives);
	const animal = pick(rng, animals);
	const firstName = pick(rng, firstNameParts);
	const lastName = pick(rng, lastNameParts);
	const singleName = pick(rng, singleNames);
	const prefix = pick(rng, prefixes);
	const connector = pick(rng, connectors);
	const monster = pick(rng, monsters);
	const pattern = rng();

	if (pattern < 0.12) {
		const c = rng();
		if (c < 0.25) return capWordLower(adjective);
		if (c < 0.5) return capWordLower(animal);
		if (c < 0.75) return capWordsPreserve(singleName);
		return capWordLower(monster);
	}
	if (pattern < 0.32) {
		const c = rng();
		if (c < 0.33) {
			const second = rng() < 0.5 ? capWordLower(animal) : capWordLower(monster);
			return `${capWordLower(adjective)} ${second}`;
		}
		if (c < 0.66) return `${capWordsPreserve(firstName)} ${capWordsPreserve(lastName)}`;
		const namePart = rng() < 0.5 ? capWordsPreserve(firstName) : capWordsPreserve(singleName);
		return `${namePart} ${capWordLower(monster)}`;
	}
	if (pattern < 0.4) {
		const w1 = (rng() < 0.5 ? adjective : rng() < 0.5 ? animal : monster).toLowerCase();
		const w2 = (rng() < 0.5 ? adjective : rng() < 0.5 ? animal : monster).toLowerCase();
		return capWordLower(combineWordHalves(rng, w1, w2).replace(/[^a-z'-]/g, ''));
	}
	if (pattern < 0.52) {
		const c = rng();
		if (c < 0.25) return `${prefix} ${capWordsPreserve(firstName)}`;
		if (c < 0.5) return `${prefix} ${capWordsPreserve(singleName)}`;
		if (c < 0.75) return `${prefix} ${capWordLower(animal)}`;
		return `${prefix} ${capWordLower(monster)}`;
	}
	if (pattern < 0.92) {
		const namePart = rng() < 0.5 ? capWordsPreserve(firstName) : capWordsPreserve(singleName);
		const c = rng();
		const second =
			c < 0.25
				? capWordLower(adjective)
				: c < 0.5
					? capWordLower(animal)
					: c < 0.75
						? capWordLower(monster)
						: capWordsPreserve(lastName);
		// The middle of the three bands prefixes the same shape; the others do not.
		return pattern >= 0.67 && pattern < 0.82
			? `${prefix} ${namePart} ${connector} ${second}`
			: `${namePart} ${connector} ${second}`;
	}
	if (rng() < 0.5) return `${prefix} ${capWordsPreserve(firstName)} ${capWordsPreserve(lastName)}`;
	return `${capWordsPreserve(firstName)} ${connector} ${capWordsPreserve(lastName)}`;
}

// ---------- Corpus ----------

export interface CorpusTokens {
	heads: string[];
	tails: string[];
}

/**
 * Tokens worth recombining, out of the corpus's own monster names.
 *
 * Two-token names are what a themed corpus is mostly made of ("frost dragon",
 * "shadow warden"), and their halves recombine into names that belong to the
 * same world. Single-word names have nothing to recombine and are left out
 * rather than emitted back unchanged.
 */
export function corpusTokens(names: string[]): CorpusTokens {
	const heads: string[] = [];
	const tails: string[] = [];
	for (const raw of names) {
		const parts = normalizeSpaces(raw.toLowerCase()).split(' ');
		if (parts.length < 2) continue;
		const head = parts[0];
		const tail = parts[parts.length - 1];
		if (/^[a-z'-]{3,}$/.test(head)) heads.push(head);
		if (/^[a-z'-]{3,}$/.test(tail)) tails.push(tail);
	}
	return { heads: uniq(heads), tails: uniq(tails) };
}

function buildCorpus(rng: Rng, tokens: CorpusTokens): string {
	const head = pick(rng, tokens.heads);
	const tail = pick(rng, tokens.tails);
	if (!head || !tail) return '';
	return `${capWordLower(head)} ${capWordLower(tail)}`;
}

// ---------- The API the wizard uses ----------

export type NameStyle = 'classic' | 'corpus';

export interface NameOptions {
	maxLength?: number;
	/** The registry check. A name the corpus already owns is redrawn, because
	 *  `create` rejects it and the server keys both monsters the same. */
	taken?: (name: string) => boolean;
	/** Corpus monster names, for `corpus` style. Ignored by `classic`. */
	corpusNames?: string[];
}

/**
 * A valid, unused monster name, or '' when forty draws could not find one.
 *
 * Forty is the upstream figure and is generous: the patterns rarely produce an
 * invalid name, and the retry loop is really there for the uniqueness check on
 * a corpus that already owns most of what a small token pool can make.
 */
export function generateName(style: NameStyle, rng: Rng, opts: NameOptions = {}): string {
	const max = opts.maxLength && opts.maxLength > 0 ? opts.maxLength : DEFAULT_MAX;
	const tokens = style === 'corpus' ? corpusTokens(opts.corpusNames ?? []) : { heads: [], tails: [] };
	// Corpus style with nothing to recombine is not an error the caller can act
	// on — a fresh corpus simply has no names yet — so it falls back to classic
	// rather than returning empty and leaving the field blank.
	const useCorpus = style === 'corpus' && tokens.heads.length > 0 && tokens.tails.length > 0;

	for (let attempt = 0; attempt < 40; attempt++) {
		const raw = useCorpus ? buildCorpus(rng, tokens) : buildClassic(rng);
		const candidate = postProcess(raw, max);
		if (!isValidName(candidate, max)) continue;
		if (opts.taken?.(candidate)) continue;
		return candidate;
	}
	return '';
}
