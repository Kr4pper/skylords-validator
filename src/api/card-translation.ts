export interface CardTranslation {
    "Id": number,
    "LocaType": CardLocaType,
    "Text": string,
}

export enum CardLocaType {
    ClassName = 1,
    Name = 2,
    Description = 3,
    UpgradeTemplate = 5,
    TooltipNameTemplate = 6,
    TooltipTextTemplate = 7,
}
