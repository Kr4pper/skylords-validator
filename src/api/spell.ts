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