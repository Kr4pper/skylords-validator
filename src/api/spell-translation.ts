export interface SpellTranslation {
    "Id": number,
    "LocaType": number,
    "Text": string,
}

export interface SpellLoca {
    "Id": number,
    "Values": {
        "Id": SpellLocaType,
        "Text": string,
        "Unknown1": boolean,
    }[],
}

export enum SpellLocaType {
    Name = 2,
    Description = 3,
    MinDmg = 6,
    MaxDmg = 7,
    AtkCooldown = 8,
    SpellCooldown = 12,
    Duration = 13,
    Radius = 14,
    DelaySeconds = 35,
    UpgradeAddMinDmg = 99,
    UpgradeAddMaxDmg = 100,
    UpgradeAddMinDmgVsStructure = 101,
    FlatPowerCostModifier = 121,
    ActiveMaxDmg = 163,
    ActiveMinDmg = 164,
}
