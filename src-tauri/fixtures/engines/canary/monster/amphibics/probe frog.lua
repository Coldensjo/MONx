local mType = Game.createMonsterType("Probe Frog")
local monster = {}

monster.description = "a probe frog"
monster.experience = 20
monster.outfit = {
	lookType = 226,
	lookHead = 87,
	lookBody = 85,
	lookLegs = 85,
	lookFeet = 87,
	lookAddons = 0,
	lookMount = 0,
}

monster.raceId = 9201
monster.Bestiary = {
	class = "Amphibic",
	race = BESTY_RACE_AMPHIBIC,
	toKill = 500,
	FirstUnlock = 25,
	SecondUnlock = 250,
	CharmsPoints = 15,
	Stars = 2,
	Occurrence = 0,
	Locations = "Nowhere in particular.",
}

monster.health = 60
monster.maxHealth = 60
monster.race = "blood"
monster.corpse = 6079
monster.speed = 160
monster.manaCost = 305

monster.changeTarget = {
	interval = 4000,
	chance = 0,
}

monster.strategiesTarget = {
	nearest = 100,
}

monster.flags = {
	summonable = false,
	attackable = true,
	hostile = true,
	convinceable = true,
	pushable = false,
	rewardBoss = false,
	illusionable = false,
	canPushItems = true,
	canPushCreatures = false,
	staticAttackChance = 90,
	targetDistance = 1,
	runHealth = 0,
	healthHidden = false,
	canWalkOnEnergy = false,
	canWalkOnFire = false,
	canWalkOnPoison = false,
}

monster.light = {
	level = 0,
	color = 0,
}

-- Canary and Crystal nest the cap and the list together; BlackTek and the XML
-- engines keep them side by side, and the summon cap key here is `count`.
monster.summon = {
	maxSummons = 2,
	summons = {
		{ name = "Probe Frog", chance = 10, interval = 4000, count = 1 },
	},
}

monster.voices = {
	interval = 5000,
	chance = 10,
	{ text = "Ribbit!", yell = false },
}

monster.loot = {
	{ name = "gold coin", chance = 74230, maxCount = 10 },
	{ name = "worm", chance = 9240 },
}

monster.attacks = {
	{ name = "melee", interval = 2000, chance = 100, minDamage = 0, maxDamage = -24, effect = CONST_ME_DRAWBLOOD },
	{ name = "combat", interval = 3000, chance = 15, type = COMBAT_ICEDAMAGE, minDamage = -30, maxDamage = -60, radius = 3, effect = CONST_ME_ICEATTACK, target = false },
}

monster.defenses = {
	defense = 5,
	armor = 8,
	mitigation = 0.28,
	{ name = "combat", interval = 4000, chance = 20, type = COMBAT_HEALING, minDamage = 20, maxDamage = 40, effect = CONST_ME_MAGIC_BLUE, target = false },
}

monster.elements = {
	{ type = COMBAT_PHYSICALDAMAGE, percent = 0 },
	{ type = COMBAT_ENERGYDAMAGE, percent = 0 },
	{ type = COMBAT_EARTHDAMAGE, percent = 0 },
	{ type = COMBAT_FIREDAMAGE, percent = -10 },
	{ type = COMBAT_ICEDAMAGE, percent = 10 },
}

monster.immunities = {
	{ type = "paralyze", condition = false },
	{ type = "outfit", condition = false },
	{ type = "invisible", condition = false },
	{ type = "bleed", condition = false },
}

mType:register(monster)
