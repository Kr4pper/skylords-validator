export interface AbilityLoca {
    "Id": number,
    "Values": {
        "Id": AbilityLocaType,
        "Text": string,
        "Unknown1": boolean;
    }[];
}

export enum AbilityLocaType {
    NewValue = 15,
    FlatIncrease = 92,
}
