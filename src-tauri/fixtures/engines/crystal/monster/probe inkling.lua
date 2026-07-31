-- Crystal is a fork of Canary, and most files are identical between the two.
-- What detection has to win on is here: respawnType, COMBAT_AGONYDAMAGE, and a
-- constant from the renamed 272-303 effect block that Canary does not define.
local mType = Game.createMonsterType("Probe Inkling")
local monster = {}

monster.description = "a probe inkling"
monster.experience = 900
monster.outfit = {
	lookType = 306,
	lookHead = 0,
	lookBody = 0,
	lookLegs = 0,
	lookFeet = 0,
	lookAddons = 0,
	lookMount = 0,
}

monster.raceId = 9301
monster.Bestiary = {
	class = "Inkborn",
	race = BESTY_RACE_INKBORN,
	toKill = 1000,
	FirstUnlock = 50,
	SecondUnlock = 500,
	CharmsPoints = 25,
	Stars = 3,
	Occurrence = 0,
	Locations = "Nowhere in particular.",
}

monster.health = 1400
monster.maxHealth = 1400
monster.race = "venom"
monster.corpse = 6079
monster.speed = 200
monster.manaCost = 0

monster.respawnType = {
	period = RESPAWNPERIOD_NIGHT,
	underground = false,
}

monster.changeTarget = {
	interval = 4000,
	chance = 10,
}

monster.strategiesTarget = {
	nearest = 80,
	random = 20,
}

monster.flags = {
	summonable = false,
	attackable = true,
	hostile = true,
	convinceable = false,
	pushable = false,
	rewardBoss = false,
	illusionable = false,
	canPushItems = true,
	canPushCreatures = true,
	staticAttackChance = 90,
	targetDistance = 1,
	runHealth = 0,
	healthHidden = false,
	canWalkOnEnergy = false,
	canWalkOnFire = false,
	canWalkOnPoison = true,
}

monster.light = {
	level = 0,
	color = 0,
}

monster.voices = {
	interval = 5000,
	chance = 10,
	{ text = "Blorp.", yell = false },
}

monster.loot = {
	{ name = "gold coin", chance = 80000, maxCount = 50 },
}

monster.attacks = {
	{ name = "melee", interval = 2000, chance = 100, minDamage = 0, maxDamage = -180 },
	{ name = "combat", interval = 2000, chance = 20, type = COMBAT_AGONYDAMAGE, minDamage = -100, maxDamage = -200, radius = 4, effect = CONST_ME_AGONY, target = false },
	{ name = "combat", interval = 3000, chance = 15, type = COMBAT_ENERGYDAMAGE, minDamage = -80, maxDamage = -140, length = 5, effect = CONST_ME_WHITE_ENERGYPULSE },
}

monster.defenses = {
	defense = 40,
	armor = 40,
	mitigation = 1.5,
}

monster.elements = {
	{ type = COMBAT_PHYSICALDAMAGE, percent = 0 },
	{ type = COMBAT_ENERGYDAMAGE, percent = 20 },
	{ type = COMBAT_EARTHDAMAGE, percent = 100 },
	{ type = COMBAT_FIREDAMAGE, percent = -10 },
	{ type = COMBAT_AGONYDAMAGE, percent = 100 },
}

monster.immunities = {
	{ type = "paralyze", condition = true },
	{ type = "outfit", condition = false },
	{ type = "invisible", condition = true },
	{ type = "bleed", condition = false },
}

mType:register(monster)
