export interface Spell {
    "Version": number,
    "Id": number,
    "SpellLine": number,
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

export enum SpellParameterId {
    WeaponType = 129,
    DamageAgainstFigures = 130,
    DamageAgainstBuildings = 131,
    DamageAgainstWalls = 137,
    Projectile = 278,
    FlameThrower = 371,
    AbilityOnTarget = 374,
    AbilityOnTarget2 = 375,
    GainOnTrueSourceFalseTarget = 383,
    GainOnTrueAreaUnderTarget = 384, // unsure
    AbilityToGain = 386,
    PoisonInitialDmgSpell = 456,
    PoisonDmgSpell = 457,
    AbilityToGain2 = 464,
    AbilityToGain3 = 465,
    AbilityToGain4 = 466,
    AbilityToGain5 = 467,
    AbilityToGain6 = 468,
    SuicideBomb = 557,
}

export const SPELL_GAINED_ABILITY_IDS = [
    SpellParameterId.AbilityToGain,
    SpellParameterId.AbilityToGain2,
    SpellParameterId.AbilityToGain3,
    SpellParameterId.AbilityToGain4,
    SpellParameterId.AbilityToGain5,
    SpellParameterId.AbilityToGain6,
];
