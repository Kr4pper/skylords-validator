export interface Spell {
    "Version": number,
    "Id": number,
    "SpellLine": SpellLine,
    "Flags": number,
    "ResTarget": number,
    "FlagsVis": false,
    "FlagsLayer": number,
    "MinRange": number,
    "MaxRange": number,
    "CastSteps": number,
    "ResolveSteps": number,
    "RecastSteps": number,
    "Faction": number,
    "AnimationTagId": number,
    "VisLookAtInterest": number,
    "ProductionPower": number,
    "ProductionTime": number,
    "IconMesh": string,
    "IconImage": {
        "Icon": string,
        "Artwork": string,
    },
    "ParametersContainer": {
        "Version": number,
        "Parameters": {
            "Id": number,
            "Value": number,
            "Type": number,
        }[];
    },
    "EffectsContainer": {
        "Version": number,
        "Effects": number[],
    },
    "SpellConditionReferenceContainer": {
        "Version": number,
        "References": number[],
    },
    "SpellRuleReferenceContainer": {
        "Version": number,
        "References": number[],
    },
    "Previews": number[],
    "Classes": number[],
}

enum SpellLine {
    ProjectileUnitBuildingBarrier = 103,
    SpellFork = 150,
}

export enum SpellParameterId {
    WeaponType = 129,
    DamageAgainstFigures = 130,
    DamageAgainstBuildings = 131,
    DamageAgainstWalls = 137,
    Projectile = 278,
    FlameThrowerAbility = 371,
    AbilityOnTarget = 374,
    AbilityOnTarget2 = 375,
    GainOnTrueSourceFalseTarget = 383,
    GainOnTrueAreaUnderTarget = 384, // unsure
    AbilityToGain = 386,
    DamageAgainstSquad = 440,
    PoisonInitialDmgSpell = 456,
    PoisonDmgSpell = 457,
    AbilityToGain2 = 464,
    AbilityToGain3 = 465,
    AbilityToGain4 = 466,
    AbilityToGain5 = 467,
    AbilityToGain6 = 468,
    SuicideBombSpell = 557,
}

export const SPELL_GAIN_ABILITY_IDS = [
    SpellParameterId.AbilityToGain,
    SpellParameterId.AbilityToGain2,
    SpellParameterId.AbilityToGain3,
    SpellParameterId.AbilityToGain4,
    SpellParameterId.AbilityToGain5,
    SpellParameterId.AbilityToGain6,
];

export const SPELL_DMG_ABILITY_REF_IDS = [
    ...SPELL_GAIN_ABILITY_IDS,
    SpellParameterId.FlameThrowerAbility,
    SpellParameterId.AbilityOnTarget,
    SpellParameterId.AbilityOnTarget2,
]
