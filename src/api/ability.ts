export interface Ability {
    "Version": number,
    "Id": number,
    "AbilityLine": number,
    "Priority": number,
    "HideInUi": false,
    "Faction": number,
    "DurationSteps": number,
    "FinishingSpellId": number,
    "Icon": string,
    "BuffCategory": number,
    "Previews": number[],
    "ParametersContainer": {
        "Version": number,
        "Parameters": {
            "Id": number,
            "Value": number,
            "Type": number,
        }[],
    },
    "EffectsContainer": {
        "Version": number,
        "Effects": number[],
    },
}

export enum AbilityParameterIds {
    DamageOnSingleUnit = 362,
    DamageOnSingleStructure = 437,
    TotalCombinedDamage = 364,
}