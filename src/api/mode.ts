export interface Mode {
    "Version": number,
    "Id": number,
    "Type": number,
    "Flags": number,
    "AutoExitTargetModeId": number,
    "ProductionPower": number,
    "ProductionTime": number,
    "IconImage": {
        "Icon": string,
        "Artwork": string;
    },
    "ModeAbilities": number[],
    "ModeSpells": number[],
    "ModeUnitAbilities": number[],
    "ModeUnitSpells": number[],
    "AutoExitModeConditions": {
        "Version": number,
        "References": number[];
    },
    "EnterModeConditions": {
        "Version": number,
        "References": number[];
    };
}