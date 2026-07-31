-- BlackTek is TFS 1.x in Lua: a flags table, but the numeric settings sit at
-- the top level beside it rather than inside. `pushable` is written explicitly
-- here on purpose -- BlackTek's canPushCreatures override applies only when
-- pushable was left unset, which is the case a bool profile gets wrong.
local mtype = Game.createMonsterType("Probe Blob")
local monster = {}

monster.name = "Probe Blob"
monster.description = "a probe blob"
monster.experience = 250
monster.race = "venom"
monster.maxHealth = 250
monster.health = 250
monster.speed = 180
monster.manaCost = 0
monster.corpse = 9962
monster.outfit = { lookType = 314 }
monster.changeTarget = {
    interval = 5000,
    chance = 0,
}
monster.targetDistance = 1
monster.staticAttackChance = 85
monster.runHealth = 20
monster.maxSummons = 1
monster.flags = {
    summonable = false,
    attackable = true,
    hostile = true,
    illusionable = false,
    convinceable = false,
    pushable = true,
    canPushItems = true,
    canPushCreatures = true,
    canWalkOnEnergy = false,
    canWalkOnFire = false,
}
monster.summons = {
    { name = "Probe Blob", chance = 10, interval = 4000, max = 1 },
}
monster.attacks = {
    {
        name = "melee",
        interval = 2000,
        minDamage = 0,
        maxDamage = -80,
    },
    {
        name = "earth",
        interval = 2000,
        chance = 30,
        minDamage = -10,
        maxDamage = -20,
        radius = 4,
        target = false,
        effect = CONST_ME_HITBYPOISON,
    },
}
monster.defenses = {
    defense = 20,
    armor = 20,
    {
        name = "healing",
        interval = 4000,
        chance = 15,
        minDamage = 30,
        maxDamage = 60,
        effect = CONST_ME_MAGIC_BLUE,
        target = false,
    },
}
monster.elements = {
    { type = COMBAT_PHYSICALDAMAGE, percent = 0 },
    { type = COMBAT_EARTHDAMAGE, percent = 100 },
    { type = COMBAT_FIREDAMAGE, percent = -10 },
}
monster.immunities = {
    { type = "paralyze", condition = true },
    { type = "invisible", condition = true },
}
monster.voices = {
    interval = 5000,
    chance = 10,
    { text = "Blub.", yell = false },
}
monster.loot = {
    { name = "gold coin", chance = 70000, maxCount = 20 },
}

mtype:register(monster)
