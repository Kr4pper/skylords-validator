export interface ModeLoca {
    "Id": number,
    "Values":
    {
        "Id": ModeLocaType,
        "Text": string,
        "Unknown1": boolean,
    }[];
}

export enum ModeLocaType {
    HealthModifier = 94,
    Dp20Modifier = 120,
    Dp20Modifier2 = 128,
    HealthModifier2 = 128,
    HealthModifier3 = 140,
}
